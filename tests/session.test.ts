import test from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, verifySessionToken } from "../lib/session.ts";

const secret = "a-test-only-session-secret-with-more-than-32-characters";

test("signed sessions preserve role-based access claims", async () => {
  const expiresAt = Date.now() + 60_000;
  const token = await createSessionToken({ subject:"consumer@demo.racked.local",role:"consumer",expiresAt },secret);
  const payload = await verifySessionToken(token,secret);
  assert.equal(payload?.role,"consumer");
  assert.equal(payload?.subject,"consumer@demo.racked.local");
});

test("tampered and expired sessions are rejected", async () => {
  const token = await createSessionToken({ subject:"brand@demo.racked.local",role:"brand",expiresAt:1000 },secret);
  assert.equal(await verifySessionToken(`${token}x`,secret),null);
  assert.equal(await verifySessionToken(token,secret,1001),null);
});
