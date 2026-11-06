"use client";
import { useState } from "react";

/** Sends a fictional product to Stripe's hosted test page. The server sets the price and checks the product. */
export function TestCheckoutButton({ productId, label = "Buy with a test card" }: { productId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/test-checkout`, { method: "POST" });
      const body = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (response.ok && body?.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body?.error ?? "Test checkout could not start. Try again shortly.");
    } catch {
      setError("Test checkout could not start. Check your connection and try again.");
    }
    setBusy(false);
  }

  return <div className="test-checkout">
    <button type="button" className="button button-dark" disabled={busy} onClick={start}>{busy ? "Opening Stripe…" : label}</button>
    <small>Stripe test mode on a fictional product. No real money moves and nothing ships. Do not enter a real card.</small>
    {error && <p className="test-checkout-error" role="alert">{error}</p>}
  </div>;
}
