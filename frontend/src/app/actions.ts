"use server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function connectWithBearer(bearer: string) {
  const resp = await fetch(`${BACKEND_URL}/api/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bearer }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return { connected: false, error: err.detail || `Connection failed: ${resp.status}`, models: [] };
  }
  return resp.json();
}

export async function autoConnect() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/auto-connect`);
    return resp.json();
  } catch {
    return { connected: false };
  }
}

export async function fetchDefaultPrompts() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/default-prompts`);
    return resp.json();
  } catch {
    return { supervisor: "", crimson: "", verdant: "" };
  }
}

export async function fetchModels() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/models`);
    if (!resp.ok) return { data: [] };
    return resp.json();
  } catch {
    return { data: [] };
  }
}

export async function getConnectionStatus() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/status`);
    return resp.json();
  } catch {
    return { connected: false, model_count: 0 };
  }
}

interface PlayTurnConfig {
  history: unknown[];
  supervisor_prompt: string;
  crimson_prompt: string;
  verdant_prompt: string;
  supervisor_model_url: string;
  supervisor_model_id: string;
  crimson_model_url: string;
  crimson_model_id: string;
  verdant_model_url: string;
  verdant_model_id: string;
  supervisor_temp: number;
  crimson_temp: number;
  verdant_temp: number;
  supervisor_max_tokens: number;
  crimson_max_tokens: number;
  verdant_max_tokens: number;
  payoff_cc: number[];
  payoff_cd: number[];
  payoff_dc: number[];
  payoff_dd: number[];
}

export async function playTurn(config: PlayTurnConfig) {
  const resp = await fetch(`${BACKEND_URL}/api/play-turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    return { error: err.detail || `Turn failed: ${resp.status}` };
  }
  return resp.json();
}
