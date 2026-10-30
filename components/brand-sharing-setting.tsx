"use client";

import { useEffect, useState } from "react";
import { BRAND_SHARING_TERMS } from "@/lib/brand-sharing-consent";

/**
 * Anonymous brand insights: the one switch that lets a person's wear count towards a brand's
 * anonymous totals. It is asked once at sign-up and lives here afterwards, so the wardrobe screens
 * stay about the wardrobe. Every change is recorded with the words shown (lib/brand-sharing-consent.ts).
 */
export function BrandSharingSetting() {
  const [sharing, setSharing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consumer/consent")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled) setSharing(typeof data?.brandDataSharing === "boolean" ? data.brandDataSharing : false); })
      .catch(() => { if (!cancelled) setError("Your sharing choice could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  async function change(next: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/consumer/consent", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ brandDataSharing: next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your sharing choice could not be saved.");
      setSharing(data.brandDataSharing === true);
      setMessage(data.brandDataSharing ? "Sharing is on. Your wear counts towards anonymous totals of 25 or more people." : "Sharing is off. Your wear stops counting towards brand totals from now on.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your sharing choice could not be saved.");
    } finally { setBusy(false); }
  }

  return <section className="settings-card" aria-labelledby="brand-sharing-title">
    <div className="eyebrow">PRIVACY</div>
    <h2 id="brand-sharing-title">Anonymous brand insights.</h2>
    <p>{BRAND_SHARING_TERMS.text}</p>
    <p>Your wear points and streak are the same either way.</p>
    <div className="settings-readonly">
      <small>CURRENTLY</small>
      <strong>{sharing === null ? "Loading…" : sharing ? "On" : "Off"}</strong>
      {sharing !== null && <button type="button" role="switch" aria-checked={sharing} aria-labelledby="brand-sharing-title" className={`button button-small ${sharing ? "button-light" : "button-dark"}`} disabled={busy} onClick={() => void change(!sharing)}>{busy ? "Saving…" : sharing ? "Turn off" : "Turn on"}</button>}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">✓ {message}</div>}
  </section>;
}
