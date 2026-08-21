"use client";

import { useState } from "react";
import { BrandAgentPanel, ConsumerAgentPanel } from "./agent-panels";
import type { SavedOutfit } from "@/lib/types";

export function HangerDock({ role, productId, onWearRecorded,onOutfitSaved }: { role: "consumer" | "brand"; productId?: string; onWearRecorded?: (counts: Record<string, number>) => void; onOutfitSaved?: (outfit:SavedOutfit)=>void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="hanger-launcher" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span className="hanger-mark" aria-hidden="true">⌁</span><span><strong>Hanger</strong><small>{role === "consumer" ? "Talk wardrobe & outfits" : "Talk wear & strategy"}</small></span></button>
    <div className="hanger-backdrop" role="presentation" hidden={!open} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <aside className="hanger-drawer" role="dialog" aria-modal="true" aria-label="Hanger AI assistant">
        <header><div><span className="hanger-mark">⌁</span><div><strong>Hanger</strong><small>{role === "consumer" ? "Conversational wardrobe stylist" : "Conversational brand strategist"}</small></div></div><button type="button" aria-label="Close Hanger" onClick={() => setOpen(false)}>×</button></header>
        {role === "consumer" ? <ConsumerAgentPanel onWearRecorded={onWearRecorded} onOutfitSaved={onOutfitSaved} /> : productId ? <BrandAgentPanel productId={productId} /> : <div className="hanger-empty"><strong>Enroll a product first.</strong><p>Hanger needs a registered product before it can discuss privacy-safe wear information and strategy.</p></div>}
      </aside>
    </div>
  </>;
}
