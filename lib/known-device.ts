import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Keeps a password-guessing attacker from locking a person out of their own account.
 *
 * Wrong passwords pause an email address for the rest of a 15-minute window (lib/abuse-limits.ts).
 * On its own that pause is a weapon: anyone can type eight wrong passwords for someone else's email
 * every fifteen minutes and keep them out indefinitely. So a browser that has signed in to that
 * account before — or has just set a new password from the emailed reset link — carries a signed
 * "known device" cookie for that email address, and the pause does not apply to it. An attacker
 * guessing from their own machine has no such cookie, and the pause still stops them.
 *
 * The cookie names no one: it holds the time it was issued, a keyed hash of the email address, and
 * a signature. It is not a session and grants nothing by itself — the password is still checked,
 * and the per-client limiter still applies. It is sent only to /api/auth.
 */
export const KNOWN_DEVICE_COOKIE = "racked_known_device";
export const KNOWN_DEVICE_COOKIE_PATH = "/api/auth";
export const KNOWN_DEVICE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

const emailTag = (email: string, secret: string) =>
  createHmac("sha256", secret).update(`racked-known-device-email:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 22);
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`racked-known-device:${payload}`).digest("base64url");

export function issueKnownDeviceToken(email: string, secret: string, now = Date.now()) {
  const payload = `${now}.${emailTag(email, secret)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Whether this cookie was issued by Racked, for this email address, within the last 180 days. */
export function isKnownDevice(token: unknown, email: string, secret: string, now = Date.now()) {
  if (typeof token !== "string" || token.length > 200) return false;
  const [issuedAt, tag, signature, extra] = token.split(".");
  if (extra !== undefined || !issuedAt || !tag || !signature || !/^\d{1,16}$/.test(issuedAt)) return false;
  const expected = Buffer.from(sign(`${issuedAt}.${tag}`, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  const age = now - Number(issuedAt);
  if (age < 0 || age > KNOWN_DEVICE_MAX_AGE_SECONDS * 1000) return false;
  return tag === emailTag(email, secret);
}

export function knownDeviceCookie(email: string, secret: string, production: boolean) {
  return {
    name: KNOWN_DEVICE_COOKIE,
    value: issueKnownDeviceToken(email, secret),
    options: { httpOnly: true, sameSite: "lax" as const, secure: production, path: KNOWN_DEVICE_COOKIE_PATH, maxAge: KNOWN_DEVICE_MAX_AGE_SECONDS },
  };
}
