/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { WardrobeItem } from "@/lib/types";
import { OUTFIT_BOARD_HEIGHT, OUTFIT_BOARD_WIDTH, outfitBoardLayout } from "@/lib/outfit-board";

const CATEGORY_ORDER = ["outerwear", "top", "bottom", "shoe", "accessory"];
const MAX_OUTFIT_PIECES = 10;

function categoryRank(category: string) {
  const index = CATEGORY_ORDER.findIndex((entry) => category.toLowerCase().includes(entry));
  return index === -1 ? CATEGORY_ORDER.length : index;
}

export function orderOutfitPieces(pieces: WardrobeItem[]) {
  return [...pieces].sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
}

export function OutfitPieceCarousel({ pieces, label }: { pieces: WardrobeItem[]; label: string }) {
  if (pieces.length === 0) return null;
  return <div className="outfit-carousel" role="group" aria-label={label}>
    {orderOutfitPieces(pieces).map((item) => <figure className="outfit-slide" key={item.id}>
      {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <div className={`outfit-slide-fallback ${item.art}`} aria-hidden="true" />}
      <figcaption><strong>{item.name}</strong><small>{item.category} · {item.wearCount} wear{item.wearCount === 1 ? "" : "s"}</small></figcaption>
    </figure>)}
  </div>;
}

export function OutfitFlatLay({pieces,label}:{pieces:WardrobeItem[];label:string}){const placements=outfitBoardLayout(pieces);return <div className="flatlay-board" role="img" aria-label={label}>{placements.map(placement=>{const item=pieces.find(entry=>entry.id===placement.id)!;return <figure key={item.id} style={{left:`${placement.x/OUTFIT_BOARD_WIDTH*100}%`,top:`${placement.y/OUTFIT_BOARD_HEIGHT*100}%`,width:`${placement.width/OUTFIT_BOARD_WIDTH*100}%`,height:`${placement.height/OUTFIT_BOARD_HEIGHT*100}%`}}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<span>{item.name}</span>}</figure>;})}</div>}

export function OutfitBuilder({ items, onRecord }: { items: WardrobeItem[]; onRecord: (ids: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = orderOutfitPieces(items.filter((item) => selected.includes(item.id)));

  function toggle(id: string) {
    setError("");
    setSelected((current) => current.includes(id)
      ? current.filter((entry) => entry !== id)
      : current.length >= MAX_OUTFIT_PIECES ? current : [...current, id]);
  }

  async function record() {
    setBusy(true); setError("");
    try {
      await onRecord(chosen.map((item) => item.id));
      setSelected([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The outfit could not be saved.");
    } finally { setBusy(false); }
  }

  const groups = CATEGORY_ORDER.map((category) => ({ category, options: items.filter((item) => item.category.toLowerCase().includes(category)) }));
  const uncategorized = items.filter((item) => categoryRank(item.category) === CATEGORY_ORDER.length);

  return <section className="looks-view" aria-labelledby="looks-title">
    <div className="looks-copy">
      <div className="eyebrow">OUTFIT LAB · YOUR SAVED PIECES</div>
      <h2 id="looks-title">Build a look, piece by piece.</h2>
      <p>Tap garments to add them to the look. The flat-lay preview arranges your private cropped garment photos by category. Saving stores the outfit and records one wear for every selected piece.</p>
      <div className="outfit-picker">
        {[...groups, { category: "other", options: uncategorized }].filter((group) => group.options.length > 0).map((group) => <div key={group.category}>
          <span className="eyebrow">{group.category}</span>
          <div className="outfit-picker-chips">{group.options.map((item) => {
            const active = selected.includes(item.id);
            return <button type="button" key={item.id} className={active ? "selected" : ""} aria-pressed={active} onClick={() => toggle(item.id)}>{item.name}</button>;
          })}</div>
        </div>)}
      </div>
    </div>
    <div className="looks-preview">
      <div className="panel-heading"><div><div className="eyebrow">THIS LOOK</div><h3>{chosen.length} piece{chosen.length === 1 ? "" : "s"} selected</h3></div><span>{MAX_OUTFIT_PIECES} max</span></div>
      {chosen.length === 0
        ? <div className="empty-match looks-empty"><h3>No pieces selected yet.</h3><p>Choose garments on the left (or above on a phone) to preview the look.</p></div>
        : <OutfitFlatLay pieces={chosen} label={`Flat-lay preview of selected outfit with ${chosen.length} pieces`} />}
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="button" className="button button-accent button-full" onClick={record} disabled={busy || chosen.length === 0}>{busy ? "Saving outfit…" : "Save & wear this look"}</button>
    </div>
  </section>;
}
