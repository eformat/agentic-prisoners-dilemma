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
    return { supervisor: "", redhat: "", nvidia: "" };
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
  redhat_prompt: string;
  nvidia_prompt: string;
  supervisor_model_url: string;
  supervisor_model_id: string;
  redhat_model_url: string;
  redhat_model_id: string;
  nvidia_model_url: string;
  nvidia_model_id: string;
  supervisor_temp: number;
  redhat_temp: number;
  nvidia_temp: number;
  supervisor_max_tokens: number;
  redhat_max_tokens: number;
  nvidia_max_tokens: number;
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
