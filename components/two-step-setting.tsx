"use client";

import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";

interface TwoStepStatus { available: boolean; enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; }
type Stage = "status" | "password" | "scan" | "codes" | "replace" | "turn-off";

/** The setup link as a QR code, drawn in the browser: the secret is never sent to a QR service. */
function QrCode({ value }: { value: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
    return { size: qr.size, path: d };
  }, [value]);
  return <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code that adds Racked to your authenticator app" shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff"/>
    <path d={path} fill="#000"/>
  </svg>;
}

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "That didn't work. Try again.");
  return data;
}

/**
 * Two-step sign-in for a brand account: a code from an authenticator app on the owner's phone as
 * well as the password. Free to run — no text messages — and it works with any standard app.
 */
export function TwoStepSetting() {
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [stage, setStage] = useState<Stage>("status");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try { setStatus(await send("/api/account/two-step", "GET")); }
    catch { setStatus(null); }
  }

  useEffect(() => {
    let cancelled = false;
    send("/api/account/two-step", "GET").then((data) => { if (!cancelled) setStatus(data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function go(next: Stage) {
    setStage(next); setError(""); setMessage(""); setPassword(""); setCode(""); setUseRecovery(false);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That didn't work. Try again."); }
    finally { setBusy(false); }
  }

  const begin = () => run(async () => {
    const data = await send("/api/account/two-step/setup", "POST", { currentPassword: password });
    setSetup({ secret: data.secret, uri: data.uri }); go("scan");
  });
  const confirm = () => run(async () => {
    const data = await send("/api/account/two-step/confirm", "POST", { code });
    setSetup(null); setCodes(data.recoveryCodes); go("codes");
    setMessage("Two-step sign-in is on. Every other device was signed out.");
  });
  const replace = () => run(async () => {
    const data = await send("/api/account/two-step/recovery-codes", "POST", { code });
    setCodes(data.recoveryCodes); go("codes");
    setMessage("New recovery codes are ready. The old ones no longer work.");
  });
  const turnOff = () => run(async () => {
    await send("/api/account/two-step", "DELETE", useRecovery ? { currentPassword: password, recoveryCode: code } : { currentPassword: password, code });
    go("status"); setMessage("Two-step sign-in is off."); await load();
  });
  const finish = () => { setCodes([]); go("status"); void load(); };

  async function copyCodes() {
    try { await navigator.clipboard.writeText(codes.join("\n")); setMessage("Recovery codes copied."); }
    catch { setError("Copying isn't allowed here. Select the codes and copy them instead."); }
  }
  function downloadCodes() {
    const file = new Blob([`Racked recovery codes\nEach code works once, if you can't use your authenticator app.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = "racked-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!status?.available) return null;
  const codeField = <label><span>{useRecovery ? "Recovery code" : "6-digit code from the app"}</span>{useRecovery
    ? <input autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} placeholder="abcd-efgh-ijkl-mnop"/>
    : <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9 ]/g, ""))} placeholder="123456"/>}</label>;
  const passwordField = <label><span>Current password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>;
  const cancel = <button type="button" className="text-button" onClick={() => { setSetup(null); go("status"); }}>Cancel</button>;

  return <section className="settings-card" aria-labelledby="two-step-title">
    <div className="eyebrow">SIGN-IN PROTECTION</div>
    <h2 id="two-step-title">Two-step sign-in.</h2>
    <p className="account-activity-intro">Ask for a code from an authenticator app on your phone as well as your password, so a leaked password alone can&rsquo;t open your brand workspace. It&rsquo;s free and uses no text messages: any standard app works, such as Google Authenticator, Microsoft Authenticator, 1Password, or Apple Passwords.</p>

    {stage === "status" && <>
      <div className="two-step-status">
        <span className={`two-step-pill${status.enabled ? " on" : ""}`}>{status.enabled ? "ON" : "OFF"}</span>
        {status.enabled && <span>{status.recoveryCodesLeft} of 10 recovery codes left{status.enabledAt ? ` · on since ${new Date(status.enabledAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}</span>}
      </div>
      <div className="two-step-actions">
        {status.enabled
          ? <>
              <button type="button" className="button button-light button-small" onClick={() => go("replace")}>Create new recovery codes</button>
              <button type="button" className="text-button" onClick={() => go("turn-off")}>Turn off</button>
            </>
          : <button type="button" className="button button-accent button-small" onClick={() => go("password")}>Set up two-step sign-in</button>}
      </div>
    </>}

    {stage === "password" && <>
      <div className="auth-fields">{passwordField}</div>
      <div className="two-step-actions"><button type="button" className="button button-accent button-small" disabled={busy || !password} onClick={begin}>{busy ? "Checking…" : "Continue"}</button>{cancel}</div>
    </>}

    {stage === "scan" && setup && <>
      <div className="two-step-setup">
        <div className="two-step-qr"><QrCode value={setup.uri}/></div>
        <div>
          <p><strong>1.</strong> In your authenticator app, add an account and scan this code.</p>
          <p>Can&rsquo;t scan it? Enter this key instead, or <a href={setup.uri}>open it in the app</a> on this device:</p>
          <code className="two-step-key">{setup.secret}</code>
          <p><strong>2.</strong> Enter the 6-digit code the app now shows for Racked.</p>
        </div>
      </div>
      <div className="auth-fields">{codeField}</div>
      <div className="two-step-actions"><button type="button" className="button button-accent button-small" disabled={busy || !code.trim()} onClick={confirm}>{busy ? "Checking…" : "Turn on two-step sign-in"}</button>{cancel}</div>
    </>}

    {stage === "codes" && <>
      <p><strong>Save these recovery codes now.</strong> If you lose your phone, each one signs you in once. This is the only time they&rsquo;re shown.</p>
      <ul className="two-step-codes">{codes.map((value) => <li key={value}>{value}</li>)}</ul>
      <div className="two-step-actions">
        <button type="button" className="button button-light button-small" onClick={copyCodes}>Copy</button>
        <button type="button" className="button button-light button-small" onClick={downloadCodes}>Download as a text file</button>
        <button type="button" className="button button-accent button-small" onClick={finish}>I&rsquo;ve saved them</button>
      </div>
    </>}

    {stage === "replace" && <>
      <p>New codes replace every unused one. Enter a code from your authenticator app to continue.</p>
      <div className="auth-fields">{codeField}</div>
      <div className="two-step-actions"><button type="button" className="button button-accent button-small" disabled={busy || !code.trim()} onClick={replace}>{busy ? "Checking…" : "Create new codes"}</button>{cancel}</div>
    </>}

    {stage === "turn-off" && <>
      <p>Without two-step sign-in, your password alone opens this workspace.</p>
      <div className="auth-fields">{passwordField}{codeField}</div>
      <div className="two-step-actions">
        <button type="button" className="button button-small confirm-turn-off" disabled={busy || !password || !code.trim()} onClick={turnOff}>{busy ? "Turning off…" : "Turn off two-step sign-in"}</button>
        <button type="button" className="text-button" onClick={() => { setUseRecovery(!useRecovery); setCode(""); }}>{useRecovery ? "Use the app code instead" : "Use a recovery code"}</button>
        {cancel}
      </div>
    </>}

    {error && <div className="form-error" role="alert">{error}</div>}
    {message && <div className="success-banner" role="status">{message}</div>}
  </section>;
}
