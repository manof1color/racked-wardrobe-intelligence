/**
 * The sign-up and reset bot trap: a honeypot field and a signed, timestamped form token. No CAPTCHA,
 * nothing sent to a third party, and nothing a person ever sees.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFormSubmission, formCheckMessage, issueFormToken, MAX_FORM_AGE_MS, MIN_FORM_FILL_MS } from "../lib/bot-trap.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const secret = "test-secret-for-the-bot-trap";
const issued = Date.UTC(2026, 9, 21, 12, 0, 0);
const token = issueFormToken(secret, issued);

test("a person who takes a few seconds to fill the form passes", () => {
  assert.deepEqual(checkFormSubmission({ token, honeypot: "", secret, now: issued + 8_000 }), { ok: true });
  assert.deepEqual(checkFormSubmission({ token, honeypot: undefined, secret, now: issued + MIN_FORM_FILL_MS }), { ok: true });
});

test("a filled honeypot is a bot, whatever else it sends", () => {
  assert.deepEqual(checkFormSubmission({ token, honeypot: "https://spam.example", secret, now: issued + 8_000 }), { ok: false, reason: "honeypot" });
});

test("no token, a forged token, or another secret's token is refused", () => {
  assert.deepEqual(checkFormSubmission({ token: undefined, honeypot: "", secret, now: issued + 8_000 }), { ok: false, reason: "invalid" });
  assert.deepEqual(checkFormSubmission({ token: `${issued - 60_000}.${token.split(".")[1]}`, honeypot: "", secret, now: issued + 8_000 }), { ok: false, reason: "invalid" }, "the timestamp cannot be backdated");
  assert.deepEqual(checkFormSubmission({ token, honeypot: "", secret: "another-secret", now: issued + 8_000 }), { ok: false, reason: "invalid" });
  assert.deepEqual(checkFormSubmission({ token: "x".repeat(300), honeypot: "", secret, now: issued + 8_000 }), { ok: false, reason: "invalid" });
});

test("a form submitted faster than a person could type, or long after, is refused", () => {
  assert.deepEqual(checkFormSubmission({ token, honeypot: "", secret, now: issued + 400 }), { ok: false, reason: "too-fast" });
  assert.deepEqual(checkFormSubmission({ token, honeypot: "", secret, now: issued + MAX_FORM_AGE_MS + 1 }), { ok: false, reason: "expired" });
});

test("a bot learns nothing about which check failed; a stale page is told to refresh", () => {
  const generic = "We couldn't complete that request. Refresh the page and try again.";
  assert.equal(formCheckMessage({ ok: false, reason: "honeypot" }), generic);
  assert.equal(formCheckMessage({ ok: false, reason: "too-fast" }), generic);
  assert.equal(formCheckMessage({ ok: false, reason: "invalid" }), generic);
  assert.match(formCheckMessage({ ok: false, reason: "expired" }), /open a long time/);
});

test("sign-up checks the trap before any account work; reset requests skip the email silently", () => {
  const register = read("app/api/auth/register/route.ts");
  assert.ok(register.indexOf("checkFormSubmission(") < register.indexOf("await createAccount("));
  assert.ok(register.indexOf("checkFormSubmission(") < register.indexOf("await claimSignUp()"), "a bot never spends a sign-up slot");
  const reset = read("app/api/auth/password-reset/request/route.ts");
  assert.match(reset, /const human=!secret\|\|checkFormSubmission\(/);
  assert.match(reset, /if\(human&&body\?\.email/);
});

test("both forms carry the hidden field and the page's token", () => {
  const login = read("components/login-panel.tsx");
  assert.match(login, /body:JSON\.stringify\(\{email,password,role,displayName,brandName,consent,formToken,website:trap\}\)/);
  assert.match(login, /<div className="form-trap" aria-hidden="true"><label>Website<input tabIndex=\{-1\} autoComplete="off" name="website"/, "unseen, unreachable by keyboard, skipped by screen readers");
  const reset = read("components/password-reset-panels.tsx");
  assert.match(reset, /body:JSON\.stringify\(\{email,formToken,website:trap\}\)/);
  assert.match(read("app/login/page.tsx"), /formToken=\{secret\?issueFormToken\(secret\):null\}/);
  const forgot = read("app/forgot-password/page.tsx");
  assert.match(forgot, /export const dynamic="force-dynamic";/, "each visitor gets a freshly timed token, not one baked in at build");
  assert.match(read("app/globals.css"), /\.form-trap\{position:absolute;left:-10000px/);
});
