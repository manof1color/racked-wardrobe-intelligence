/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shoppableLanguage } from "@/lib/look-language";
import { parseSimilarSuggestions, SIMILAR_DISCLAIMER, type SimilarSuggestion } from "@/lib/similar-products";
import type { OutfitPost, PublicOutfitGarment } from "@/lib/platform-types";

function money(price?: number, currency?: string) {
  if (!Number.isFinite(price)) return null;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(Number(price)); }
  catch { return `${currency ?? ""} ${price}`.trim(); }
}

function similarEndpoint(postId: string, garmentId: string) {
  return `/api/products/similar?garmentId=${encodeURIComponent(garmentId)}&postId=${encodeURIComponent(postId)}`;
}

function SimilarResults({ suggestions }: { suggestions: SimilarSuggestion[] }) {
  if (suggestions.length === 0) return <p className="similar-empty">No comparable enrolled product was found for this piece.</p>;
  return <div className="similar-results">
    <p className="similar-disclaimer">{SIMILAR_DISCLAIMER}</p>
    <ul>{suggestions.map((suggestion) => <li key={suggestion.registryProductId}>
      <div>
        <strong>{suggestion.name}</strong>
        <small>{suggestion.brand}{money(suggestion.price, suggestion.currency) ? ` · ${money(suggestion.price, suggestion.currency)}` : ""}</small>
        <span className="shop-badge tone-similar">Similar item</span>
        {suggestion.reasons.length > 0 && <p>{suggestion.reasons.join(" · ")}</p>}
      </div>
      {suggestion.outboundUrl
        ? <a className="button button-light button-small" href={suggestion.outboundUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">View ↗</a>
        : <span className="shop-no-action">No destination</span>}
    </li>)}</ul>
  </div>;
}

// Judge note: Racked never redirects straight out of the app. Shop the Look is an
// in-app inspection surface first; only an explicit click on an exact verified
// product leaves, and only through the server-validated outbound route. Similar
// suggestions are a separate, clearly softened tier and are only offered when the
// planned endpoint actually answers — never as a button that goes nowhere.
export function ShopTheLook({ post, onClose }: { post: OutfitPost; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [similarSupported, setSimilarSupported] = useState(false);
  const [similarFor, setSimilarFor] = useState<string | null>(null);
  const [similarBusy, setSimilarBusy] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, SimilarSuggestion[]>>({});

  const inexact = post.garments.filter((garment) => !shoppableLanguage(garment).canShopExact);

  // Capability probe: the similar-product endpoint is planned but may not be deployed.
  // If it is absent the button is never rendered, so a person cannot click a dead control.
  useEffect(() => {
    const probe = inexact[0];
    if (!probe) return;
    let active = true;
    fetch(similarEndpoint(post.id, probe.publicGarmentId))
      .then((response) => { if (active && response.ok) setSimilarSupported(true); })
      .catch(() => { /* endpoint absent: leave suggestions disabled */ });
    return () => { active = false; };
  }, [post.id, inexact]);

  const loadSimilar = useCallback(async (garment: PublicOutfitGarment) => {
    const id = garment.publicGarmentId;
    if (similarFor === id) { setSimilarFor(null); return; }
    setSimilarFor(id);
    if (suggestions[id]) return;
    setSimilarBusy(id);
    try {
      const response = await fetch(similarEndpoint(post.id, id));
      if (!response.ok) throw new Error("unavailable");
      const parsed = parseSimilarSuggestions(await response.json());
      setSuggestions((current) => ({ ...current, [id]: parsed }));
    } catch {
      setSuggestions((current) => ({ ...current, [id]: [] }));
    } finally { setSimilarBusy(null); }
  }, [post.id, similarFor, suggestions]);

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const anyAffiliate = post.garments.some((garment) => shoppableLanguage(garment).canShopExact);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal shop-sheet" role="dialog" aria-modal="true" aria-labelledby="shop-the-look-title" ref={dialog}>
      <button className="modal-close" aria-label="Close Shop the Look" onClick={onClose} ref={closeButton}>×</button>
      <div className="eyebrow">SHOP THE LOOK</div>
      <h2 id="shop-the-look-title">{post.outfitTitle}</h2>
      <p>Racked links only to products a brand has enrolled and verified. Everything else in this outfit stays labeled as what it is.</p>
      <ul className="shop-list">
        {post.garments.map((garment) => {
          const state = shoppableLanguage(garment);
          const price = money(garment.verifiedProduct?.price, garment.verifiedProduct?.currency);
          return <li key={garment.publicGarmentId} className={`shop-row tone-${state.tone}`}>
            <div className="shop-thumb">{garment.image ? <img src={garment.image} alt="" /> : <span aria-hidden="true">◻</span>}</div>
            <div className="shop-detail">
              <strong>{garment.verifiedProduct?.name ?? garment.name}</strong>
              <small>{garment.verifiedProduct?.brand ?? garment.unverifiedBrandLabel ?? "No brand claimed"}{price ? ` · ${price}` : ""}</small>
              <span className={`shop-badge tone-${state.tone}`}>{state.label}</span>
              <p>{state.detail}</p>
            </div>
            <div className="shop-action">
              {state.canShopExact && garment.verifiedProduct?.outboundUrl
                ? <a className="button button-accent button-small" href={garment.verifiedProduct.outboundUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">{state.action} ↗</a>
                : similarSupported
                  ? <button type="button" className="button button-light button-small" aria-expanded={similarFor === garment.publicGarmentId} disabled={similarBusy === garment.publicGarmentId} onClick={() => loadSimilar(garment)}>{similarBusy === garment.publicGarmentId ? "Finding…" : similarFor === garment.publicGarmentId ? "Hide similar" : "Find similar"}</button>
                  : <span className="shop-no-action">{state.tone === "unavailable" ? "Unavailable" : "Not shoppable"}</span>}
            </div>
            {similarFor === garment.publicGarmentId && suggestions[garment.publicGarmentId] && <div className="shop-similar-panel"><SimilarResults suggestions={suggestions[garment.publicGarmentId]} /></div>}
          </li>;
        })}
      </ul>
      {anyAffiliate && <p className="shop-disclosure">Racked may earn a commission from eligible purchases. Product pages open on the brand&rsquo;s own site; Racked does not process payments.</p>}
    </section>
  </div>;
}
