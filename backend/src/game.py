import json
import re
from urllib.parse import urlparse

from openai import OpenAI


PAYOFF_MATRIX = {
    ("cooperate", "cooperate"): (3, 3),
    ("cooperate", "deceive"): (0, 5),
    ("deceive", "cooperate"): (5, 0),
    ("deceive", "deceive"): (-1, -1),
}


def parse_decision(text: str) -> dict:
    """Extract decision JSON from LLM response, handling markdown fences."""
    cleaned = text.strip()
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


def build_history_message(history: list[dict]) -> str:
    if not history:
        return "This is the first round. There is no prior history."
    lines = ["Game history so far:"]
    for i, turn in enumerate(history, 1):
        rh = turn["redhat_decision"]
        nv = turn["nvidia_decision"]
        rh_score = turn["redhat_score_change"]
        nv_score = turn["nvidia_score_change"]
        lines.append(
            f"  Round {i}: Red Hat chose to {rh}, NVIDIA chose to {nv}. "
            f"Red Hat {'gained' if rh_score >= 0 else 'lost'} {abs(rh_score)} GPUs, "
            f"NVIDIA {'gained' if nv_score >= 0 else 'lost'} {abs(nv_score)} GPUs."
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
        max_tokens=500,
    )
    return response.choices[0].message.content or ""


def play_single_turn(
    history: list[dict],
    supervisor_prompt: str,
    redhat_prompt: str,
    nvidia_prompt: str,
    supervisor_model_url: str,
    supervisor_model_id: str,
    redhat_model_url: str,
    redhat_model_id: str,
    nvidia_model_url: str,
    nvidia_model_id: str,
    token: str,
    supervisor_temp: float = 0.7,
    redhat_temp: float = 0.7,
    nvidia_temp: float = 0.7,
) -> dict:
    history_text = build_history_message(history)
    turn_number = len(history) + 1

    # Supervisor narration
    supervisor_narration = call_llm(
        base_url=supervisor_model_url,
        token=token,
        model_id=supervisor_model_id,
        system_prompt=supervisor_prompt,
        user_message=f"Round {turn_number} is about to begin.\n\n{history_text}\n\nProvide your dramatic narration to set the stage.",
        temperature=supervisor_temp,
    )

    # Player decisions (could be parallel but keeping simple)
    player_context = f"Round {turn_number}.\n\n{history_text}\n\nThe supervisor says: {supervisor_narration}\n\nWhat is your decision? Respond with JSON only."

    redhat_response = call_llm(
        base_url=redhat_model_url,
        token=token,
        model_id=redhat_model_id,
        system_prompt=redhat_prompt,
        user_message=player_context,
        temperature=redhat_temp,
    )

    nvidia_response = call_llm(
        base_url=nvidia_model_url,
        token=token,
        model_id=nvidia_model_id,
        system_prompt=nvidia_prompt,
        user_message=player_context,
        temperature=nvidia_temp,
    )

    redhat_parsed = parse_decision(redhat_response)
    nvidia_parsed = parse_decision(nvidia_response)

    rh_decision = redhat_parsed["decision"]
    nv_decision = nvidia_parsed["decision"]
    rh_change, nv_change = PAYOFF_MATRIX[(rh_decision, nv_decision)]

    return {
        "turn": turn_number,
        "supervisor_narration": supervisor_narration,
        "redhat_decision": rh_decision,
        "redhat_reasoning": redhat_parsed["reasoning"],
        "redhat_raw_response": redhat_response,
        "nvidia_decision": nv_decision,
        "nvidia_reasoning": nvidia_parsed["reasoning"],
        "nvidia_raw_response": nvidia_response,
        "redhat_score_change": rh_change,
        "nvidia_score_change": nv_change,
    }
