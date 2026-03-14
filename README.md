# The Business AI Game (BAG)

Agentic Prisoner's Dilemma - Red Hat vs NVIDIA.

Two AI agents play a repeated prisoner's dilemma, each deciding whether to cooperate or deceive. A supervisor agent narrates the drama. All agents are powered by LLMs served via MaaS (Model as a Service).

## Payoff Matrix (GPUs)

|  | NVIDIA Cooperate | NVIDIA Deceive |
|---|---|---|
| **Red Hat Cooperate** | +3 / +3 | 0 / +5 |
| **Red Hat Deceive** | +5 / 0 | -1 / -1 |

## Architecture

- **Frontend** - Next.js / React / Tailwind CSS, served as static export via nginx
- **Backend** - Python / FastAPI, proxies MaaS API and orchestrates game turns

## Prerequisites

- Python 3.12+
- Node.js 22+
- A MaaS bearer token (for model access)

## Run Locally

```bash
# one-time setup
make build-all

# start both frontend and backend
make run-all
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

Open the frontend, click **Controls**, paste your bearer token, and connect. Select models for all three agents, then click **START GAME**.

## Build Container Images

```bash
make podman-build-all
make podman-push-all
```

## Deploy to OpenShift

```bash
make helm-deploy HELM_ARGS="--set backend.secret.BEARER=your-bearer-token"
```

When deployed to OpenShift, the app auto-connects using the `BEARER` secret and the Controls panel is hidden.

## Configuration

| Value | Description | Default |
|---|---|---|
| `backend.secret.BEARER` | MaaS bearer token for auto-connect | `""` |
| `backend.env.MAAS_HOST` | MaaS API host | `https://maas.apps.ocp.cloud.rhai-tmm.dev` |
| `backend.image.repository` | Backend image | `quay.io/eformat/prisoners-dilemma-backend` |
| `frontend.image.repository` | Frontend image | `quay.io/eformat/prisoners-dilemma-frontend` |
| `route.enabled` | Create OpenShift Route | `true` |
| `route.host` | Custom route hostname | `""` (auto-generated) |
