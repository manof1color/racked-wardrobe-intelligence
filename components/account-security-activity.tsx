"use client";

import { useEffect, useState } from "react";
import { ACTIVITY_LABELS, type AccountActivity } from "@/lib/device-label";

/**
 * The account's recent security activity, and the control to end every other session. A person can
 * see each sign-in, failed attempt, and password or detail change on their account, with the device
 * it came from — and if one isn't theirs, sign every other device out. No IP address or location is
 * stored or shown.
 */
export function AccountSecurityActivity() {
  const [activity, setActivity] = useState<AccountActivity[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/account/activity");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Account activity could not be loaded.");
      setActivity(data.activity);
      setLoadError("");
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Account activity could not be loaded.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/activity")
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok) setActivity(data.activity);
        else setLoadError(data.error ?? "Account activity could not be loaded.");
      })
      .catch(() => { if (!cancelled) setLoadError("Account activity could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  async function endOtherSessions() {
    setEnding(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/sessions", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Other devices could not be signed out.");
      setConfirming(false);
      setMessage("Every other device has been signed out. This one stays signed in.");
      void load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Other devices could not be signed out.");
    } finally {
      setEnding(false);
    }
  }

  const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return <section className="settings-card" aria-labelledby="account-activity-title">
    <div className="eyebrow">SECURITY</div>
    <h2 id="account-activity-title">Recent account activity.</h2>
    <p className="account-activity-intro">Sign-ins, failed attempts, and changes to this account over the last 90 days, with the device each came from. If something isn&rsquo;t you, change your password and sign out every other device.</p>
    {loadError
      ? <div className="form-error" role="alert">{loadError}</div>
      : activity === null
        ? <p className="account-activity-empty" role="status">Loading…</p>
        : activity.length === 0
          ? <p className="account-activity-empty">No activity recorded yet.</p>
          : <ul className="account-activity-list">{activity.map((entry, index) => <li key={`${entry.at}-${index}`} className={entry.type === "sign-in-failed" ? "account-activity-warning" : undefined}>
              <strong>{ACTIVITY_LABELS[entry.type] ?? entry.type}</strong>
              <span>{entry.device}</span>
              <time dateTime={entry.at}>{when(entry.at)}</time>
            </li>)}</ul>}
    <div className="account-activity-actions">
      {confirming
        ? <>
            <button type="button" className="button button-small confirm-sign-out" disabled={ending} onClick={endOtherSessions}>{ending ? "Signing out…" : "Confirm: sign out all other devices"}</button>
            <button type="button" className="text-button" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        : <button type="button" className="button button-light button-small" onClick={() => { setConfirming(true); setMessage(""); }}>Sign out of all other devices</button>}
    </div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
  </section>;
}
