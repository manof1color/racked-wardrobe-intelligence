"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandAgentPanel, ConsumerAgentPanel } from "./agent-panels";
import type { SavedOutfit } from "@/lib/types";

const ROLE_COPY = {
  consumer: { launcher: "Outfits from your wardrobe", subtitle: "Wardrobe stylist", badge: "PRIVATE CONTEXT" },
  brand: { launcher: "Wear patterns & strategy", subtitle: "Brand strategist", badge: "AGGREGATES ONLY" },
} as const;

export function HangerDock({ role, productId, onWearRecorded, onOutfitSaved }: { role: "consumer" | "brand"; productId?: string; onWearRecorded?: (counts: Record<string, number>) => void; onOutfitSaved?: (outfit: SavedOutfit) => void }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const copy = ROLE_COPY[role];

  const close = useCallback(() => setOpen(false), []);

  // A dialog that cannot be dismissed with Escape, does not take focus, and lets the
  // page behind it scroll is a dialog in markup only.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.focus();
    // Captured now: by cleanup time the ref may point somewhere else, and focus has to
    // return to the button that opened the drawer.
    const openedBy = launcher.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      openedBy?.focus();
    };
  }, [open, close]);

  return <>
    <button ref={launcher} type="button" className="hanger-launcher" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="hanger-mark" aria-hidden="true">⌁</span>
      <span className="hanger-launcher-copy"><strong>Ask Hanger</strong><small>{copy.launcher}</small></span>
    </button>
    <div className="hanger-backdrop" role="presentation" hidden={!open} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside ref={drawer} className="hanger-drawer" role="dialog" aria-modal="true" aria-label="Hanger AI assistant" tabIndex={-1}>
        <header className="hanger-drawer-header">
          <span className="hanger-mark" aria-hidden="true">⌁</span>
          <div className="hanger-drawer-title">
            <strong>Hanger</strong>
            <small>{copy.subtitle}</small>
          </div>
          <span className="hanger-scope">{copy.badge}</span>
          <button type="button" className="hanger-close" aria-label="Close Hanger" onClick={close}>×</button>
        </header>
        {role === "consumer"
          ? <ConsumerAgentPanel onWearRecorded={onWearRecorded} onOutfitSaved={onOutfitSaved} />
          : productId
            ? <BrandAgentPanel productId={productId} />
            : <div className="hanger-empty"><strong>Enroll a product first.</strong><p>Hanger needs a registered product before it can discuss privacy-safe wear information and strategy.</p></div>}
      </aside>
    </div>
  </>;
}
