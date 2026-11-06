/* eslint-disable @next/next/no-img-element */
"use client";

import { type FormEvent, useState } from "react";
import { outfitDetailOrder, pieceCategoryLabel, piecesLabel, renamedOutfit, savedLabel, wearsLabel } from "@/lib/outfit-detail";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";

const CATEGORY_ICON_PATHS: Record<string, string> = {
  top: "M8 3 3 6l2 4 2-1v11h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z",
  bottom: "M7 3h10l2 18h-5l-2-10-2 10H5L7 3Z",
  outerwear: "M9 3 4 6l1 14h5V9l2-2 2 2v11h5l1-14-5-3-3 3-3-3Z",
  shoe: "M3 8v9h18v-2c0-2-2-3-5-3.500-2-.5-4-2-5-3.500l-3 2-5-2Z",
};

function CategoryIcon({ category }: { category: string }) {
  const path = CATEGORY_ICON_PATHS[category];
  if (!path) return null;
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d={path} /></svg>;
}

function PieceImage({ piece }: { piece: WardrobeItem }) {
  return piece.imageUrl
    ? <img src={piece.imageUrl} alt="" loading="lazy" />
    : <span className={`outfit-tile-fallback ${piece.art ?? ""}`} aria-hidden="true">{pieceCategoryLabel(piece.category).slice(0, 1)}</span>;
}

const piecesOf = (outfit: SavedOutfit, items: WardrobeItem[]) => outfit.itemIds
  .map((id) => items.find((item) => item.id === id))
  .filter((item): item is WardrobeItem => Boolean(item));

/** The Outfits tab: one row per saved outfit. Tapping a row opens its detail. */
export function OutfitList({ outfits, items, onOpen }: { outfits: SavedOutfit[]; items: WardrobeItem[]; onOpen: (outfit: SavedOutfit) => void }) {
  return <ul className="outfit-list">{outfits.map((outfit) => {
    const pieces = outfitDetailOrder(piecesOf(outfit, items));
    return <li key={outfit.id}>
      <button type="button" className="outfit-row" onClick={() => onOpen(outfit)}>
        <span className="outfit-row-text">
          <strong>{outfit.name}</strong>
          <small>{piecesLabel(pieces.length)} · {savedLabel(outfit.createdAt)} · {wearsLabel(outfit.wears)}</small>
        </span>
        <span className="outfit-row-thumbs" aria-hidden="true">{pieces.slice(0, 4).map((piece) => <span key={piece.id}><PieceImage piece={piece} /></span>)}</span>
        <span className="outfit-row-chevron" aria-hidden="true">›</span>
      </button>
    </li>;
  })}</ul>;
}

export interface OutfitDetailProps {
  outfit: SavedOutfit;
  items: WardrobeItem[];
  confirmRemovePieceKey: string | null;
  removingPieceKey: string | null;
  confirmingDelete: boolean;
  deleting: boolean;
  onBack: () => void;
  onRename: (name: string) => Promise<boolean>;
  onWear: () => void;
  onRemovePiece: (piece: WardrobeItem) => void;
  onCancelRemovePiece: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}

/** One saved outfit: its pieces as photos, then as a list, then wearing it again or deleting it. */
export function OutfitDetail(props: OutfitDetailProps) {
  const { outfit, items } = props;
  const pieces = outfitDetailOrder(piecesOf(outfit, items));
  const missing = outfit.itemIds.length - pieces.length;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(outfit.name);
  const [saving, setSaving] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = renamedOutfit(outfit.name, name);
    if (!next) { setName(outfit.name); setEditing(false); return; }
    setSaving(true);
    const saved = await props.onRename(next);
    setSaving(false);
    if (saved) setEditing(false);
  }

  return <article className="outfit-detail">
    <header className="outfit-detail-head">
      <button type="button" className="outfit-back" aria-label="Back to saved outfits" onClick={props.onBack}><span aria-hidden="true">‹</span></button>
      {editing
        ? <form className="outfit-rename" onSubmit={saveName}>
          <label className="sr-only" htmlFor="outfit-name">Outfit name</label>
          <input id="outfit-name" value={name} maxLength={200} autoFocus onChange={(event) => setName(event.target.value)} />
          <button type="submit" className="outfit-edit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className="text-button" onClick={() => { setName(outfit.name); setEditing(false); }}>Cancel</button>
        </form>
        : <>
          <div className="outfit-detail-title">
            <h2>{outfit.name}</h2>
            <p>{piecesLabel(pieces.length)} · {savedLabel(outfit.createdAt)}</p>
          </div>
          <div className="outfit-detail-wears"><strong>{outfit.wears}</strong><small>{outfit.wears === 1 ? "WEAR" : "WEARS"}</small></div>
          <button type="button" className="outfit-edit" onClick={() => setEditing(true)}><span aria-hidden="true">✎</span>Edit</button>
        </>}
    </header>

    {outfit.boardImageUrl && <img className="saved-flatlay outfit-detail-board" src={outfit.boardImageUrl} alt={`${outfit.name} flat-lay`} />}

    {pieces.length > 0 && <div className={`outfit-tiles${pieces.length > 4 ? " scrolls" : ""}`} {...(pieces.length > 4 ? { role: "group", tabIndex: 0, "aria-label": `${outfit.name} photos` } : {})}>
      {pieces.map((piece) => <figure className="outfit-tile" key={piece.id}>
        <PieceImage piece={piece} />
        <figcaption><CategoryIcon category={piece.category} />{pieceCategoryLabel(piece.category)}</figcaption>
      </figure>)}
    </div>}

    <section className="outfit-pieces" aria-labelledby={`outfit-pieces-${outfit.id}`}>
      <h3 id={`outfit-pieces-${outfit.id}`}>Pieces in this outfit</h3>
      <ul>{pieces.map((piece) => {
        const removeKey = `${outfit.id}:${piece.id}`;
        const confirming = props.confirmRemovePieceKey === removeKey;
        const removing = props.removingPieceKey === removeKey;
        return <li key={piece.id} className={confirming ? "confirming" : ""}>
          <div className="outfit-piece-row">
            <span className="outfit-piece-thumb"><PieceImage piece={piece} /></span>
            <span className="outfit-piece-text"><strong>{piece.name}</strong><small>{pieceCategoryLabel(piece.category)} · {wearsLabel(piece.wearCount)}</small></span>
            <div className="outfit-piece-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuFor(null); }} onKeyDown={(event) => { if (event.key === "Escape") setMenuFor(null); }}>
              <button type="button" className="outfit-kebab" aria-label={`Options for ${piece.name}`} aria-expanded={menuFor === piece.id} onClick={() => setMenuFor((current) => current === piece.id ? null : piece.id)}><span aria-hidden="true">⋮</span></button>
              {menuFor === piece.id && <div className="outfit-menu"><button type="button" onClick={() => { setMenuFor(null); props.onRemovePiece(piece); }}>Remove from outfit</button></div>}
            </div>
          </div>
          {confirming && <div className="outfit-piece-confirm">
            <small>Your garment stays in your wardrobe. This changes only this outfit.</small>
            <button type="button" className="confirm-remove" disabled={props.removingPieceKey !== null} onClick={() => props.onRemovePiece(piece)}>{removing ? "Removing…" : "Confirm remove"}</button>
            <button type="button" className="text-button" onClick={props.onCancelRemovePiece}>Cancel</button>
          </div>}
        </li>;
      })}</ul>
      {missing > 0 && <small className="outfit-missing-note">{missing} piece{missing === 1 ? "" : "s"} no longer in your wardrobe</small>}
    </section>

    <div className="outfit-detail-actions">
      <button type="button" className="outfit-wear" disabled={pieces.length === 0} onClick={props.onWear}><span aria-hidden="true">↻</span>Wear This Again</button>
      <button type="button" className={`outfit-delete${props.confirmingDelete ? " confirm-delete" : ""}`} disabled={props.deleting} onClick={props.onDelete}>{props.deleting ? "Deleting…" : props.confirmingDelete ? "Confirm Delete" : "Delete Outfit"}</button>
      {props.confirmingDelete && <small className="outfit-delete-note">This removes the saved outfit and its private board, but keeps historical wear records. Click again to confirm. <button type="button" onClick={props.onCancelDelete}>Cancel</button></small>}
    </div>
  </article>;
}
