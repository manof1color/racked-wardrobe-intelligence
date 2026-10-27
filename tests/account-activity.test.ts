/**
 * The account's own security activity log, and "sign out of all other devices". A person can see
 * every sign-in, failed attempt, and change on their account with the device it came from — never
 * an IP address or location — and end every other session if something isn't theirs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIVITY_LABELS, ACTIVITY_RETENTION_DAYS, deviceLabel, type AccountActivityType } from "../lib/device-label.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const store = read("lib/server/production-store.ts");

test("a device is described plainly, not fingerprinted", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0"), "Edge on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:131.0) Gecko/20100101 Firefox/131.0"), "Firefox on Mac");
  assert.equal(deviceLabel(""), "Unknown device");
  assert.equal(deviceLabel("curl/8.0"), "Unknown device");
});

test("every kind of event reads plainly in Settings, and is kept for 90 days", () => {
  const types: AccountActivityType[] = ["sign-in", "sign-in-failed", "account-created", "password-changed", "password-reset", "details-updated", "signed-out-everywhere", "brand-sharing-on", "brand-sharing-off"];
  for (const type of types) assert.ok(ACTIVITY_LABELS[type], type);
  assert.equal(ACTIVITY_RETENTION_DAYS, 90);
});

test("an event stores its type, time, and device — and nothing that locates a person", () => {
  const record = store.slice(store.indexOf("export async function recordAccountActivity"), store.indexOf("export async function recordFailedSignIn"));
  assert.match(record, /Item:\{PK:`USER#\$\{accountId\}`,SK:`ACTIVITY#\$\{at\}#\$\{crypto\.randomUUID\(\)\}`,type,at,device:device\.slice\(0,60\),ttl:/);
  assert.doesNotMatch(record, /ip|forwarded|address|location/i);
});

test("the owner sees failed attempts on their email, merged with their own events", () => {
  const list = store.slice(store.indexOf("export async function listAccountActivity"), store.indexOf("export async function endOtherSessions"));
  assert.match(list, /":pk":`USER#\$\{accountId\}`,":sk":"ACTIVITY#"/);
  assert.match(list, /":pk":`SIGNIN#\$\{securityKey\(account\.email\)\}`,":sk":"FAILED#"/);
  assert.match(list, /\.sort\(\(a,b\)=>b\.at\.localeCompare\(a\.at\)\)\s*\.slice\(0,20\)/);
});

test("every account event is recorded where it happens", () => {
  assert.match(read("app/api/auth/login/route.ts"), /recordAccountActivity\(account\.id,"sign-in",device\)/);
  assert.match(read("app/api/auth/register/route.ts"), /recordAccountActivity\(account\.id,"account-created",/);
  assert.match(read("app/api/account/route.ts"), /recordAccountActivity\(account\.id,body\.newPassword\?"password-changed":"details-updated",/);
  assert.match(read("app/api/auth/password-reset/confirm/route.ts"), /recordAccountActivity\(account\.id,"password-reset",/);
  assert.match(read("app/api/account/sessions/route.ts"), /recordAccountActivity\(account\.id,"signed-out-everywhere",/);
});

test("activity is only ever the session's own account", () => {
  const route = read("app/api/account/activity/route.ts");
  assert.match(route, /listAccountActivity\(session\.subject\)/);
  assert.match(route, /export async function GET\(\)\{/, "the handler takes no request at all, so nothing in one can choose the account");
  assert.doesNotMatch(route, /searchParams|request\.json/);
});

test("signing out every other device raises the session version and keeps this one signed in", () => {
  const end = store.slice(store.indexOf("export async function endOtherSessions"), store.indexOf("export async function getAccount"));
  assert.match(end, /UpdateExpression:"SET sessionVersion = if_not_exists\(sessionVersion, :zero\) \+ :one"/);
  const route = read("app/api/account/sessions/route.ts");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /endOtherSessions\(session\.subject\)/);
  assert.match(route, /createSessionToken\(\{subject:account\.id,role:account\.role,sessionVersion:account\.sessionVersion\?\?0/, "this device gets a session at the new version");
  assert.match(route, /consumeRateLimit\(`end-sessions:\$\{session\.subject\}`,RATE_LIMIT_RULES\.endSessions\)/);
});

test("Settings shows the activity and asks twice before signing other devices out", () => {
  assert.match(read("components/account-settings-panel.tsx"), /<AccountSecurityActivity\/>/);
  const panel = read("components/account-security-activity.tsx");
  assert.match(panel, /fetch\("\/api\/account\/activity"\)/);
  assert.match(panel, /Confirm: sign out all other devices/);
  assert.match(panel, /fetch\("\/api\/account\/sessions", \{ method: "DELETE" \}\)/);
  assert.match(panel, /account-activity-warning/, "failed attempts stand out");
});
