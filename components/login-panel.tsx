"use client";
import Link from "next/link";
import { useState } from "react";
import type { Role } from "@/lib/types";

export function LoginPanel() {
  const [role,setRole] = useState<Role>("consumer");
  const [consent,setConsent] = useState(false);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const account = role === "consumer" ? "consumer@demo.racked.local" : "brand@demo.racked.local";
  async function enterDemo() {
    setBusy(true); setError("");
    const response = await fetch("/api/auth/demo", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ role, email:account, password:"demo2026", consent:role === "brand" || consent }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Could not sign in."); setBusy(false); return; }
    window.location.assign(data.destination);
  }
  return (
    <main className="auth-shell">
      <Link className="wordmark auth-logo" href="/">RACKED<span>.</span></Link>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="eyebrow">FICTIONAL JUDGE ENVIRONMENT</div>
        <h1 id="auth-title">Choose a side of the rack.</h1>
        <p>Both accounts use seeded, fictional data. Switch roles anytime during the demo.</p>
        <div className="role-switch" role="group" aria-label="Demo account type">
          <button className={role === "consumer" ? "active" : ""} onClick={() => {setRole("consumer");setError("");}}>Consumer</button>
          <button className={role === "brand" ? "active" : ""} onClick={() => {setRole("brand");setError("");}}>Brand</button>
        </div>
        <div className="demo-account"><span className="avatar">{role === "consumer" ? "MC" : "NA"}</span><div><small>{role === "consumer" ? "Maya Chen · fictional" : "Northstar Atelier · fictional"}</small><strong>{account}</strong></div><span className="demo-pill">DEMO</span></div>
        {role === "consumer" && <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>I opt in to this demo analysis.</strong><small>Racked may use this fictional wardrobe and wear history to create recommendations and anonymous segment insights. Raw wardrobe details are never shown to brands.</small></span></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-accent button-full" disabled={busy || (role === "consumer" && !consent)} onClick={enterDemo}>{busy ? "Opening workspace…" : `Enter ${role} demo`} <span aria-hidden="true">→</span></button>
        <p className="auth-fineprint">Access is protected by a signed, HTTP-only session. Production deployment replaces demo accounts with Amazon Cognito.</p>
      </section>
    </main>
  );
}
