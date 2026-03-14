"use client";

import { useState, useRef, useEffect, useCallback } from "react";

function isLocalDev() {
  if (typeof window === "undefined") return true;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  if (isLocalDev()) return "http://localhost:8000";
  const { protocol, host } = window.location;
  return `${protocol}//${host}`;
}

interface MaasModel {
  id: string;
  url: string;
  ready: boolean;
  modelDetails?: { displayName?: string };
}

interface TurnResult {
  turn: number;
  supervisor_narration: string;
  redhat_decision: string;
  redhat_reasoning: string;
  nvidia_decision: string;
  nvidia_reasoning: string;
  redhat_score_change: number;
  nvidia_score_change: number;
}

// --- Prison Bars SVG ---
function PrisonBars({ animating }: { animating: boolean }) {
  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 transition-opacity duration-500 ${
        animating ? "opacity-60" : "opacity-0"
      }`}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {Array.from({ length: 20 }).map((_, i) => (
          <rect
            key={i}
            x={i * 100 + 45}
            y={0}
            width={8}
            height="100%"
            fill="#3A4A5C"
            rx={4}
            className={animating ? "animate-bars-descend" : ""}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        ))}
        <rect x={0} y="45%" width="100%" height={6} fill="#4A5A6C" rx={3} />
        <rect x={0} y="55%" width="100%" height={6} fill="#4A5A6C" rx={3} />
      </svg>
    </div>
  );
}

// --- Decision Stamp ---
function DecisionStamp({ decision }: { decision: string }) {
  const isCooperate = decision === "cooperate";
  return (
    <div className="animate-stamp-in inline-block">
      <span
        className={`inline-block rounded-sm border-4 px-4 py-1 text-2xl font-black tracking-widest uppercase ${
          isCooperate
            ? "border-cooperate text-cooperate"
            : "border-deceive text-deceive"
        }`}
        style={{ transform: "rotate(-5deg)" }}
      >
        {decision}
      </span>
    </div>
  );
}

// --- Thinking Animation ---
function ThinkingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-text-muted"
          style={{
            animation: "thinking-dots 1.4s infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

// --- Model Selector ---
function ModelSelector({
  label,
  models,
  selectedModel,
  onSelectModel,
  temperature,
  onTemperatureChange,
  color,
}: {
  label: string;
  models: MaasModel[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  temperature: number;
  onTemperatureChange: (t: number) => void;
  color: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
        {label} Model
      </label>
      <select
        value={selectedModel}
        onChange={(e) => onSelectModel(e.target.value)}
        className="rounded border border-cell-border bg-panel px-2 py-1 text-sm text-text-primary outline-none focus:border-cell-bars"
      >
        <option value="">Select model...</option>
        {models
          .filter((m) => m.ready)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.modelDetails?.displayName || m.id}
            </option>
          ))}
      </select>
      <label className="text-xs text-text-muted">Temp</label>
      <input
        type="range"
        min={0}
        max={2}
        step={0.1}
        value={temperature}
        onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
        className="w-20 accent-current"
        style={{ accentColor: color }}
      />
      <span className="w-8 text-xs text-text-muted">{temperature.toFixed(1)}</span>
    </div>
  );
}

// --- Main Page ---
export default function Home() {
  const [apiBase] = useState(getApiBase);

  // Auth & models
  const [bearer, setBearer] = useState("");
  const [token, setToken] = useState("");
  const [models, setModels] = useState<MaasModel[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showControls] = useState(isLocalDev);

  // Model selections
  const [supervisorModel, setSupervisorModel] = useState("");
  const [redhatModel, setRedhatModel] = useState("");
  const [nvidiaModel, setNvidiaModel] = useState("");

  // Temperatures
  const [supervisorTemp, setSupervisorTemp] = useState(0.7);
  const [redhatTemp, setRedhatTemp] = useState(0.7);
  const [nvidiaTemp, setNvidiaTemp] = useState(0.7);

  // Prompts
  const [supervisorPrompt, setSupervisorPrompt] = useState("");
  const [redhatPrompt, setRedhatPrompt] = useState("");
  const [nvidiaPrompt, setNvidiaPrompt] = useState("");
  const defaultPromptsRef = useRef({ supervisor: "", redhat: "", nvidia: "" });

  // Game state
  const [numTurns, setNumTurns] = useState(1);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [redhatScore, setRedhatScore] = useState(0);
  const [nvidiaScore, setNvidiaScore] = useState(0);
  const [history, setHistory] = useState<TurnResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBars, setShowBars] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<string>("");

  const stopRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const applyConnection = useCallback(
    (newToken: string, modelsData: MaasModel[]) => {
      setToken(newToken);
      setModels(modelsData);
      setConnected(true);
      setConnectionStatus(`Connected - ${modelsData.length} models`);
    },
    []
  );

  // Auto-connect on mount + load default prompts
  useEffect(() => {
    // Load prompts
    fetch(`${apiBase}/api/default-prompts`)
      .then((r) => r.json())
      .then((data) => {
        defaultPromptsRef.current = data;
        setSupervisorPrompt(data.supervisor);
        setRedhatPrompt(data.redhat);
        setNvidiaPrompt(data.nvidia);
      })
      .catch(() => {});

    // Try auto-connect (backend uses BEARER env var)
    setConnectionStatus("Connecting...");
    fetch(`${apiBase}/api/auto-connect`)
      .then((r) => r.json())
      .then((data) => {
        if (data.available && data.token) {
          applyConnection(data.token, data.models?.data || []);
        } else {
          setConnectionStatus("Disconnected");
        }
      })
      .catch(() => {
        setConnectionStatus("Disconnected");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll history into view
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const getModelUrl = useCallback(
    (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return "";
      let url = model.url;
      if (url.startsWith("http://")) {
        url = "https://" + url.slice(7);
      }
      return url;
    },
    [models]
  );

  const handleManualConnect = async () => {
    setConnectionStatus("Connecting...");
    setError("");
    try {
      const resp = await fetch(`${apiBase}/api/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bearer }),
      });
      if (!resp.ok) throw new Error(`Token request failed: ${resp.status}`);
      const data = await resp.json();

      const modelsResp = await fetch(
        `${apiBase}/api/models?token=${encodeURIComponent(data.token)}`
      );
      if (!modelsResp.ok) throw new Error(`Models request failed: ${modelsResp.status}`);
      const modelsData = await modelsResp.json();
      applyConnection(data.token, modelsData.data || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setConnected(false);
      setConnectionStatus("Failed");
    }
  };

  const handleDisconnect = () => {
    setToken("");
    setModels([]);
    setConnected(false);
    setConnectionStatus("Disconnected");
  };

  const playTurns = async () => {
    if (!token || !supervisorModel || !redhatModel || !nvidiaModel) {
      setError("Please connect and select models for all agents first.");
      return;
    }
    setIsPlaying(true);
    setError("");
    stopRef.current = false;

    let currentHistory = [...history];
    let rScore = redhatScore;
    let nScore = nvidiaScore;

    for (let i = 0; i < numTurns; i++) {
      if (stopRef.current) break;
      setCurrentTurn(i + 1);
      setShowBars(true);
      setPhase("Supervisor is setting the stage...");

      try {
        const resp = await fetch(`${apiBase}/api/play-turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            history: currentHistory,
            supervisor_prompt: supervisorPrompt,
            redhat_prompt: redhatPrompt,
            nvidia_prompt: nvidiaPrompt,
            supervisor_model_url: getModelUrl(supervisorModel),
            supervisor_model_id: supervisorModel,
            redhat_model_url: getModelUrl(redhatModel),
            redhat_model_id: redhatModel,
            nvidia_model_url: getModelUrl(nvidiaModel),
            nvidia_model_id: nvidiaModel,
            supervisor_temp: supervisorTemp,
            redhat_temp: redhatTemp,
            nvidia_temp: nvidiaTemp,
          }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.detail || `Turn failed: ${resp.status}`);
        }

        const result: TurnResult = await resp.json();
        currentHistory = [...currentHistory, result];
        rScore += result.redhat_score_change;
        nScore += result.nvidia_score_change;

        setHistory([...currentHistory]);
        setRedhatScore(rScore);
        setNvidiaScore(nScore);
        setPhase("");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        break;
      } finally {
        setTimeout(() => setShowBars(false), 1500);
      }

      if (i < numTurns - 1 && !stopRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setIsPlaying(false);
    setCurrentTurn(0);
    setPhase("");
  };

  const resetGame = () => {
    setHistory([]);
    setRedhatScore(0);
    setNvidiaScore(0);
    setCurrentTurn(0);
    setError("");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PrisonBars animating={showBars} />

      {/* Nav Bar */}
      <nav className="relative z-10 flex items-center border-b border-cell-border bg-panel px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black tracking-tight">
            <span className="text-rh-red">THE</span>{" "}
            <span className="text-text-primary">BUSINESS AI GAME</span>
          </h1>
          <span className="text-xs text-text-muted">BAG</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Connection Status */}
          <div className="flex items-center gap-2 text-xs">
            <div
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-cooperate" : "bg-text-muted"
              }`}
            />
            <span className="text-text-muted">{connectionStatus}</span>
          </div>
          {/* Controls Toggle - only shown in local dev */}
          {showControls && (
            <button
              onClick={() => setControlsOpen(!controlsOpen)}
              className="rounded border border-cell-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
            >
              Controls {controlsOpen ? "\u25B2" : "\u25BC"}
            </button>
          )}
        </div>
      </nav>

      {/* Controls Panel (collapsible, local dev only) */}
      {showControls && controlsOpen && (
        <div className="animate-fade-in-up border-b border-cell-border bg-panel-light px-6 py-4">
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
            {/* Connection */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                MaaS Bearer Token
              </label>
              <input
                type="password"
                value={bearer}
                onChange={(e) => setBearer(e.target.value)}
                placeholder="Paste bearer token for manual connect..."
                className="w-full rounded border border-cell-border bg-cell-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-cell-bars"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleManualConnect}
                  disabled={!bearer || connected}
                  className="rounded bg-rh-red px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rh-red-dark disabled:opacity-30"
                >
                  Connect
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={!connected}
                  className="rounded border border-cell-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-30"
                >
                  Disconnect
                </button>
              </div>
            </div>
            {/* API Info */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Backend API
              </label>
              <div className="rounded border border-cell-border bg-cell-bg px-3 py-2 text-sm text-text-muted">
                {apiBase}
              </div>
              <p className="text-xs text-text-muted">
                {connected
                  ? `${models.length} models available. Token expires in 720h.`
                  : "Set BEARER env var on backend for auto-connect, or paste token above."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="border-b border-cell-border bg-panel px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <p className="text-sm text-text-muted">
            Agentic Prisoner&apos;s Dilemma &mdash; Red Hat vs NVIDIA
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Turns</label>
              <input
                type="number"
                min={1}
                max={100}
                value={numTurns}
                onChange={(e) =>
                  setNumTurns(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
                }
                className="w-16 rounded border border-cell-border bg-cell-bg px-2 py-1 text-center text-sm text-text-primary outline-none"
                disabled={isPlaying}
              />
            </div>
            <button
              onClick={isPlaying ? () => (stopRef.current = true) : playTurns}
              disabled={!connected}
              className={`rounded-lg px-8 py-3 text-lg font-black tracking-wider uppercase transition-all ${
                isPlaying
                  ? "bg-deceive text-white hover:bg-red-600"
                  : "animate-pulse-glow bg-rh-red text-white hover:bg-rh-red-dark disabled:opacity-30 disabled:shadow-none"
              }`}
              style={
                isPlaying ? {} : { animationPlayState: connected ? "running" : "paused" }
              }
            >
              {isPlaying ? `STOP (${currentTurn}/${numTurns})` : "START GAME"}
            </button>
            <button
              onClick={resetGame}
              disabled={isPlaying}
              className="rounded border border-cell-border px-4 py-2 text-sm text-text-muted transition-colors hover:bg-panel-light hover:text-text-primary disabled:opacity-30"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-6">
        {/* Score Board */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-4 rounded-lg border border-cell-border bg-panel p-4">
            <img src="/redhat.png" alt="Red Hat" className="h-16 w-16 rounded-lg object-contain" />
            <div>
              <h3 className="text-lg font-bold text-rh-red">Red Hat</h3>
              <p
                className={`text-3xl font-black ${
                  redhatScore >= 0 ? "text-cooperate" : "text-deceive"
                } ${history.length > 0 ? "animate-score-pop" : ""}`}
                key={`rh-${redhatScore}`}
              >
                {redhatScore >= 0 ? "+" : ""}{redhatScore} GPUs
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg border border-cell-border bg-panel p-4">
            {phase ? (
              <div className="text-center">
                <ThinkingDots />
                <p className="mt-2 text-sm text-gold">{phase}</p>
              </div>
            ) : (
              <>
                <span className="text-4xl font-black text-text-muted">VS</span>
                <span className="text-xs text-text-muted">{history.length} rounds played</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-4 rounded-lg border border-cell-border bg-panel p-4">
            <div className="text-right">
              <h3 className="text-lg font-bold text-nv-green">NVIDIA</h3>
              <p
                className={`text-3xl font-black ${
                  nvidiaScore >= 0 ? "text-cooperate" : "text-deceive"
                } ${history.length > 0 ? "animate-score-pop" : ""}`}
                key={`nv-${nvidiaScore}`}
              >
                {nvidiaScore >= 0 ? "+" : ""}{nvidiaScore} GPUs
              </p>
            </div>
            <img src="/nvidia.png" alt="NVIDIA" className="h-16 w-16 rounded-lg object-contain" />
          </div>
        </div>

        {/* Payoff Matrix */}
        <div className="rounded-lg border border-cell-border bg-panel p-4">
          <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-text-muted">
            Payoff Matrix (GPUs)
          </h3>
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-px text-center text-xs">
            <div />
            <div className="bg-panel-light p-2 font-bold text-nv-green">NVIDIA Cooperate</div>
            <div className="bg-panel-light p-2 font-bold text-nv-green">NVIDIA Deceive</div>
            <div className="bg-panel-light p-2 font-bold text-rh-red">RH Cooperate</div>
            <div className="bg-cell-bg p-2">
              <span className="text-cooperate">+3</span> / <span className="text-cooperate">+3</span>
            </div>
            <div className="bg-cell-bg p-2">
              <span className="text-text-muted">0</span> / <span className="text-cooperate">+5</span>
            </div>
            <div className="bg-panel-light p-2 font-bold text-rh-red">RH Deceive</div>
            <div className="bg-cell-bg p-2">
              <span className="text-cooperate">+5</span> / <span className="text-text-muted">0</span>
            </div>
            <div className="bg-cell-bg p-2">
              <span className="text-deceive">-1</span> / <span className="text-deceive">-1</span>
            </div>
          </div>
        </div>

        {/* Model Selectors */}
        <div className="rounded-lg border border-cell-border bg-panel p-4">
          <div className="flex flex-col gap-3">
            <ModelSelector
              label="Supervisor"
              models={models}
              selectedModel={supervisorModel}
              onSelectModel={setSupervisorModel}
              temperature={supervisorTemp}
              onTemperatureChange={setSupervisorTemp}
              color="#D4A017"
            />
            <div className="grid grid-cols-2 gap-4">
              <ModelSelector
                label="Red Hat"
                models={models}
                selectedModel={redhatModel}
                onSelectModel={setRedhatModel}
                temperature={redhatTemp}
                onTemperatureChange={setRedhatTemp}
                color="#EE0000"
              />
              <ModelSelector
                label="NVIDIA"
                models={models}
                selectedModel={nvidiaModel}
                onSelectModel={setNvidiaModel}
                temperature={nvidiaTemp}
                onTemperatureChange={setNvidiaTemp}
                color="#76B900"
              />
            </div>
          </div>
        </div>

        {/* Prompt Editors */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-cell-border bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gold">
                Supervisor Prompt
              </label>
              <button
                onClick={() => setSupervisorPrompt(defaultPromptsRef.current.supervisor)}
                className="rounded border border-cell-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
              >
                Reset
              </button>
            </div>
            <textarea
              value={supervisorPrompt}
              onChange={(e) => setSupervisorPrompt(e.target.value)}
              rows={4}
              className="scrollbar-thin w-full resize-y rounded border border-cell-border bg-cell-bg p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-cell-bars"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-cell-border bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-rh-red">
                  Red Hat Prompt
                </label>
                <button
                  onClick={() => setRedhatPrompt(defaultPromptsRef.current.redhat)}
                  className="rounded border border-cell-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={redhatPrompt}
                onChange={(e) => setRedhatPrompt(e.target.value)}
                rows={6}
                className="scrollbar-thin w-full resize-y rounded border border-cell-border bg-cell-bg p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-cell-bars"
              />
            </div>
            <div className="rounded-lg border border-cell-border bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-nv-green">
                  NVIDIA Prompt
                </label>
                <button
                  onClick={() => setNvidiaPrompt(defaultPromptsRef.current.nvidia)}
                  className="rounded border border-cell-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={nvidiaPrompt}
                onChange={(e) => setNvidiaPrompt(e.target.value)}
                rows={6}
                className="scrollbar-thin w-full resize-y rounded border border-cell-border bg-cell-bg p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-cell-bars"
              />
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-deceive bg-red-900/20 p-4 text-sm text-deceive">
            {error}
          </div>
        )}

        {/* Game History */}
        {history.length > 0 && (
          <div className="rounded-lg border border-cell-border bg-panel p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gold">
              Game History
            </h3>
            <div className="scrollbar-thin flex max-h-[600px] flex-col gap-4 overflow-y-auto pr-2">
              {history.map((turn, i) => (
                <div
                  key={i}
                  className="animate-fade-in-up rounded-lg border border-cell-border bg-cell-bg p-4"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-gold">Round {turn.turn}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className={turn.redhat_score_change >= 0 ? "text-cooperate" : "text-deceive"}>
                        RH: {turn.redhat_score_change >= 0 ? "+" : ""}{turn.redhat_score_change}
                      </span>
                      <span className={turn.nvidia_score_change >= 0 ? "text-cooperate" : "text-deceive"}>
                        NV: {turn.nvidia_score_change >= 0 ? "+" : ""}{turn.nvidia_score_change}
                      </span>
                    </div>
                  </div>
                  <p className="mb-3 rounded bg-panel-light p-3 text-sm italic text-text-muted">
                    {turn.supervisor_narration}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded border border-cell-border bg-panel p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <img src="/redhat.png" alt="Red Hat" className="h-6 w-6 object-contain" />
                        <span className="text-sm font-bold text-rh-red">Red Hat</span>
                      </div>
                      <DecisionStamp decision={turn.redhat_decision} />
                      <p className="mt-2 text-xs text-text-muted">{turn.redhat_reasoning}</p>
                    </div>
                    <div className="rounded border border-cell-border bg-panel p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <img src="/nvidia.png" alt="NVIDIA" className="h-6 w-6 object-contain" />
                        <span className="text-sm font-bold text-nv-green">NVIDIA</span>
                      </div>
                      <DecisionStamp decision={turn.nvidia_decision} />
                      <p className="mt-2 text-xs text-text-muted">{turn.nvidia_reasoning}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-cell-border bg-panel px-6 py-3 text-center text-xs text-text-muted">
        The Business AI Game (BAG) &mdash; Agentic Prisoner&apos;s Dilemma
      </footer>
    </div>
  );
}
