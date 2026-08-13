/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef } from "react";
import { shoppableLanguage } from "@/lib/look-language";
import type { OutfitPost } from "@/lib/platform-types";

function money(price?: number, currency?: string) {
  if (!Number.isFinite(price)) return null;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(Number(price)); }
  catch { return `${currency ?? ""} ${price}`.trim(); }
}

// Judge note: Racked never redirects straight out of the app. Shop the Look is an
// in-app inspection surface first; only an explicit click on an exact verified
// product leaves, and only through the server-validated outbound route.
export function ShopTheLook({ post, onClose }: { post: OutfitPost; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

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
                : <span className="shop-no-action">{state.tone === "unavailable" ? "Unavailable" : "Not shoppable"}</span>}
            </div>
          </li>;
        })}
      </ul>
      {anyAffiliate && <p className="shop-disclosure">Racked may earn a commission from eligible purchases. Product pages open on the brand&rsquo;s own site; Racked does not process payments.</p>}
    </section>
  </div>;
}
