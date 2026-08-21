"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentChatTurn, AgentReply } from "@/lib/platform-types";
import type { SavedOutfit } from "@/lib/types";

type AgentAction = AgentReply["actions"][number];
type ChatEntry = AgentChatTurn & { id: string; reply?: AgentReply };

const consumerPrompts = [
  "Build an outfit for dinner from what I own.",
  "What have I not worn lately?",
  "Create a casual three-piece rotation.",
  "What wardrobe gap should I prioritize?",
];

const brandPrompts = [
  "What does repeat wear tell us?",
  "Build a 30-day retention strategy.",
  "Which metric should lead our campaign?",
  "How should we address zero-wear owners?",
];

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function ReplyDetails({ reply, onAction, working }: { reply: AgentReply; onAction: (action: AgentAction) => void; working: string | null }) {
  return <>
    <div className="agent-meta">
      <span>{reply.confidence} confidence</span>
      {reply.provider && <span>{reply.provider.replaceAll("-", " ")}</span>}
      <span>context refreshed</span>
    </div>
    <ul className="agent-evidence">{reply.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
    {reply.actions.length > 0 && <div className="agent-actions">
      {reply.actions.map((action) => <button type="button" key={action.type} onClick={() => onAction(action)} disabled={working !== null}>{working === action.type ? "Working…" : action.label}</button>)}
    </div>}
    <details><summary>Why Hanger could say this</summary><code>{reply.toolsUsed.join(" → ")}</code></details>
  </>;
}

function Conversation({ entries, onAction, working }: { entries: ChatEntry[]; onAction: (action: AgentAction) => void; working: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [entries]);
  return <div className="hanger-chat-log" role="log" aria-live="polite" aria-label="Conversation with Hanger">
    {entries.map((entry) => <article key={entry.id} className={`hanger-message ${entry.role}`}>
      <span>{entry.role === "assistant" ? "Hanger" : "You"}</span>
      <p>{entry.content}</p>
      {entry.reply && <ReplyDetails reply={entry.reply} onAction={onAction} working={working} />}
    </article>)}
    <div ref={end} />
  </div>;
}

function Composer({ value, setValue, send, busy, prompts, label }: { value: string; setValue: (value: string) => void; send: (message?: string) => void; busy: boolean; prompts: string[]; label: string }) {
  return <>
    <div className="hanger-suggestions" aria-label="Suggested questions">
      {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => send(prompt)} disabled={busy}>{prompt}</button>)}
    </div>
    <div className="hanger-composer">
      <label htmlFor={`hanger-${label}`}>Message Hanger</label>
      <textarea id={`hanger-${label}`} rows={3} maxLength={1_000} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={label === "consumer" ? "Ask for an outfit, rotation, or wardrobe advice…" : "Ask about wear patterns, retention, or brand strategy…"} />
      <button type="button" className="button button-accent" onClick={() => send()} disabled={busy || !value.trim()}>{busy ? "Hanger is thinking…" : "Send →"}</button>
      <small>Fresh account context is loaded securely for every message.</small>
    </div>
  </>;
}

export function ConsumerAgentPanel({ onWearRecorded,onOutfitSaved }: { onWearRecorded?: (counts: Record<string, number>) => void; onOutfitSaved?: (outfit:SavedOutfit)=>void }) {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: "consumer-intro", role: "assistant", content: "I’m Hanger. Ask me to create outfits from your saved wardrobe, find underused pieces, plan a rotation, or identify a wardrobe gap." }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function send(provided?: string) {
    const message = (provided ?? draft).trim();
    if (!message || busy) return;
    const history = entries.slice(-8).map(({ role, content }) => ({ role, content }));
    const previousSuggestionItemIds = [...entries].reverse().find((entry) => entry.reply)?.reply?.actions
      .find((action) => action.type === "save-outfit")?.payload.itemIds?.split(",").filter(Boolean) ?? [];
    setEntries((current) => [...current, { id: id(), role: "user", content: message }]);
    setDraft(""); setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/agents/consumer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, history, previousSuggestionItemIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hanger could not respond.");
      const reply = data.reply as AgentReply;
      setEntries((current) => [...current, { id: id(), role: "assistant", content: reply.message, reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hanger could not respond.");
    } finally { setBusy(false); }
  }

  async function handleAction(action: AgentAction) {
    setWorking(action.type); setError(""); setStatus("");
    try {
      const itemIds = action.payload.itemIds?.split(",").filter(Boolean) ?? [];
      if (action.type === "record-outfit") {
        const response = await fetch("/api/wears", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemIds }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "The outfit could not be recorded.");
        onWearRecorded?.(data.counts);
        setStatus(`${itemIds.length} outfit pieces were recorded as worn.`);
      } else if (action.type === "save-outfit") {
        const response = await fetch("/api/consumer/outfits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemIds, name: action.payload.name ?? "Hanger outfit" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "The outfit could not be saved.");
        onOutfitSaved?.(data.outfit as SavedOutfit);
        setStatus(`Saved “${data.outfit.name}” to your outfits.`);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally { setWorking(null); }
  }

  return <section className="agent-panel consumer-agent">
    <div className="agent-heading"><span className="agent-orb">AI</span><div><div className="eyebrow">CONSUMER AGENT · HANGER</div><h2>Talk through your wardrobe.</h2></div><span className="fallback-pill">PRIVATE CONTEXT</span></div>
    <Conversation entries={entries} onAction={handleAction} working={working} />
    <Composer value={draft} setValue={setDraft} send={send} busy={busy} prompts={consumerPrompts} label="consumer" />
    {status && <div className="agent-action-status" role="status">✓ {status}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </section>;
}

export function BrandAgentPanel({ productId }: { productId: string }) {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: "brand-intro", role: "assistant", content: "I’m Hanger. Ask me to interpret privacy-safe wear patterns, build a retention strategy, shape a campaign, or decide which aggregate metric matters next." }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function send(provided?: string) {
    const message = (provided ?? draft).trim();
    if (!message || busy) return;
    const history = entries.slice(-8).map(({ role, content }) => ({ role, content }));
    setEntries((current) => [...current, { id: id(), role: "user", content: message }]);
    setDraft(""); setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/agents/brand", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId, message, history }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Hanger could not respond.");
      const reply = data.reply as AgentReply;
      setEntries((current) => [...current, { id: id(), role: "assistant", content: reply.message, reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hanger could not respond.");
    } finally { setBusy(false); }
  }

  function handleAction(action: AgentAction) {
    setWorking(action.type);
    const brief = `Strategy brief: use ${action.payload.theme ?? "actual wear"} as the evidence platform. Separate repeat-wear storytelling from zero-wear styling education, cite only released aggregates, and define a measurable 30-day engagement goal without predicting sales.`;
    setEntries((current) => [...current, { id: id(), role: "assistant", content: brief }]);
    setStatus("A privacy-safe strategy brief was added to the conversation.");
    setWorking(null);
  }

  return <section className="agent-panel brand-agent">
    <div className="agent-heading"><span className="agent-orb">AI</span><div><div className="eyebrow">BRAND AGENT · HANGER</div><h2>Discuss the strategy behind actual wear.</h2></div><span className="fallback-pill">AGGREGATES ONLY</span></div>
    <p className="agent-intro">Hanger refreshes the selected product’s consent-filtered metrics for each message. It cannot access names, emails, photos, or individual wardrobes.</p>
    <Conversation entries={entries} onAction={handleAction} working={working} />
    <Composer value={draft} setValue={setDraft} send={send} busy={busy} prompts={brandPrompts} label="brand" />
    {status && <div className="agent-action-status" role="status">✓ {status}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </section>;
}
