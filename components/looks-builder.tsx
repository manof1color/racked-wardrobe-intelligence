/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import type { WardrobeItem } from "@/lib/types";
import {
  addExtra, availableExtras, finishLooks, initialLooks, looksItemIds, looksRows, removeExtra, setMode, shuffleLooks, stepRow, toggleLock,
  type LooksExtraKey, type LooksRow, type LooksState,
} from "@/lib/looks-rows";

const EXTRA_LABELS: Record<LooksExtraKey, string> = { hat: "Hat", bag: "Bag", jewelry: "Jewellery", accessory: "Other" };
const SWIPE_DISTANCE = 40;

function Face({ item, size, emptyLabel }: { item: WardrobeItem | null; size: "center" | "peek"; emptyLabel: string }) {
  if (!item) return <div className={`looks-card looks-${size} looks-none`}>{size === "center" ? emptyLabel : "NONE"}</div>;
  return <div className={`looks-card looks-${size}`}>
    {item.imageUrl ? <img src={item.imageUrl} alt={size === "center" ? item.name : ""} /> : <div className={`outfit-slide-fallback ${item.art}`} aria-hidden="true" />}
  </div>;
}

function LockIcon({ on }: { on: boolean }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="1.5" /><path d={on ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
  </svg>;
}

/**
 * The Looks screen: one row per slot, flipped by swipe or arrow, opening on Hanger's pick for
 * today. The whole outfit stays on one phone screen — seeing the combination at once is the point.
 */
export function LooksBuilder({ items, onSave, onWear, onAddClothing }: {
  items: WardrobeItem[];
  onSave: (ids: string[]) => Promise<void>;
  onWear: (ids: string[]) => Promise<void>;
  onAddClothing: () => void;
}) {
  const [state, setState] = useState<LooksState>(() => initialLooks(items));
  const [busy, setBusy] = useState<"save" | "wear" | null>(null);
  const [error, setError] = useState("");
  const swipeStart = useRef<{ key: string; x: number } | null>(null);
  const rows = looksRows(items, state);
  const ids = looksItemIds(items, state);
  const extras = availableExtras(items, state);

  function update(change: (current: LooksState) => LooksState) { setError(""); setState(change); }

  async function act(kind: "save" | "wear") {
    if (!ids.length) return;
    setBusy(kind); setError("");
    try { await (kind === "save" ? onSave : onWear)(ids); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That did not go through. Try again."); }
    finally { setBusy(null); }
  }

  function renderRow(row: LooksRow) {
    const positions: Array<WardrobeItem | null> = row.optional ? [null, ...row.items] : row.items;
    const index = Math.max(0, positions.findIndex((entry) => (entry?.id ?? null) === (row.selected?.id ?? null)));
    const count = positions.length;
    const previous = count > 2 ? positions[(index - 1 + count) % count] : undefined;
    const next = count > 1 ? positions[(index + 1) % count] : undefined;
    const extra = (["hat", "bag", "jewelry", "accessory"] as const).find((key) => key === row.key);
    const canFlip = count > 1 && !row.locked;

    if (!row.items.length && !row.optional) {
      return <section className="looks-row" key={row.key}>
        <span className="looks-row-label">{row.label}</span>
        <button type="button" className="looks-add-card" onClick={onAddClothing}>Add a {row.label.toLowerCase()} to your closet</button>
      </section>;
    }

    return <section className={`looks-row${row.locked ? " is-locked" : ""}`} key={row.key} aria-label={`${row.label}: ${row.selected?.name ?? "none"}`}>
      <span className="looks-row-label">{row.label}{row.optional && <small>{extra ? "extra" : "optional"}</small>}{row.locked && <small>locked</small>}</span>
      <span className="looks-row-meta">
        {count > 0 && `${index + 1}/${count}`}
        <button type="button" className={`looks-lock${row.locked ? " on" : ""}`} aria-pressed={row.locked} aria-label={`${row.locked ? "Unlock" : "Lock"} ${row.label}`} onClick={() => update((current) => toggleLock(current, row.key))}><LockIcon on={row.locked} /></button>
        {extra && <button type="button" className="looks-remove" aria-label={`Remove the ${row.label} row`} onClick={() => update((current) => removeExtra(current, extra))}>×</button>}
      </span>
      <div className="looks-track"
        onPointerDown={(event) => { swipeStart.current = { key: row.key, x: event.clientX }; }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || start.key !== row.key || !canFlip) return;
          const distance = event.clientX - start.x;
          if (Math.abs(distance) >= SWIPE_DISTANCE) update((current) => stepRow(items, current, row.key, distance < 0 ? 1 : -1));
        }}>
        <button type="button" className="looks-arrow" disabled={!canFlip} aria-label={`Previous ${row.label.toLowerCase()}`} onClick={() => update((current) => stepRow(items, current, row.key, -1))}>‹</button>
        {previous === undefined ? <span className="looks-spacer" /> : <Face item={previous} size="peek" emptyLabel="" />}
        <Face item={row.selected} size="center" emptyLabel={`No ${row.label.toLowerCase()}`} />
        {next === undefined ? <span className="looks-spacer" /> : <Face item={next} size="peek" emptyLabel="" />}
        <button type="button" className="looks-arrow" disabled={!canFlip} aria-label={`Next ${row.label.toLowerCase()}`} onClick={() => update((current) => stepRow(items, current, row.key, 1))}>›</button>
      </div>
      <div className="looks-caption">{row.selected
        ? <>{row.selected.name} <small>· {row.selected.wearCount} wear{row.selected.wearCount === 1 ? "" : "s"}</small></>
        : <>No {row.label.toLowerCase()} <small>· flip to add one</small></>}</div>
    </section>;
  }

  return <section className="looks-builder" aria-label="Build a look">
    <div className="looks-head">
      <h2>Build a <em>look.</em></h2>
      <span className="eyebrow">{ids.length} PIECE{ids.length === 1 ? "" : "S"}</span>
    </div>
    <div className="looks-controls">
      <div className="looks-segment" role="group" aria-label="Outfit shape">
        <button type="button" aria-pressed={state.mode === "separates"} className={state.mode === "separates" ? "on" : ""} onClick={() => update((current) => setMode(items, current, "separates"))}>Separates</button>
        <button type="button" aria-pressed={state.mode === "dress"} className={state.mode === "dress" ? "on" : ""} disabled={!items.some((item) => String(item.category).toLowerCase() === "dress")} onClick={() => update((current) => setMode(items, current, "dress"))}>Dress</button>
      </div>
      <button type="button" className="looks-shuffle" aria-label="Shuffle the unlocked rows" title="Shuffle the unlocked rows" onClick={() => update((current) => shuffleLooks(items, current))}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
      </button>
      <button type="button" className="looks-finish" onClick={() => update((current) => finishLooks(items, current))}><i aria-hidden="true">⌁</i>Finish it</button>
    </div>
    <div className="looks-rows">{rows.map(renderRow)}</div>
    {extras.length > 0 && <div className="looks-extras">{extras.map((key) =>
      <button type="button" className="looks-chip" key={key} onClick={() => update((current) => addExtra(items, current, key))}>+ {EXTRA_LABELS[key]}</button>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="looks-cta">
      <button type="button" className="button button-accent" disabled={!ids.length || busy !== null} onClick={() => void act("save")}>{busy === "save" ? "Saving…" : "Save look"}</button>
      <button type="button" className="button button-dark" disabled={!ids.length || busy !== null} onClick={() => void act("wear")}>{busy === "wear" ? "Recording…" : "Wear today"}</button>
    </div>
  </section>;
}
