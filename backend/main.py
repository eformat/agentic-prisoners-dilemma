import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.game import play_single_turn
from src.prompts import (
    DEFAULT_CRIMSON_PROMPT,
    DEFAULT_SUPERVISOR_PROMPT,
    DEFAULT_VERDANT_PROMPT,
)

MAAS_HOST = os.getenv("MAAS_HOST", "https://maas.apps.ocp.cloud.rhai-tmm.dev")
http_client: httpx.AsyncClient

# Server-side token storage - never exposed to the browser
_maas_token: str = ""
_models_cache: list[dict] = []


async def _obtain_token(bearer: str) -> tuple[str, list[dict]]:
    """Get MaaS token from bearer and fetch models. Store both server-side."""
    global _maas_token, _models_cache
    resp = await http_client.post(
        f"{MAAS_HOST}/maas-api/v1/tokens",
        headers={
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
        },
        json={"expiration": "720h"},
    )
    resp.raise_for_status()
    _maas_token = resp.json().get("token", "")

    models_resp = await http_client.get(
        f"{MAAS_HOST}/maas-api/v1/models",
        headers={
            "Authorization": f"Bearer {_maas_token}",
            "Content-Type": "application/json",
        },
    )
    models_resp.raise_for_status()
    _models_cache = models_resp.json().get("data", [])
    return _maas_token, _models_cache


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


class ConnectRequest(BaseModel):
    bearer: str


class TurnRequest(BaseModel):
    history: list[dict] = []
    supervisor_prompt: str = DEFAULT_SUPERVISOR_PROMPT
    crimson_prompt: str = DEFAULT_CRIMSON_PROMPT
    verdant_prompt: str = DEFAULT_VERDANT_PROMPT
    supervisor_model_url: str = ""
    supervisor_model_id: str = ""
    crimson_model_url: str = ""
    crimson_model_id: str = ""
    verdant_model_url: str = ""
    verdant_model_id: str = ""
    supervisor_temp: float = 0.7
    crimson_temp: float = 0.7
    verdant_temp: float = 0.7
    supervisor_max_tokens: int = 2048
    crimson_max_tokens: int = 2048
    verdant_max_tokens: int = 2048
    # Payoff matrix values: (crimson_score, verdant_score)
    payoff_cc: list[int] = [3, 3]      # both cooperate
    payoff_cd: list[int] = [0, 5]      # Crimson cooperate, Verdant deceive
    payoff_dc: list[int] = [5, 0]      # Crimson deceive, Verdant cooperate
    payoff_dd: list[int] = [-2, -2]    # both deceive


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/status")
async def get_status():
    return {
        "connected": bool(_maas_token),
        "model_count": len(_models_cache),
    }


@app.post("/api/connect")
async def connect(req: ConnectRequest):
    """Manual connect with a bearer token. Token is stored server-side only."""
    try:
        _, models = await _obtain_token(req.bearer)
        return {"connected": True, "models": models}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/auto-connect")
async def auto_connect():
    """Auto-connect using BEARER env var. Token is stored server-side only."""
    bearer = os.getenv("BEARER", "")
    if not bearer:
        return {"connected": False}
    try:
        _, models = await _obtain_token(bearer)
        return {"connected": True, "models": models}
    except Exception as e:
        return {"connected": False, "error": str(e)}


@app.get("/api/models")
async def get_models():
    if not _maas_token:
        raise HTTPException(status_code=401, detail="Not connected")
    return {"data": _models_cache}


@app.post("/api/play-turn")
def play_turn(req: TurnRequest):
    if not _maas_token:
        raise HTTPException(status_code=401, detail="Not connected")
    try:
        payoff_matrix = {
            ("cooperate", "cooperate"): (req.payoff_cc[0], req.payoff_cc[1]),
            ("cooperate", "deceive"): (req.payoff_cd[0], req.payoff_cd[1]),
            ("deceive", "cooperate"): (req.payoff_dc[0], req.payoff_dc[1]),
            ("deceive", "deceive"): (req.payoff_dd[0], req.payoff_dd[1]),
        }
        result = play_single_turn(
            history=req.history,
            supervisor_prompt=req.supervisor_prompt,
            crimson_prompt=req.crimson_prompt,
            verdant_prompt=req.verdant_prompt,
            supervisor_model_url=req.supervisor_model_url,
            supervisor_model_id=req.supervisor_model_id,
            crimson_model_url=req.crimson_model_url,
            crimson_model_id=req.crimson_model_id,
            verdant_model_url=req.verdant_model_url,
            verdant_model_id=req.verdant_model_id,
            token=_maas_token,
            supervisor_temp=req.supervisor_temp,
            crimson_temp=req.crimson_temp,
            verdant_temp=req.verdant_temp,
            supervisor_max_tokens=req.supervisor_max_tokens,
            crimson_max_tokens=req.crimson_max_tokens,
            verdant_max_tokens=req.verdant_max_tokens,
            payoff_matrix=payoff_matrix,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/default-prompts")
async def default_prompts():
    return {
        "supervisor": DEFAULT_SUPERVISOR_PROMPT,
        "crimson": DEFAULT_CRIMSON_PROMPT,
        "verdant": DEFAULT_VERDANT_PROMPT,
    }
