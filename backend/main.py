import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.game import play_single_turn
from src.prompts import (
    DEFAULT_NVIDIA_PROMPT,
    DEFAULT_REDHAT_PROMPT,
    DEFAULT_SUPERVISOR_PROMPT,
)

MAAS_HOST = os.getenv("MAAS_HOST", "https://maas.apps.ocp.cloud.rhai-tmm.dev")
http_client: httpx.AsyncClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(verify=False, timeout=60.0)
    yield
    await http_client.aclose()


app = FastAPI(title="BAG - The Business AI Game", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TokenRequest(BaseModel):
    bearer: str


class TurnRequest(BaseModel):
    token: str
    history: list[dict] = []
    supervisor_prompt: str = DEFAULT_SUPERVISOR_PROMPT
    redhat_prompt: str = DEFAULT_REDHAT_PROMPT
    nvidia_prompt: str = DEFAULT_NVIDIA_PROMPT
    supervisor_model_url: str = ""
    supervisor_model_id: str = ""
    redhat_model_url: str = ""
    redhat_model_id: str = ""
    nvidia_model_url: str = ""
    nvidia_model_id: str = ""
    supervisor_temp: float = 0.7
    redhat_temp: float = 0.7
    nvidia_temp: float = 0.7


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/auto-connect")
async def auto_connect():
    """Auto-connect using BEARER env var. Returns token + models if available."""
    bearer = os.getenv("BEARER", "")
    if not bearer:
        return {"available": False}
    try:
        resp = await http_client.post(
            f"{MAAS_HOST}/maas-api/v1/tokens",
            headers={
                "Authorization": f"Bearer {bearer}",
                "Content-Type": "application/json",
            },
            json={"expiration": "720h"},
        )
        resp.raise_for_status()
        token = resp.json().get("token", "")
        models_resp = await http_client.get(
            f"{MAAS_HOST}/maas-api/v1/models",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        models_resp.raise_for_status()
        return {
            "available": True,
            "token": token,
            "models": models_resp.json(),
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


@app.post("/api/token")
async def get_token(req: TokenRequest):
    try:
        resp = await http_client.post(
            f"{MAAS_HOST}/maas-api/v1/tokens",
            headers={
                "Authorization": f"Bearer {req.bearer}",
                "Content-Type": "application/json",
            },
            json={"expiration": "720h"},
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/models")
async def get_models(token: str):
    try:
        resp = await http_client.get(
            f"{MAAS_HOST}/maas-api/v1/models",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/play-turn")
def play_turn(req: TurnRequest):
    try:
        result = play_single_turn(
            history=req.history,
            supervisor_prompt=req.supervisor_prompt,
            redhat_prompt=req.redhat_prompt,
            nvidia_prompt=req.nvidia_prompt,
            supervisor_model_url=req.supervisor_model_url,
            supervisor_model_id=req.supervisor_model_id,
            redhat_model_url=req.redhat_model_url,
            redhat_model_id=req.redhat_model_id,
            nvidia_model_url=req.nvidia_model_url,
            nvidia_model_id=req.nvidia_model_id,
            token=req.token,
            supervisor_temp=req.supervisor_temp,
            redhat_temp=req.redhat_temp,
            nvidia_temp=req.nvidia_temp,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/default-prompts")
async def default_prompts():
    return {
        "supervisor": DEFAULT_SUPERVISOR_PROMPT,
        "redhat": DEFAULT_REDHAT_PROMPT,
        "nvidia": DEFAULT_NVIDIA_PROMPT,
    }
