# Agentic Prisoner’s Dilemma

Agentic game based on the prisoner’s dilemma. The two players are "Red Hat" and "NVIDIA".

## Architecture

- **Frontend**: Next.js (standalone mode) with Server Actions for secure backend communication
- **Backend**: Python/FastAPI with OpenAI-compatible API calls to MaaS-hosted models
- **Deployment**: Helm chart for OpenShift with auto-connect from BEARER env var

### Key files

- `backend/main.py` — FastAPI server, API endpoints, stores MaaS token server-side
- `backend/src/game.py` — Game logic, LLM calls, payoff calculation, thinking-tag stripping
- `backend/src/prompts.py` — Default system prompts for supervisor, Red Hat, NVIDIA agents
- `frontend/src/app/page.tsx` — Main UI component
- `frontend/src/app/actions.ts` — Next.js Server Actions (all backend calls go through here, never from browser)
- `deploy/chart/` — Helm chart for OpenShift deployment

### Security

- Bearer token is **never** sent to the browser. It is stored server-side in the backend.
- All frontend-to-backend communication uses Next.js Server Actions (`"use server"`).
- On OpenShift, auto-connect uses the `BEARER` env var from a Kubernetes Secret.
- Controls panel (manual token entry) is hidden when not running on localhost.

## Gameplay

Red Hat and NVIDIA are locked in a prisoner’s dilemma in "The Business AI Game (BAG)".

Each player chooses whether to "cooperate" or "deceive".

### Payoff matrix (configurable in UI)

Default values (in GPUs):

| | NV Cooperate | NV Deceive |
|---|---|---|
| **RH Cooperate** | +3 / +3 | 0 / +5 |
| **RH Deceive** | +5 / 0 | -2 / -2 |

- The payoff matrix is **editable in the UI** — each cell has number inputs
- When payoff values change, the "Payoff rules" section in all three prompts (supervisor, Red Hat, NVIDIA) is **automatically updated** to match
- The backend also injects the actual payoff values into prompts before sending to the LLM, as a safety net
- Reset button restores the matrix to defaults

## UI

### Layout

- **Nav bar**: Connection status, Controls toggle (localhost only)
- **Action bar**: Turns selector (1-100), Start Game / Stop button, Reset button
- **Score board**: Red Hat and NVIDIA scores with logos (redhat.png, nvidia.png)
- **Payoff matrix**: Editable grid showing RH/NV scores for each outcome
- **Model selectors**: Per-agent (supervisor, Red Hat, NVIDIA) with:
  - LLM model dropdown (fetched from MaaS API)
  - Temperature slider (0-2)
  - Max output tokens input (256-262144, default 2048)
- **Prompt editors**: 3 text areas (supervisor, Red Hat, NVIDIA) with per-prompt Reset buttons
- **Game history**: Scrollable list of rounds with supervisor narration, decisions, reasoning

### Per-agent controls

Each agent (supervisor, Red Hat, NVIDIA) has:
- **Model selector** — dropdown of available MaaS models
- **Temperature** — slider 0.0-2.0 (wired into LLM call)
- **Max tokens** — output token limit (important for thinking models like kimi-k25 that use tokens for `<think>` reasoning)

### Thinking model support

Models like Qwen3.5-9B and kimi-k25 emit `<think>...</think>` tags or "Thinking Process:" preambles. The backend strips these via `_strip_thinking()` in `game.py` before using the output. The `max_tokens` control is important — thinking models need higher limits (e.g. 8192+) since reasoning tokens count toward the budget.

## MaaS API

Models and tokens are obtained from `https://maas.apps.ocp.cloud.rhai-tmm.dev`. The backend uses the vLLM-compatible OpenAI API. Model serving names are extracted from the URL path (last segment), not the HuggingFace model ID.

## Running locally

```bash
# Start both backend and frontend
./run.sh

# Or separately:
cd backend && BEARER=<token> uvicorn main:app --host 0.0.0.0 --port 8000
cd frontend && npm run dev
```

## Building and deploying

```bash
make podman-build-all    # Build container images
make podman-push-all     # Push to quay.io
make helm-deploy         # Deploy to OpenShift
```

Images: `quay.io/eformat/prisoners-dilemma-backend:latest` and `quay.io/eformat/prisoners-dilemma-frontend:latest`
