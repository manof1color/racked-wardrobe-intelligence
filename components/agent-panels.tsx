/* eslint-disable @next/next/no-img-element */
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

/**
 * The pieces Hanger chose, and what to do with them. This is the part of a reply people
 * act on, so it stays open; the scoring behind it folds away into one disclosure rather
 * than stacking three separate blocks under every message.
 */
function ReplyDetails({ reply, onAction, working }: { reply: AgentReply; onAction: (action: AgentAction, reply: AgentReply) => void; working: string | null }) {
  const hasSelection = Boolean(reply.selection && reply.selection.length > 0);
  return <>
    {hasSelection && <div className="hanger-outfit-preview" role="group" aria-label="Pieces in Hanger's current outfit">
      {reply.selection!.map((item) => <figure key={item.id}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span aria-hidden="true">{item.category.slice(0, 1).toUpperCase()}</span>}
        <figcaption><strong>{item.name}</strong><small>{item.category}</small></figcaption>
      </figure>)}
    </div>}
    {reply.actions.length > 0 && <div className="agent-actions">
      {reply.actions.map((action, index) => <button type="button" key={action.type} className={index === 0 ? "hanger-action primary" : "hanger-action"} onClick={() => onAction(action, reply)} disabled={working !== null}>
        {working === action.type ? "Working…" : action.label}
      </button>)}
    </div>}
    <details className="hanger-reasoning">
      <summary>{hasSelection ? "Why these pieces" : "How Hanger answered"}</summary>
      <div className="agent-meta">
        <span>{reply.confidence} confidence</span>
        {reply.provider && <span>{reply.provider.replaceAll("-", " ")}</span>}
        <span>context refreshed</span>
      </div>
      {reply.evidence.length > 0 && <ul className="agent-evidence">{reply.evidence.map((item) => <li key={item}>{item}</li>)}</ul>}
      <code>{reply.toolsUsed.join(" → ")}</code>
    </details>
  </>;
}

function Conversation({ entries, busy, onAction, working }: { entries: ChatEntry[]; busy: boolean; onAction: (action: AgentAction, reply: AgentReply) => void; working: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [entries, busy]);
  return <div className="hanger-chat-log" role="log" aria-live="polite" aria-label="Conversation with Hanger">
    {entries.map((entry) => <article key={entry.id} className={`hanger-message ${entry.role}`}>
      <span>{entry.role === "assistant" ? "Hanger" : "You"}</span>
      <p>{entry.content}</p>
      {entry.reply && <ReplyDetails reply={entry.reply} onAction={onAction} working={working} />}
    </article>)}
    {busy && <article className="hanger-message assistant hanger-thinking" aria-label="Hanger is thinking">
      <span>Hanger</span>
      <p aria-hidden="true"><i /><i /><i /></p>
    </article>}
    <div ref={end} />
  </div>;
}

function Composer({ value, setValue, send, busy, prompts, label, showPrompts, status, error }: {
  value: string; setValue: (value: string) => void; send: (message?: string) => void; busy: boolean;
  prompts: string[]; label: string; showPrompts: boolean; status: string; error: string;
}) {
  return <div className="hanger-composer-shell">
    {/* Prompts are scaffolding for a blank conversation. Once someone is talking they are
        just clutter above the box they are typing in. */}
    {showPrompts && <div className="hanger-suggestions" aria-label="Suggested questions">
      {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => send(prompt)} disabled={busy}>{prompt}</button>)}
    </div>}
    {status && <div className="agent-action-status" role="status">✓ {status}</div>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="hanger-composer">
      <label className="sr-only" htmlFor={`hanger-${label}`}>Message Hanger</label>
      <textarea
        id={`hanger-${label}`}
        rows={1}
        maxLength={1_000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }}
        placeholder={label === "consumer" ? "Ask for an outfit, rotation, or advice…" : "Ask about wear, retention, or strategy…"}
      />
      <button type="button" className="hanger-send" onClick={() => send()} disabled={busy || !value.trim()} aria-label="Send message to Hanger">
        {busy ? <span className="hanger-send-busy" aria-hidden="true" /> : "↑"}
      </button>
    </div>
    <small className="hanger-composer-note">Enter sends · Shift + Enter adds a line. Fresh account context is loaded securely for every message.</small>
  </div>;
}

export function ConsumerAgentPanel({ onWearRecorded, onOutfitSaved }: { onWearRecorded?: (counts: Record<string, number>) => void; onOutfitSaved?: (outfit: SavedOutfit) => void }) {
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
    const previousSuggestionItemIds = [...new Set([...entries].reverse()
      .flatMap((entry) => entry.reply?.actions ?? [])
      .filter((action) => action.type === "save-outfit")
      .flatMap((action) => action.payload.itemIds?.split(",").filter(Boolean) ?? []))];
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

  async function handleAction(action: AgentAction, reply: AgentReply) {
    setWorking(action.type); setError(""); setStatus("");
    try {
      const itemIds = action.payload.itemIds?.split(",").filter(Boolean) ?? [];
      const visibleItemIds = reply.selection?.map((item) => item.id) ?? [];
      if ((action.type === "save-outfit" || action.type === "record-outfit") &&
        (visibleItemIds.length !== itemIds.length || visibleItemIds.some((itemId, index) => itemId !== itemIds[index]))) {
        throw new Error("Hanger's visible outfit changed before saving. Ask Hanger to create the outfit again so every photo and label stays matched.");
      }
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
    <Conversation entries={entries} busy={busy} onAction={handleAction} working={working} />
    <Composer value={draft} setValue={setDraft} send={send} busy={busy} prompts={consumerPrompts} label="consumer"
      showPrompts={!entries.some((entry) => entry.role === "user")} status={status} error={error} />
  </section>;
}

export function BrandAgentPanel({ productId }: { productId: string }) {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: "brand-intro", role: "assistant", content: "I’m Hanger. Ask me to interpret privacy-safe wear patterns, build a retention strategy, shape a campaign, or decide which aggregate metric matters next. I refresh this product’s consent-filtered metrics for every message, and I cannot access names, emails, photos, or individual wardrobes." }]);
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
    <Conversation entries={entries} busy={busy} onAction={handleAction} working={working} />
    <Composer value={draft} setValue={setDraft} send={send} busy={busy} prompts={brandPrompts} label="brand"
      showPrompts={!entries.some((entry) => entry.role === "user")} status={status} error={error} />
  </section>;
}
