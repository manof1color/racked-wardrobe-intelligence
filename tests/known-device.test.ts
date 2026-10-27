/**
 * The known-device cookie that keeps a password-guessing attacker from locking a person out: the
 * per-email pause applies to the attacker's browser, never to one that already signed in.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { isKnownDevice, issueKnownDeviceToken, KNOWN_DEVICE_COOKIE_PATH, KNOWN_DEVICE_MAX_AGE_SECONDS, knownDeviceCookie } from "../lib/known-device.ts";

const secret = "test-secret-for-known-device-cookies";
const now = Date.UTC(2026, 9, 21, 12);

test("a browser that signed in is known for that email address, in any letter case", () => {
  const token = issueKnownDeviceToken("Owner@Example.test", secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", secret, now + 1_000), true);
  assert.equal(isKnownDevice(token, "  OWNER@example.TEST ", secret, now + 1_000), true);
});

test("the cookie helps only the account it was issued for", () => {
  const token = issueKnownDeviceToken("attacker@example.test", secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", secret, now), false, "an attacker's own cookie does not unlock someone else's email");
});

test("a forged, altered, or foreign cookie is refused", () => {
  const token = issueKnownDeviceToken("owner@example.test", secret, now);
  const [issuedAt, tag, signature] = token.split(".");
  assert.equal(isKnownDevice(`${Number(issuedAt) + 1}.${tag}.${signature}`, "owner@example.test", secret, now), false, "a changed date breaks the signature");
  assert.equal(isKnownDevice(token, "owner@example.test", "a-different-secret", now), false, "signed by another deployment");
  assert.equal(isKnownDevice(`${token}.extra`, "owner@example.test", secret, now), false);
  for (const junk of [undefined, null, 7, "", "a.b", "x".repeat(500), "1.2.3"]) assert.equal(isKnownDevice(junk, "owner@example.test", secret, now), false, String(junk));
});

test("it lasts 180 days and is never accepted from the future", () => {
  const token = issueKnownDeviceToken("owner@example.test", secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", secret, now + KNOWN_DEVICE_MAX_AGE_SECONDS * 1000), true);
  assert.equal(isKnownDevice(token, "owner@example.test", secret, now + KNOWN_DEVICE_MAX_AGE_SECONDS * 1000 + 1), false);
  assert.equal(isKnownDevice(token, "owner@example.test", secret, now - 1), false);
});

test("the cookie names no one and goes only to the sign-in endpoints", () => {
  const cookie = knownDeviceCookie("owner@example.test", secret, true);
  assert.doesNotMatch(cookie.value, /owner|example/i, "no email in the cookie");
  assert.deepEqual(cookie.options, { httpOnly: true, sameSite: "lax", secure: true, path: KNOWN_DEVICE_COOKIE_PATH, maxAge: KNOWN_DEVICE_MAX_AGE_SECONDS });
  assert.equal(KNOWN_DEVICE_COOKIE_PATH, "/api/auth");
});
