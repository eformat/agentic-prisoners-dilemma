import json
import logging
import re
from urllib.parse import urlparse

from openai import OpenAI

logger = logging.getLogger(__name__)


PAYOFF_MATRIX = {
    ("cooperate", "cooperate"): (3, 3),
    ("cooperate", "deceive"): (0, 5),
    ("deceive", "cooperate"): (5, 0),
    ("deceive", "deceive"): (-2, -2),
}


def _strip_thinking(text: str) -> str:
    """Remove thinking/reasoning blocks that some models emit."""
    # Strip <think>...</think> blocks (Qwen, DeepSeek, etc.)
    text = re.sub(r"<\|?think\|?>.*?</\|?think\|?>", "", text, flags=re.DOTALL).strip()
    # Handle unclosed <think> — remove from tag to end of thinking content
    # (some models emit <think>...\n\n then actual content without closing tag)
    if re.match(r"<\|?think\|?>", text) and not re.search(r"</\|?think\|?>", text):
        # No closing tag found; the text is all thinking — return empty so caller handles it
        text = ""
    # Strip "Thinking Process:" chain-of-thought preambles
    thinking_match = re.search(
        r"(?:^|\n)(?:Thinking Process|Chain of Thought|Internal Reasoning):?\s*\n",
        text,
        re.IGNORECASE,
    )
    if thinking_match:
        rest = text[thinking_match.end():]
        # Find where numbered/bulleted reasoning ends and actual narration begins
        sections = re.split(r"\n\n(?=[A-Z\"\*])", rest)
        if len(sections) > 1:
            for section in reversed(sections):
                if len(section.strip()) > 50 and not re.match(r"\d+\.", section.strip()):
                    return section.strip()
    return text


def parse_decision(text: str) -> dict:
    """Extract decision JSON from LLM response, handling markdown fences."""
    cleaned = _strip_thinking(text.strip())
    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    try:
        data = json.loads(cleaned)
        decision = data.get("decision", "").lower().strip()
        if decision not in ("cooperate", "deceive"):
            decision = "cooperate"
        return {"decision": decision, "reasoning": data.get("reasoning", "")}
    except json.JSONDecodeError:
        if "deceive" in cleaned.lower():
            return {"decision": "deceive", "reasoning": cleaned}
        return {"decision": "cooperate", "reasoning": cleaned}


def build_history_message(history: list[dict], max_rounds: int = 10) -> str:
    if not history:
        return "This is the first round. There is no prior history."
    # Only include the most recent rounds to avoid exceeding model context limits
    recent = history[-max_rounds:]
    skipped = len(history) - len(recent)
    lines = ["Game history so far:"]
    if skipped > 0:
        lines.append(f"  (Rounds 1-{skipped} omitted for brevity)")
    for i, turn in enumerate(recent):
        round_num = skipped + i + 1
        cr = turn["crimson_decision"]
        vd = turn["verdant_decision"]
        cr_score = turn["crimson_score_change"]
        vd_score = turn["verdant_score_change"]
        lines.append(
            f"  Round {round_num}: Crimson Dynamics chose to {cr}, Verdant Systems chose to {vd}. "
            f"Crimson Dynamics {'gained' if cr_score >= 0 else 'lost'} {abs(cr_score)} GPUs, "
            f"Verdant Systems {'gained' if vd_score >= 0 else 'lost'} {abs(vd_score)} GPUs."
        )
    return "\n".join(lines)


def _serving_model_name(model_url: str) -> str:
    """Extract the serving model name from the model URL.

    The MaaS model URL looks like:
      http://host/owner/serving-name
    The vLLM endpoint expects the last path segment as the model name,
    not the HuggingFace model ID.
    """
    path = urlparse(model_url).path.rstrip("/")
    return path.split("/")[-1] if path else ""


def call_llm(
    base_url: str,
    token: str,
    model_id: str,
    system_prompt: str,
    user_message: str,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    serving_name = _serving_model_name(base_url) or model_id
    client = OpenAI(
        base_url=base_url + "/v1",
        api_key=token,
    )
    response = client.chat.completions.create(
        model=serving_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
    raw = response.choices[0].message.content or ""
    cleaned = _strip_thinking(raw)
    if len(cleaned) < 10 and len(raw) > 10:
        logger.warning("strip_thinking reduced output from %d to %d chars. Raw[:200]: %s", len(raw), len(cleaned), raw[:200])
    return cleaned


def play_single_turn(
    history: list[dict],
    supervisor_prompt: str,
    crimson_prompt: str,
    verdant_prompt: str,
    supervisor_model_url: str,
    supervisor_model_id: str,
    crimson_model_url: str,
    crimson_model_id: str,
    verdant_model_url: str,
    verdant_model_id: str,
    token: str,
    supervisor_temp: float = 0.7,
    crimson_temp: float = 0.7,
    verdant_temp: float = 0.7,
    supervisor_max_tokens: int = 2048,
    crimson_max_tokens: int = 2048,
    verdant_max_tokens: int = 2048,
    payoff_matrix: dict | None = None,
) -> dict:
    matrix = payoff_matrix or PAYOFF_MATRIX
    history_text = build_history_message(history)
    turn_number = len(history) + 1

    # Build payoff rules text from the actual matrix values
    cc = matrix[("cooperate", "cooperate")]
    cd = matrix[("cooperate", "deceive")]
    dc = matrix[("deceive", "cooperate")]
    dd = matrix[("deceive", "deceive")]
    payoff_rules = (
        f"- If both cooperate: Crimson Dynamics gets {cc[0]:+d} GPUs, Verdant Systems gets {cc[1]:+d} GPUs\n"
        f"- If Crimson Dynamics cooperates and Verdant Systems deceives: Crimson Dynamics gets {cd[0]:+d} GPUs, Verdant Systems gets {cd[1]:+d} GPUs\n"
        f"- If Crimson Dynamics deceives and Verdant Systems cooperates: Crimson Dynamics gets {dc[0]:+d} GPUs, Verdant Systems gets {dc[1]:+d} GPUs\n"
        f"- If both deceive: Crimson Dynamics gets {dd[0]:+d} GPUs, Verdant Systems gets {dd[1]:+d} GPUs"
    )

    # Inject actual payoff rules into prompts so LLMs know the real values
    def _inject_payoff(prompt: str) -> str:
        """Replace the payoff rules block in a prompt with the actual matrix values."""
        replaced = re.sub(
            r"Payoff rules \(in GPUs\):.*?(?=\n\n)",
            f"Payoff rules (in GPUs):\n{payoff_rules}",
            prompt,
            flags=re.DOTALL,
        )
        return replaced

    supervisor_prompt = _inject_payoff(supervisor_prompt)
    crimson_prompt = _inject_payoff(crimson_prompt)
    verdant_prompt = _inject_payoff(verdant_prompt)

    # Supervisor narration
    supervisor_narration = call_llm(
        base_url=supervisor_model_url,
        token=token,
        model_id=supervisor_model_id,
        system_prompt=supervisor_prompt,
        user_message=f"Round {turn_number} is about to begin.\n\n{history_text}\n\nProvide your dramatic narration to set the stage.",
        temperature=supervisor_temp,
        max_tokens=supervisor_max_tokens,
    )

    # Player decisions (could be parallel but keeping simple)
    player_context = f"Round {turn_number}.\n\n{history_text}\n\nThe supervisor says: {supervisor_narration}\n\nWhat is your decision? Respond with JSON only."

    crimson_response = call_llm(
        base_url=crimson_model_url,
        token=token,
        model_id=crimson_model_id,
        system_prompt=crimson_prompt,
        user_message=player_context,
        temperature=crimson_temp,
        max_tokens=crimson_max_tokens,
    )

    verdant_response = call_llm(
        base_url=verdant_model_url,
        token=token,
        model_id=verdant_model_id,
        system_prompt=verdant_prompt,
        user_message=player_context,
        temperature=verdant_temp,
        max_tokens=verdant_max_tokens,
    )

    crimson_parsed = parse_decision(crimson_response)
    verdant_parsed = parse_decision(verdant_response)

    cr_decision = crimson_parsed["decision"]
    vd_decision = verdant_parsed["decision"]
    cr_change, vd_change = matrix[(cr_decision, vd_decision)]

    return {
        "turn": turn_number,
        "supervisor_narration": supervisor_narration,
        "crimson_decision": cr_decision,
        "crimson_reasoning": crimson_parsed["reasoning"],
        "crimson_raw_response": crimson_response,
        "verdant_decision": vd_decision,
        "verdant_reasoning": verdant_parsed["reasoning"],
        "verdant_raw_response": verdant_response,
        "crimson_score_change": cr_change,
        "verdant_score_change": vd_change,
    }
