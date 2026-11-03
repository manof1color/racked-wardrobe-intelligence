/**
 * The known-device cookie that keeps a password-guessing attacker from locking a person out: the
 * per-email pause applies to the attacker's browser, never to one that already signed in.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isKnownDevice, issueKnownDeviceToken, KNOWN_DEVICE_COOKIE_PATH, KNOWN_DEVICE_MAX_AGE_SECONDS, knownDeviceCookie, knownDeviceSigned } from "../lib/known-device.ts";

const secret = "test-secret-for-known-device-cookies";
const now = Date.UTC(2026, 9, 21, 12);
const owner = { id: "account-owner", passwordChangedAt: Date.UTC(2026, 8, 1) };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a browser that signed in is known for that email address, in any letter case", () => {
  const token = issueKnownDeviceToken("Owner@Example.test", owner, secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", owner, secret, now + 1_000), true);
  assert.equal(isKnownDevice(token, "  OWNER@example.TEST ", owner, secret, now + 1_000), true);
});

test("the cookie helps only the account it was issued for", () => {
  const token = issueKnownDeviceToken("attacker@example.test", { id: "account-attacker" }, secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", owner, secret, now), false, "an attacker's own cookie does not unlock someone else's email");
  assert.equal(isKnownDevice(issueKnownDeviceToken("owner@example.test", owner, secret, now), "owner@example.test", null, secret, now), false, "and no cookie unlocks an email with no account");
});

// REGRESSION: the cookie signed only the email address, so cookies collected before a password
// change kept exempting their holder for 180 days, each with its own budget of wrong passwords.
test("REGRESSION: changing or resetting the password retires every cookie issued before", () => {
  const cookies = Array.from({ length: 12 }, (_, index) => issueKnownDeviceToken("owner@example.test", owner, secret, now + index * 40_000));
  assert.ok(cookies.every((token) => isKnownDevice(token, "owner@example.test", owner, secret, now + 600_000)), "valid while the password is unchanged");
  const afterChange = { ...owner, passwordChangedAt: now + 700_000 };
  assert.equal(cookies.filter((token) => isKnownDevice(token, "owner@example.test", afterChange, secret, now + 800_000)).length, 0, "none survives the change");
  const fresh = issueKnownDeviceToken("owner@example.test", afterChange, secret, now + 900_000);
  assert.equal(isKnownDevice(fresh, "owner@example.test", afterChange, secret, now + 900_000), true, "the owner's next sign-in is known again");
});

test("REGRESSION: a cookie for an email address does not carry over to a new account with that address", () => {
  const before = issueKnownDeviceToken("owner@example.test", { id: "account-old" }, secret, now);
  assert.equal(isKnownDevice(before, "owner@example.test", { id: "account-new" }, secret, now), false);
});

test("a forged, altered, or foreign cookie is refused", () => {
  const token = issueKnownDeviceToken("owner@example.test", owner, secret, now);
  const [issuedAt, tag, signature] = token.split(".");
  assert.equal(isKnownDevice(`${Number(issuedAt) + 1}.${tag}.${signature}`, "owner@example.test", owner, secret, now), false, "a changed date breaks the signature");
  assert.equal(isKnownDevice(token, "owner@example.test", owner, "a-different-secret", now), false, "signed by another deployment");
  assert.equal(isKnownDevice(`${token}.extra`, "owner@example.test", owner, secret, now), false);
  for (const junk of [undefined, null, 7, "", "a.b", "x".repeat(500), "1.2.3"]) {
    assert.equal(isKnownDevice(junk, "owner@example.test", owner, secret, now), false, String(junk));
    assert.equal(knownDeviceSigned(junk, secret, now), false, String(junk));
  }
});

test("it lasts 180 days and is never accepted from the future", () => {
  const token = issueKnownDeviceToken("owner@example.test", owner, secret, now);
  assert.equal(isKnownDevice(token, "owner@example.test", owner, secret, now + KNOWN_DEVICE_MAX_AGE_SECONDS * 1000), true);
  assert.equal(isKnownDevice(token, "owner@example.test", owner, secret, now + KNOWN_DEVICE_MAX_AGE_SECONDS * 1000 + 1), false);
  assert.equal(isKnownDevice(token, "owner@example.test", owner, secret, now - 1), false);
});

test("the cookie names no one and goes only to the sign-in endpoints", () => {
  const cookie = knownDeviceCookie("owner@example.test", owner, secret, true);
  assert.doesNotMatch(cookie.value, /owner|example|account/i, "no email or account id in the cookie");
  assert.deepEqual(cookie.options, { httpOnly: true, sameSite: "lax", secure: true, path: KNOWN_DEVICE_COOKIE_PATH, maxAge: KNOWN_DEVICE_MAX_AGE_SECONDS });
  assert.equal(KNOWN_DEVICE_COOKIE_PATH, "/api/auth");
});

test("sign-in reads the account only for a cookie Racked signed, and binds every cookie it issues", () => {
  const login = read("app/api/auth/login/route.ts");
  assert.match(login, /const deviceAccount=secret&&knownDeviceSigned\(deviceToken,secret\)\?await knownDeviceAccount\(email\)\.catch\(\(\)=>null\):null;/, "no lookup for a stranger without a cookie");
  assert.match(login, /isKnownDevice\(deviceToken,email,deviceAccount,secret!\)/);
  for (const path of ["app/api/auth/login/route.ts", "app/api/auth/register/route.ts", "app/api/auth/two-step/route.ts", "app/api/auth/password-reset/confirm/route.ts"]) {
    assert.match(read(path), /knownDeviceCookie\([^,]+,\s*(?:account|\{id:profile\.id,passwordChangedAt:profile\.passwordChangedAt\}),/, path);
  }
  assert.match(read("lib/server/production-store.ts"), /const account=found\?await getAccount\(found\.id\):null;/, "read strongly consistent, so a password changed a moment ago already counts");
});
