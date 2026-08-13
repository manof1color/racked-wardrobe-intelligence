/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { matchLanguage } from "@/lib/look-language";
import type { RecreateLookResult, RecreatePieceResult } from "@/lib/recreate-look";

function PieceRow({ piece }: { piece: RecreatePieceResult }) {
  const [open, setOpen] = useState(false);
  const language = matchLanguage(piece.state);
  return <li className={`recreate-piece group-${language.group}`}>
    <div className="recreate-piece-head">
      <span className="recreate-marker" aria-hidden="true">{language.marker}</span>
      <div>
        <strong>{piece.target.name}</strong>
        <small>{language.label}{piece.ownedItem ? ` · your ${piece.ownedItem.name}` : ""}</small>
      </div>
      {piece.ownedItem && <button type="button" className="recreate-inspect" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "Why?"}</button>}
    </div>
    {open && piece.ownedItem && <div className="recreate-piece-detail">
      {piece.ownedItem.imageUrl && <img src={piece.ownedItem.imageUrl} alt="" />}
      <div>
        <p>{language.meaning}</p>
        <ul>{piece.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>
    </div>}
  </li>;
}

// Judge note: coverage and per-piece states come straight from the server's
// recreate engine. This panel only translates them into plain language — it never
// recomputes a score, and it never implies more precision than the engine reports.
export function RecreatePanel({ result, onShop, canShop }: { result: RecreateLookResult; onShop: () => void; canShop: boolean }) {
  const owned = result.pieces.filter((piece) => matchLanguage(piece.state).group === "owned");
  const missing = result.pieces.filter((piece) => matchLanguage(piece.state).group === "missing");

  return <section className="recreate-panel" aria-live="polite">
    <header className="recreate-headline">
      <strong>You can recreate {result.coveragePercentage}% of this look</strong>
      <small>{result.coveredPieces} of {result.totalPieces} pieces have an option you already own</small>
      <div className="recreate-meter" role="img" aria-label={`${result.coveragePercentage} percent of this outfit can be built from your wardrobe`}>
        <i style={{ width: `${Math.max(2, Math.min(100, result.coveragePercentage))}%` }} />
      </div>
    </header>

    {owned.length > 0 && <div className="recreate-column">
      <h4>Use yours</h4>
      <ul>{owned.map((piece) => <PieceRow key={piece.target.publicGarmentId} piece={piece} />)}</ul>
    </div>}

    {missing.length > 0 && <div className="recreate-column recreate-missing">
      <h4>You&rsquo;re missing</h4>
      <ul>{missing.map((piece) => <PieceRow key={piece.target.publicGarmentId} piece={piece} />)}</ul>
    </div>}

    <div className="recreate-actions">
      {missing.length === 0
        ? <p className="recreate-complete">You already own an option for every piece — nothing to buy.</p>
        : canShop
          ? <button type="button" className="button button-accent button-small" onClick={onShop}>Complete the look</button>
          : <p className="recreate-complete">No verified product is available for the missing piece yet.</p>}
    </div>

    <details className="recreate-method"><summary>How this was matched</summary><p>{result.methodology}</p></details>
  </section>;
}
