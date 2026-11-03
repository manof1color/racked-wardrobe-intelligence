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
 * The cookie names no one: it holds the time it was issued, a keyed hash, and a signature. The hash
 * binds it to the email address, to the account, and to the account's current password: changing
 * or resetting the password retires every cookie issued before, so one kept from before a
 * compromise exempts nothing afterwards, however many were collected. It is not a session and grants
 * nothing by itself — the password is still checked, and the per-client limiter still applies. It
 * is sent only to /api/auth.
 */
export const KNOWN_DEVICE_COOKIE = "racked_known_device";
export const KNOWN_DEVICE_COOKIE_PATH = "/api/auth";
export const KNOWN_DEVICE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/** The account a cookie is bound to: its id and when its password was last set. */
export interface KnownDeviceAccount { id: string; passwordChangedAt?: number }

const accountTag = (email: string, account: KnownDeviceAccount, secret: string) =>
  createHmac("sha256", secret)
    .update(`racked-known-device-account:${email.trim().toLowerCase()}:${account.id}:${account.passwordChangedAt ?? 0}`)
    .digest("base64url").slice(0, 22);
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`racked-known-device:${payload}`).digest("base64url");

export function issueKnownDeviceToken(email: string, account: KnownDeviceAccount, secret: string, now = Date.now()) {
  const payload = `${now}.${accountTag(email, account, secret)}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Whether Racked signed this cookie within the last 180 days. Needs no account, so sign-in reads
 * the account only for a cookie that passes this first: a stranger without one causes no lookup.
 */
export function knownDeviceSigned(token: unknown, secret: string, now = Date.now()): token is string {
  if (typeof token !== "string" || token.length > 200) return false;
  const [issuedAt, tag, signature, extra] = token.split(".");
  if (extra !== undefined || !issuedAt || !tag || !signature || !/^\d{1,16}$/.test(issuedAt)) return false;
  const expected = Buffer.from(sign(`${issuedAt}.${tag}`, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  const age = now - Number(issuedAt);
  return age >= 0 && age <= KNOWN_DEVICE_MAX_AGE_SECONDS * 1000;
}

/** Whether this cookie was issued for this email address, this account and its current password, within 180 days. */
export function isKnownDevice(token: unknown, email: string, account: KnownDeviceAccount | null, secret: string, now = Date.now()) {
  if (!account || !knownDeviceSigned(token, secret, now)) return false;
  return token.split(".")[1] === accountTag(email, account, secret);
}

export function knownDeviceCookie(email: string, account: KnownDeviceAccount, secret: string, production: boolean) {
  return {
    name: KNOWN_DEVICE_COOKIE,
    value: issueKnownDeviceToken(email, account, secret),
    options: { httpOnly: true, sameSite: "lax" as const, secure: production, path: KNOWN_DEVICE_COOKIE_PATH, maxAge: KNOWN_DEVICE_MAX_AGE_SECONDS },
  };
}
