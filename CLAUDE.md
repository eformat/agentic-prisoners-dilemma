# agent prisoners dilema

Agentic game based on prisoners dilemma.

The two players are "Red Hat" and "NVIDIA".

## architecture

we have a frontend (node.js/next.js) and a backend (python).

base the backend agent architecture on /home/mike/git/voice-agents/ai-voice-agent/backend/src/

base the frontend ui on /home/mike/git/voice-agents/ai-voice-agent/frontend

## gameplay

Red Hat and Nvidia are locked in a prisoners dilemma and must decide if they wish to co-operate in the high stakes game of "The Business AI Game (BAG)".

Each player chooses whether to "cooperate" or "deceive".

The prizes are valued in "numbers of GPUs"

This leads to three different possible outcomes for the players Red Hat and Nvidia:

If Red Hat and NVIDIA both choose to deceive, neither of them get a GPU.
If one choose to cooperate but the other doesn’t, the one cooperating gets nothing while the other looses a GPU.
If Red Hat and NVIDIA both deceive each other, they will each loose 2 GPUs.

## ui

There should be 3 text boxes containing the prompts.

---------------------------
|  supervisor prompt      |
---------------------------

---------------------------  ---------------------------  
|  Red Hat prompt         |  |  NVIDIA prompt          |
---------------------------  ---------------------------

That way each turn can have the prompt changed.

There should be a Score for each player - number of GPUs.

Add a big "Start Turn" at the top of the screen that plays one turn.

Each agent (supervisor, redhat, nvidia) should have an LLM Model Selector. The models and token are gotten using the equivalent of these commands.

```bash
HOST=https://maas.apps.ocp.cloud.rhai-tmm.dev

TOKEN_RESPONSE=$(curl -sSk \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"expiration": "720h"}' \
  "${HOST}/maas-api/v1/tokens") && \
TOKEN=$(echo $TOKEN_RESPONSE | jq -r .token) && \
echo "Token obtained: ${TOKEN:0:20}..."

MODELS=$(curl -sSk ${HOST}/maas-api/v1/models \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" | jq -r .) && \
echo $MODELS | jq .
```

The output looks like:

```bash
Token obtained: eyJhbGciOiJSUzI1NiIs...
{
  "data": [
    {
      "id": "llama-4-scout-17b-16e-w4a16",
      "created": 1773209690,
      "object": "model",
      "owned_by": "prelude-maas",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/llama-4-scout-17b-16e-w4a16",
      "ready": true,
      "modelDetails": {
        "displayName": "Llama-4-Scout-17B-16E-W4A16"
      }
    },
    {
      "id": "Qwen/Qwen3.5-9B",
      "created": 1772938823,
      "object": "model",
      "owned_by": "prelude-maas",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/qwen35-9b",
      "ready": true,
      "modelDetails": {
        "displayName": "qwen35-9b"
      }
    },
    {
      "id": "RedHatAI/Qwen2.5-VL-7B-Instruct-FP8-Dynamic",
      "created": 1772939058,
      "object": "model",
      "owned_by": "prelude-maas",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/qwen25-vl-7b-instruct-fp8",
      "ready": true,
      "modelDetails": {
        "displayName": "qwen25-vl-7b-instruct-fp8"
      }
    },
    {
      "id": "ibm-granite/granite-vision-3.2-2b",
      "created": 1772939058,
      "object": "model",
      "owned_by": "prelude-maas",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/granite-vision-32-2b",
      "ready": true,
      "modelDetails": {
        "displayName": "granite-vision-3.2-2b"
      }
    },
    {
      "id": "RedHatAI/llama-3.2-3b-instruct",
      "created": 1773096678,
      "object": "model",
      "owned_by": "prelude-maas",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/llama-32-3b",
      "ready": true,
      "modelDetails": {
        "displayName": "Llama 3.2 3B Instruct"
      }
    },
    {
      "id": "kimi-k2-5",
      "created": 1773272044,
      "object": "model",
      "owned_by": "kimi-k25",
      "url": "http://maas.apps.ocp.cloud.rhai-tmm.dev/kimi-k25/kimi-k2-5",
      "ready": true,
      "modelDetails": {
        "displayName": "kimi-k2-5"
      }
    }
  ],
  "object": "list"
}
```

Use the nvidia.png and redhat.png in the UI for displaying each agent.

Generate some cool prisoner like graphics that animate when each tunr is taken.

Add a selector so that the number of turns can be input e.g. 1-100, and keep score as each turn progressses.

Add temperature (wired into the LLM prompt) as a control for each agent.
