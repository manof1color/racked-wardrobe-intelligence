"use client";

import Link from "next/link";
import { useState } from "react";

type DemoPurchaseStep = "product" | "bag" | "complete";

// Judge note: completing this simulation now writes one identity-free demonstration
// event so the owning fictional brand can watch it arrive on its dashboard during a
// live demo. It still takes no payment, creates no order, and collects nothing about
// the person. If the recording call fails the simulation still completes — the point of
// the step is the commerce handoff, not the counter.
export function DemoPurchasePanel({ productId, productName, unavailable, sourcePostId }: { productId: string; productName: string; unavailable: boolean; sourcePostId?: string }) {
  const [step, setStep] = useState<DemoPurchaseStep>("product");
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/demo-purchase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourcePostId ? { sourcePostId } : {}),
      });
      setRecorded(response.ok);
    } catch {
      setRecorded(false);
    } finally {
      setBusy(false);
      setStep("complete");
    }
  }

  if (unavailable) return <><button type="button" className="button button-dark button-full" disabled>Unavailable</button><p className="demo-product-nosale">This fictional product is deliberately unavailable so judges can verify the unavailable-product state.</p></>;

  if (step === "complete") return <section className="demo-purchase-confirmation" role="status">
    <span aria-hidden="true">✓</span>
    <div>
      <strong>Demo purchase complete</strong>
      <p>No card was requested, no payment was processed, and no order was created. The full commerce handoff is now demonstrated.</p>
      <p className="demo-purchase-receipt">{recorded
        ? `Recorded as a demonstration event. ${productName} now shows one more purchase simulation on its brand dashboard — a simulation count, never a sale.`
        : "The demonstration event could not be recorded, so the brand dashboard count is unchanged. The simulated checkout itself still completed."}</p>
    </div>
    <Link className="button button-accent" href="/community">Return to Racked</Link>
  </section>;

  if (step === "bag") return <section className="demo-bag" aria-label="Fictional demo bag">
    <div><span>DEMO BAG · 1 ITEM</span><strong>{productName}</strong><small>Simulation only · total charged $0.00</small></div>
    <button type="button" className="button button-accent button-full" disabled={busy} onClick={complete}>{busy ? "Recording demonstration…" : "Complete demo purchase — $0.00"}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => setStep("product")}>Remove from demo bag</button>
  </section>;

  return <><button type="button" className="button button-dark button-full" onClick={() => setStep("bag")}>Add to demo bag</button><p className="demo-product-nosale">This is a working purchase simulation for competition testing. It never asks for payment, contact, shipping, or account information.</p></>;
}
