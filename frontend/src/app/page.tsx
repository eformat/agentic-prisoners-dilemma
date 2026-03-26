"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  connectWithBearer,
  autoConnect,
  fetchDefaultPrompts,
  playTurn,
} from "./actions";

function isLocalDev() {
  if (typeof window === "undefined") return true;
  const { hostname } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1";
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
  crimson_decision: string;
  crimson_reasoning: string;
  verdant_decision: string;
  verdant_reasoning: string;
  crimson_score_change: number;
  verdant_score_change: number;
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
        className={`inline-block rounded-sm border-2 px-3 py-0.5 text-lg font-black tracking-widest uppercase sm:border-4 sm:px-4 sm:py-1 sm:text-2xl ${
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
  maxTokens,
  onMaxTokensChange,
  color,
}: {
  label: string;
  models: MaasModel[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  temperature: number;
  onTemperatureChange: (t: number) => void;
  maxTokens: number;
  onMaxTokensChange: (t: number) => void;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
          {label}
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          className="min-w-0 flex-1 rounded border border-cell-border bg-panel px-2 py-1.5 text-sm text-text-primary outline-none focus:border-cell-bars sm:flex-initial"
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
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
        <label className="text-xs text-text-muted">Max Tokens</label>
        <input
          type="number"
          min={256}
          max={262144}
          step={256}
          value={maxTokens}
          onChange={(e) => onMaxTokensChange(Math.max(256, Math.min(262144, parseInt(e.target.value) || 2048)))}
          className="num-input w-24 rounded border border-cell-border bg-panel px-2 py-1.5 text-sm text-text-primary outline-none focus:border-cell-bars"
        />
      </div>
    </div>
  );
}

// --- Payoff Cell ---
function PayoffCell({
  values,
  onChange,
}: {
  values: number[];
  onChange: (v: number[]) => void;
}) {
  const colorFor = (v: number) =>
    v > 0 ? "text-cooperate" : v < 0 ? "text-deceive" : "text-text-muted";
  return (
    <div className="flex items-center justify-center gap-1 bg-cell-bg p-1.5 sm:p-2">
      <input
        type="number"
        value={values[0]}
        onChange={(e) => onChange([parseInt(e.target.value) || 0, values[1]])}
        className={`num-input w-12 rounded border border-cell-border bg-panel px-1 py-1 text-center text-xs outline-none focus:border-cell-bars ${colorFor(values[0])}`}
      />
      <span className="text-text-muted">/</span>
      <input
        type="number"
        value={values[1]}
        onChange={(e) => onChange([values[0], parseInt(e.target.value) || 0])}
        className={`num-input w-12 rounded border border-cell-border bg-panel px-1 py-1 text-center text-xs outline-none focus:border-cell-bars ${colorFor(values[1])}`}
      />
    </div>
  );
}

function buildPayoffRulesText(cc: number[], cd: number[], dc: number[], dd: number[]) {
  const fmt = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
  return [
    `- If both cooperate: Crimson Dynamics gets ${fmt(cc[0])} GPUs, Verdant Systems gets ${fmt(cc[1])} GPUs`,
    `- If Crimson Dynamics cooperates and Verdant Systems deceives: Crimson Dynamics gets ${fmt(cd[0])} GPUs, Verdant Systems gets ${fmt(cd[1])} GPUs`,
    `- If Crimson Dynamics deceives and Verdant Systems cooperates: Crimson Dynamics gets ${fmt(dc[0])} GPUs, Verdant Systems gets ${fmt(dc[1])} GPUs`,
    `- If both deceive: Crimson Dynamics gets ${fmt(dd[0])} GPUs, Verdant Systems gets ${fmt(dd[1])} GPUs`,
  ].join("\n");
}

function injectPayoffRules(prompt: string, rulesText: string): string {
  return prompt.replace(
    /Payoff rules \(in GPUs\):[\s\S]*?(?=\n\n)/,
    `Payoff rules (in GPUs):\n${rulesText}`
  );
}

// --- Main Page ---
export default function Home() {
  // Auth & models - no tokens stored in browser
  const [bearer, setBearer] = useState("");
  const [models, setModels] = useState<MaasModel[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [showControls] = useState(isLocalDev);

  // Model selections
  const [supervisorModel, setSupervisorModel] = useState("");
  const [crimsonModel, setCrimsonModel] = useState("");
  const [verdantModel, setVerdantModel] = useState("");

  // Temperatures
  const [supervisorTemp, setSupervisorTemp] = useState(0.7);
  const [crimsonTemp, setCrimsonTemp] = useState(0.7);
  const [verdantTemp, setVerdantTemp] = useState(0.7);

  // Max tokens
  const [supervisorMaxTokens, setSupervisorMaxTokens] = useState(2048);
  const [crimsonMaxTokens, setCrimsonMaxTokens] = useState(2048);
  const [verdantMaxTokens, setVerdantMaxTokens] = useState(2048);

  // Payoff matrix [crimson, verdant]
  const [payoffCC, setPayoffCC] = useState([3, 3]);
  const [payoffCD, setPayoffCD] = useState([0, 5]);
  const [payoffDC, setPayoffDC] = useState([5, 0]);
  const [payoffDD, setPayoffDD] = useState([-2, -2]);

  // Prompts
  const [supervisorPrompt, setSupervisorPrompt] = useState("");
  const [crimsonPrompt, setCrimsonPrompt] = useState("");
  const [verdantPrompt, setVerdantPrompt] = useState("");
  const defaultPromptsRef = useRef({ supervisor: "", crimson: "", verdant: "" });

  // Game state
  const [numTurns, setNumTurns] = useState(1);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [crimsonScore, setCrimsonScore] = useState(0);
  const [verdantScore, setVerdantScore] = useState(0);
  const [history, setHistory] = useState<TurnResult[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBars, setShowBars] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<string>("");

  const stopRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Auto-connect on mount + load default prompts (via server actions)
  useEffect(() => {
    fetchDefaultPrompts().then((data) => {
      defaultPromptsRef.current = data;
      setSupervisorPrompt(data.supervisor);
      setCrimsonPrompt(data.crimson);
      setVerdantPrompt(data.verdant);
    });

    setConnectionStatus("Connecting...");
    autoConnect().then((data) => {
      if (data.connected) {
        setModels(data.models || []);
        setConnected(true);
        setConnectionStatus(`Connected - ${(data.models || []).length} models`);
      } else {
        setConnectionStatus("Disconnected");
      }
    });
  }, []);

  // Update prompts when payoff matrix changes
  useEffect(() => {
    const rulesText = buildPayoffRulesText(payoffCC, payoffCD, payoffDC, payoffDD);
    setSupervisorPrompt((p) => injectPayoffRules(p, rulesText));
    setCrimsonPrompt((p) => injectPayoffRules(p, rulesText));
    setVerdantPrompt((p) => injectPayoffRules(p, rulesText));
  }, [payoffCC, payoffCD, payoffDC, payoffDD]);

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
    const data = await connectWithBearer(bearer);
    if (data.connected) {
      setModels(data.models || []);
      setConnected(true);
      setConnectionStatus(`Connected - ${(data.models || []).length} models`);
      setBearer("");
    } else {
      setError(data.error || "Connection failed");
      setConnected(false);
      setConnectionStatus("Failed");
    }
  };

  const handleDisconnect = () => {
    setModels([]);
    setConnected(false);
    setConnectionStatus("Disconnected");
  };

  const playTurns = async () => {
    if (!connected || !supervisorModel || !crimsonModel || !verdantModel) {
      setError("Please connect and select models for all agents first.");
      return;
    }
    setIsPlaying(true);
    setError("");
    stopRef.current = false;

    let currentHistory = [...history];
    let crScore = crimsonScore;
    let vdScore = verdantScore;

    for (let i = 0; i < numTurns; i++) {
      if (stopRef.current) break;
      setCurrentTurn(i + 1);
      setShowBars(true);
      setPhase("Supervisor is setting the stage...");

      const result = await playTurn({
        history: currentHistory,
        supervisor_prompt: supervisorPrompt,
        crimson_prompt: crimsonPrompt,
        verdant_prompt: verdantPrompt,
        supervisor_model_url: getModelUrl(supervisorModel),
        supervisor_model_id: supervisorModel,
        crimson_model_url: getModelUrl(crimsonModel),
        crimson_model_id: crimsonModel,
        verdant_model_url: getModelUrl(verdantModel),
        verdant_model_id: verdantModel,
        supervisor_temp: supervisorTemp,
        crimson_temp: crimsonTemp,
        verdant_temp: verdantTemp,
        supervisor_max_tokens: supervisorMaxTokens,
        crimson_max_tokens: crimsonMaxTokens,
        verdant_max_tokens: verdantMaxTokens,
        payoff_cc: payoffCC,
        payoff_cd: payoffCD,
        payoff_dc: payoffDC,
        payoff_dd: payoffDD,
      });

      if (result.error) {
        setError(result.error);
        setPhase("");
        setTimeout(() => setShowBars(false), 1500);
        break;
      }

      currentHistory = [...currentHistory, result as TurnResult];
      crScore += result.crimson_score_change;
      vdScore += result.verdant_score_change;

      setHistory([...currentHistory]);
      setCrimsonScore(crScore);
      setVerdantScore(vdScore);
      setPhase("");
      setTimeout(() => setShowBars(false), 1500);

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
    setCrimsonScore(0);
    setVerdantScore(0);
    setCurrentTurn(0);
    setError("");
    setPayoffCC([3, 3]);
    setPayoffCD([0, 5]);
    setPayoffDC([5, 0]);
    setPayoffDD([-2, -2]);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PrisonBars animating={showBars} />

      {/* Nav Bar */}
      <nav className="relative z-10 flex items-center border-b border-cell-border bg-panel px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-sm font-black tracking-tight sm:text-lg">
            <span className="text-cr-red">THE</span>{" "}
            <span className="text-text-primary">BUSINESS AI GAME</span>
          </h1>
          <span className="hidden text-xs text-text-muted sm:inline">BAG</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <div
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-cooperate" : "bg-text-muted"
              }`}
            />
            <span className="text-text-muted">{connectionStatus}</span>
          </div>
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
          <div className="mx-auto max-w-5xl space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
              MaaS Bearer Token
            </label>
            <p className="text-xs text-text-muted">
              Token is sent to the server and never stored in the browser.
            </p>
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
                className="rounded bg-cr-red px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-cr-red-dark disabled:opacity-30"
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
        </div>
      )}

      {/* Action Bar */}
      <div className="border-b border-cell-border bg-panel px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 sm:justify-between sm:gap-4">
          <p className="hidden text-sm text-text-muted sm:block">
            Agentic Prisoner&apos;s Dilemma &mdash; Crimson Dynamics vs Verdant Systems
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
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
                className="num-input w-16 rounded border border-cell-border bg-cell-bg px-2 py-1 text-center text-sm text-text-primary outline-none"
                disabled={isPlaying}
              />
            </div>
            <button
              onClick={isPlaying ? () => (stopRef.current = true) : playTurns}
              disabled={!connected}
              className={`rounded-lg px-6 py-2 text-base font-black tracking-wider uppercase transition-all sm:px-8 sm:py-3 sm:text-lg ${
                isPlaying
                  ? "bg-deceive text-white hover:bg-red-600"
                  : "animate-pulse-glow bg-cr-red text-white hover:bg-cr-red-dark disabled:opacity-30 disabled:shadow-none"
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
              className="rounded border border-cell-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:bg-panel-light hover:text-text-primary disabled:opacity-30 sm:px-4 sm:py-2"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6">
        {/* Score Board */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-cell-border bg-panel p-3 sm:gap-4 sm:p-4">
            <img src="/crimson.png" alt="Crimson Dynamics" className="h-10 w-10 rounded-lg object-contain sm:h-16 sm:w-16" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-cr-red sm:text-lg">Crimson Dynamics</h3>
              <p
                className={`text-xl font-black sm:text-3xl ${
                  crimsonScore >= 0 ? "text-cooperate" : "text-deceive"
                } ${history.length > 0 ? "animate-score-pop" : ""}`}
                key={`cr-${crimsonScore}`}
              >
                {crimsonScore >= 0 ? "+" : ""}{crimsonScore} <span className="text-sm sm:text-xl">GPUs</span>
              </p>
            </div>
          </div>

          <div className="order-last col-span-2 flex flex-col items-center justify-center rounded-lg border border-cell-border bg-panel p-3 sm:order-none sm:col-span-1 sm:p-4">
            {phase ? (
              <div className="text-center">
                <ThinkingDots />
                <p className="mt-2 text-xs text-gold sm:text-sm">{phase}</p>
              </div>
            ) : (
              <>
                <span className="text-2xl font-black text-text-muted sm:text-4xl">VS</span>
                <span className="text-xs text-text-muted">{history.length} rounds played</span>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 rounded-lg border border-cell-border bg-panel p-3 sm:gap-4 sm:p-4">
            <div className="min-w-0 text-right">
              <h3 className="text-sm font-bold text-vd-green sm:text-lg">Verdant Systems</h3>
              <p
                className={`text-xl font-black sm:text-3xl ${
                  verdantScore >= 0 ? "text-cooperate" : "text-deceive"
                } ${history.length > 0 ? "animate-score-pop" : ""}`}
                key={`vd-${verdantScore}`}
              >
                {verdantScore >= 0 ? "+" : ""}{verdantScore} <span className="text-sm sm:text-xl">GPUs</span>
              </p>
            </div>
            <img src="/verdant.png" alt="Verdant Systems" className="h-10 w-10 rounded-lg object-contain sm:h-16 sm:w-16" />
          </div>
        </div>

        {/* Payoff Matrix */}
        <div className="rounded-lg border border-cell-border bg-panel p-4">
          <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-text-muted">
            Payoff Matrix (GPUs) &mdash; <span className="text-cr-red">CD</span> / <span className="text-vd-green">VS</span>
          </h3>
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-px text-center text-xs">
            <div />
            <div className="bg-panel-light p-2 font-bold text-vd-green">VS Cooperate</div>
            <div className="bg-panel-light p-2 font-bold text-vd-green">VS Deceive</div>
            <div className="bg-panel-light p-2 font-bold text-cr-red">CD Cooperate</div>
            <PayoffCell values={payoffCC} onChange={setPayoffCC} />
            <PayoffCell values={payoffCD} onChange={setPayoffCD} />
            <div className="bg-panel-light p-2 font-bold text-cr-red">CD Deceive</div>
            <PayoffCell values={payoffDC} onChange={setPayoffDC} />
            <PayoffCell values={payoffDD} onChange={setPayoffDD} />
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
              maxTokens={supervisorMaxTokens}
              onMaxTokensChange={setSupervisorMaxTokens}
              color="#D4A017"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <ModelSelector
                label="Crimson Dynamics"
                models={models}
                selectedModel={crimsonModel}
                onSelectModel={setCrimsonModel}
                temperature={crimsonTemp}
                onTemperatureChange={setCrimsonTemp}
                maxTokens={crimsonMaxTokens}
                onMaxTokensChange={setCrimsonMaxTokens}
                color="#EE0000"
              />
              <ModelSelector
                label="Verdant Systems"
                models={models}
                selectedModel={verdantModel}
                onSelectModel={setVerdantModel}
                temperature={verdantTemp}
                onTemperatureChange={setVerdantTemp}
                maxTokens={verdantMaxTokens}
                onMaxTokensChange={setVerdantMaxTokens}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-cell-border bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-cr-red">
                  Crimson Dynamics Prompt
                </label>
                <button
                  onClick={() => setCrimsonPrompt(defaultPromptsRef.current.crimson)}
                  className="rounded border border-cell-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={crimsonPrompt}
                onChange={(e) => setCrimsonPrompt(e.target.value)}
                rows={6}
                className="scrollbar-thin w-full resize-y rounded border border-cell-border bg-cell-bg p-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-cell-bars"
              />
            </div>
            <div className="rounded-lg border border-cell-border bg-panel p-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-vd-green">
                  Verdant Systems Prompt
                </label>
                <button
                  onClick={() => setVerdantPrompt(defaultPromptsRef.current.verdant)}
                  className="rounded border border-cell-border px-2 py-0.5 text-xs text-text-muted transition-colors hover:border-cell-bars hover:text-text-primary"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={verdantPrompt}
                onChange={(e) => setVerdantPrompt(e.target.value)}
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
                      <span className={turn.crimson_score_change >= 0 ? "text-cooperate" : "text-deceive"}>
                        CD: {turn.crimson_score_change >= 0 ? "+" : ""}{turn.crimson_score_change}
                      </span>
                      <span className={turn.verdant_score_change >= 0 ? "text-cooperate" : "text-deceive"}>
                        VS: {turn.verdant_score_change >= 0 ? "+" : ""}{turn.verdant_score_change}
                      </span>
                    </div>
                  </div>
                  {turn.supervisor_narration && (
                    <p className="mb-3 rounded bg-panel-light p-3 text-sm italic text-text-muted">
                      {turn.supervisor_narration}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="rounded border border-cell-border bg-panel p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <img src="/crimson.png" alt="Crimson Dynamics" className="h-6 w-6 object-contain" />
                        <span className="text-sm font-bold text-cr-red">Crimson Dynamics</span>
                      </div>
                      <DecisionStamp decision={turn.crimson_decision} />
                      <p className="mt-2 text-xs text-text-muted">{turn.crimson_reasoning}</p>
                    </div>
                    <div className="rounded border border-cell-border bg-panel p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <img src="/verdant.png" alt="Verdant Systems" className="h-6 w-6 object-contain" />
                        <span className="text-sm font-bold text-vd-green">Verdant Systems</span>
                      </div>
                      <DecisionStamp decision={turn.verdant_decision} />
                      <p className="mt-2 text-xs text-text-muted">{turn.verdant_reasoning}</p>
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
