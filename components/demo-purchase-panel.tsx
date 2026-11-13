"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPrice } from "@/lib/demo-storefront";
import { REFERRAL_COMMISSION_RATE, referralSplit } from "@/lib/pricing";
import { signalJudgeTourProgress } from "@/lib/judge-tour";
import { TestCheckoutButton } from "./test-checkout-button";

type DemoPurchaseStep = "product" | "bag" | "complete";

// Judge note: completing this simulation now writes one identity-free demonstration
// event so the owning fictional brand can watch it arrive on its dashboard during a
// live demo. It still takes no payment, creates no order, and collects nothing about
// the person. The "Buy with a test card" button (Stripe test mode, offered only when the
// page says so, and then the only button) records nothing here: it never touches the demonstration count. If the recording call fails the simulation still completes — the point of
// the step is the commerce handoff, not the counter.
export function DemoPurchasePanel({ productId, productName, unavailable, sourcePostId, testCheckout = false, price, currency = "USD" }: { productId: string; productName: string; unavailable: boolean; sourcePostId?: string; testCheckout?: boolean; price?: number; currency?: string }) {
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
      signalJudgeTourProgress("community-purchase");
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
      {/* The proposed referral commission (lib/pricing.ts), illustrated on this simulation, as the Stripe test page does. Nothing is split or moved. */}
      {typeof price === "number" && price > 0 && <p className="demo-purchase-split">If a real shopper had bought this on the brand&rsquo;s own site after a Racked link, the brand would pay Racked&rsquo;s {REFERRAL_COMMISSION_RATE * 100}% referral commission of <strong>{formatPrice(referralSplit(price).commission, currency)}</strong> and keep <strong>{formatPrice(referralSplit(price).brandReceives, currency)}</strong>. In this simulation nothing is split or moved.</p>}
    </div>
    <Link className="button button-accent" href="/community">Return to Racked</Link>
  </section>;

  if (step === "bag") return <section className="demo-bag" aria-label="Fictional demo bag">
    <div><span>DEMO BAG · 1 ITEM</span><strong>{productName}</strong><small>Simulation only · total charged $0.00</small></div>
    <button type="button" className="button button-accent button-full" disabled={busy} onClick={complete}>{busy ? "Recording demonstration…" : "Complete demo purchase — $0.00"}</button>
    <button type="button" className="text-button" disabled={busy} onClick={() => setStep("product")}>Remove from demo bag</button>
  </section>;

  // One purchase button on every screen (owner decision 2026-11-13): with a Stripe test key it is the
  // test card, labelled as it is in Community; without one, the $0.00 demo bag is the only action.
  if (testCheckout) return <TestCheckoutButton productId={productId} fullWidth />;
  return <>
    <button type="button" className="button button-dark button-full" onClick={() => setStep("bag")}>Add to demo bag</button>
    <p className="demo-product-nosale">A purchase simulation that asks for no card, contact, shipping or account details. Fictional product: no real money moves and nothing ships.</p>
  </>;
}
