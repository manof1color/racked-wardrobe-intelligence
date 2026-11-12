import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BRAND_PENDING_CLAIM_DAYS, pendingClaimExpired } from "../lib/brand-approval.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-30T00:00:00.000Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();

test("a pending brand loses its name claim only after the limit", () => {
  const pending = { role: "brand", brandStatus: "pending" };
  assert.equal(pendingClaimExpired(pending, ago(BRAND_PENDING_CLAIM_DAYS + 1), now), true);
  assert.equal(pendingClaimExpired(pending, ago(BRAND_PENDING_CLAIM_DAYS - 1), now), false);
});

test("approved, revoked, legacy and non-brand accounts never lose a name this way", () => {
  const old = ago(400);
  assert.equal(pendingClaimExpired({ role: "brand", brandStatus: "approved" }, old, now), false);
  assert.equal(pendingClaimExpired({ role: "brand", brandStatus: "revoked" }, old, now), false);
  assert.equal(pendingClaimExpired({ role: "brand" }, old, now), false, "brands created before approval existed count as approved");
  assert.equal(pendingClaimExpired({ role: "consumer" }, old, now), false);
  assert.equal(pendingClaimExpired(null, old, now), false);
});

test("an unreadable claim date never expires a claim", () => {
  const pending = { role: "brand", brandStatus: "pending" };
  for (const bad of [undefined, null, "", "not a date", 5]) assert.equal(pendingClaimExpired(pending, bad, now), false);
});

test("the store revokes the stale account before moving the claim, and the move is conditional", () => {
  const store = read("lib/server/production-store.ts");
  const takeover = store.slice(store.indexOf("async function takeOverExpiredClaim"));
  assert.ok(takeover.indexOf('":revoked"') < takeover.indexOf('ConditionExpression:"accountId = :old"'));
  assert.match(takeover, /ConditionExpression:"brandStatus = :pending"/, "only a still-pending account is revoked");
  assert.match(store, /if\(!await takeOverExpiredClaim\(brandSlug,brandName,accountId\)\)throw new AccountConflictError/);
});

test("with the shared counter down, sign-in falls to a per-instance limit instead of open", () => {
  const guard = read("lib/server/abuse-guard.ts");
  assert.match(guard, /failOpen\("sign-in attempt", error\);\n\s+const rule = DURABLE_LIMITS\.signInFailuresPerEmail;\n\s+return \{\.\.\.consumeRateLimit\(`signin-fallback:/);
});
