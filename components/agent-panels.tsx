"use client";

import { useState } from "react";
import type { AgentReply } from "@/lib/platform-types";

type AgentAction = AgentReply["actions"][number];

function Reply({ reply, onAction, working }: { reply: AgentReply; onAction: (action: AgentAction) => void; working: string | null }) {
  return (
    <div className="agent-reply">
      <div className="agent-meta"><span>{reply.confidence} confidence</span><span>{reply.toolsUsed.length} tools used</span></div>
      <p>{reply.message}</p>
      <ul>{reply.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
      <div className="agent-actions">
        {reply.actions.map((action) => <button type="button" key={action.type} onClick={() => onAction(action)} disabled={working !== null}>{working === action.type ? "Working…" : action.label}</button>)}
      </div>
      <details><summary>Inspect agent tools</summary><code>{reply.toolsUsed.join(" → ")}</code></details>
    </div>
  );
}

export function ConsumerAgentPanel({ onWearRecorded }: { onWearRecorded?: (counts: Record<string, number>) => void }) {
  const [occasion, setOccasion] = useState("");
  const [weather, setWeather] = useState("");
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/agents/consumer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ occasion, weather }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The stylist agent could not run.");
      setReply(data.reply ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The stylist agent could not run.");
    } finally { setBusy(false); }
  }

  async function handleAction(action: AgentAction) {
    setWorking(action.type); setError(""); setStatus("");
    try {
      if (action.type !== "record-outfit") return;
      const itemIds = action.payload.itemIds.split(",").filter(Boolean);
      const response = await fetch("/api/wears", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The outfit could not be recorded.");
      onWearRecorded?.(data.counts);
      setStatus(`${itemIds.length} outfit pieces were recorded.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally { setWorking(null); }
  }

  return (
    <section className="agent-panel consumer-agent">
      <div className="agent-heading"><span className="agent-orb">AI</span><div><div className="eyebrow">CONSUMER AGENT · RACKED STYLIST</div><h2>Create an outfit, then track it.</h2></div><span className="fallback-pill">WARDROBE-AWARE</span></div>
      <div className="agent-form"><label>What are you dressing for?<input value={occasion} onChange={(event) => setOccasion(event.target.value)} /></label><label>Weather / context<input value={weather} onChange={(event) => setWeather(event.target.value)} /></label><button type="button" className="button button-accent" onClick={run} disabled={busy}>{busy ? "Checking your wardrobe…" : "Build from my wardrobe"}</button></div>
      {reply && <Reply reply={reply} onAction={handleAction} working={working} />}
      {status && <div className="agent-action-status" role="status">✓ {status}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </section>
  );
}

export function BrandAgentPanel({ productId }: { productId: string }) {
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [retention, setRetention] = useState<AgentReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setResult("");
    try {
      const response = await fetch("/api/agents/brand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Wear intelligence could not run.");
      setReply(data.reply ?? null); setRetention(data.retention ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wear intelligence could not run.");
    } finally { setBusy(false); }
  }

  function handleAction(action: AgentAction) {
    setWorking(action.type); setError("");
    setResult(action.type === "campaign" && action.payload.segment === "re-engagement" ? "Re-engagement nudge: remind owners of pairings they already have, with no discount or urgency language." : action.type === "campaign" ? "Wear-led campaign plan: lead with repeat pairings, include the measured wear rate, and avoid urgency or predicted-sales claims." : "Low-wear cohort review: show styling education only for the thresholded anonymous segment; do not expose or contact individuals.");
    setWorking(null);
  }

  return (
    <section className="agent-panel brand-agent">
      <div className="agent-heading"><span className="agent-orb">AI</span><div><div className="eyebrow">BRAND AGENT · WEAR INTELLIGENCE</div><h2>Move from purchase to actual wear.</h2></div><span className="fallback-pill">AGGREGATES ONLY</span></div>
      <p className="agent-intro">The agent can query thresholded wear events, product attributes, segments, and score components. It cannot access names, emails, or raw wardrobes.</p>
      <button type="button" className="button button-dark" onClick={run} disabled={busy}>{busy ? "Reading wear signals…" : "Analyze actual product wear"}</button>
      {reply && <Reply reply={reply} onAction={handleAction} working={working} />}
      {retention && <div className="agent-reply retention-reply"><div className="card-label">ENGAGEMENT TREND</div><Reply reply={retention} onAction={handleAction} working={working} /></div>}
      {result && <div className="agent-action-status" role="status">{result}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
    </section>
  );
}
