import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two-step sign-in with an authenticator app (TOTP, RFC 6238), offered to brand accounts.
 *
 * It costs nothing to run. The code comes from an app on the person's own phone — Google
 * Authenticator, Microsoft Authenticator, 1Password, Apple Passwords — so there is no text message or
 * email to pay for, and checking a code is one HMAC.
 *
 * - The shared secret is stored sealed with AES-256-GCM under a key derived from SESSION_SECRET and
 *   bound to its account, so a copy of the table alone cannot produce codes, and a sealed secret
 *   copied onto another account does not open.
 * - A code works once: the time step it matched is recorded, and a code from that step or an earlier
 *   one is refused.
 * - Recovery codes are stored only as hashes and each works once.
 * - Between the password and the code the browser holds a five-minute challenge signed for this
 *   purpose alone, so it can never be read as a session, nor a session as a challenge.
 *
 * Everything here is pure and is tested against the RFCs' own vectors (tests/two-step.test.ts).
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** One step either side of now, for a phone clock that is a little off. */
const TOTP_DRIFT_STEPS = 1;
export const TWO_STEP_CHALLENGE_COOKIE = "racked_two_step";
export const TWO_STEP_CHALLENGE_PATH = "/api/auth/two-step";
export const TWO_STEP_CHALLENGE_MS = 5 * 60 * 1000;
/** How long a new secret waits for its first code before setup has to start again. */
export const TWO_STEP_SETUP_MS = 10 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;
const ISSUER = "Racked";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding: how authenticator apps take a secret typed by hand. */
export function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) { output += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

/** RFC 4226: the code for one counter value. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}

export const timeStep = (now: number) => Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

/** RFC 6238: the code for the moment `now`. */
export function totp(secret: Uint8Array, now: number, digits = TOTP_DIGITS) {
  return hotp(secret, timeStep(now), digits);
}

/**
 * The time step a typed code belongs to, if it is within a step of now and later than the last step
 * accepted for this account; otherwise null. Every candidate is compared, so the time taken does
 * not say which step matched.
 */
export function acceptedStep(secret: Uint8Array, code: unknown, now: number, lastStep?: number | null) {
  const digits = typeof code === "string" ? code.replace(/\s/g, "") : "";
  if (!/^\d{6}$/.test(digits)) return null;
  const current = timeStep(now), typed = Buffer.from(digits);
  let found: number | null = null;
  for (let step = current - TOTP_DRIFT_STEPS; step <= current + TOTP_DRIFT_STEPS; step++) {
    const matches = timingSafeEqual(Buffer.from(hotp(secret, step)), typed);
    if (matches && found === null && step > (lastStep ?? -1)) found = step;
  }
  return found;
}

/** 160 random bits, the length RFC 4226 recommends. */
export function createAuthenticatorSecret() {
  return randomBytes(20);
}

/** The otpauth:// link an authenticator app reads from the QR code. The label names the account on the person's own phone. */
export function otpauthUri(secret: Uint8Array, accountName: string) {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(accountName)}`;
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

function sealingKey(sessionSecret: string) {
  return Buffer.from(hkdfSync("sha256", sessionSecret, "racked-two-step", "authenticator-secret-v1", 32));
}
const sealingContext = (accountId: string) => Buffer.from(`racked-two-step:${accountId}`);

/** The secret as stored: `v1.<iv>.<ciphertext and tag>`, bound to its account. */
export function sealSecret(secret: Uint8Array, sessionSecret: string, accountId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(sessionSecret), iv);
  cipher.setAAD(sealingContext(accountId));
  const sealed = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
  return `v1.${iv.toString("base64url")}.${sealed.toString("base64url")}`;
}

/** The stored secret, or null if it is malformed, altered, sealed for another account, or sealed under another SESSION_SECRET. */
export function openSecret(sealed: unknown, sessionSecret: string, accountId: string): Buffer | null {
  if (typeof sealed !== "string") return null;
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url"), body = Buffer.from(parts[2], "base64url");
    if (iv.length !== 12 || body.length <= 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(sessionSecret), iv);
    decipher.setAAD(sealingContext(accountId));
    decipher.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
  } catch {
    return null;
  }
}

/** Ten single-use codes of 80 random bits each, written `abcd-efgh-ijkl-mnop`. Shown once, stored only as hashes. */
export function createRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, () => base32Encode(randomBytes(10)).toLowerCase().match(/.{4}/g)!.join("-"));
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[\s-]/g, "");

export function isRecoveryCodeShape(code: unknown): code is string {
  return typeof code === "string" && code.length <= 40 && /^[a-z2-7]{16}$/.test(normalizeRecoveryCode(code));
}

/**
 * What is stored for a recovery code. 80 random bits need no key to resist guessing, so the hash
 * does not depend on SESSION_SECRET and recovery codes still work if that secret is ever replaced.
 */
export function recoveryCodeHash(accountId: string, code: string) {
  return createHash("sha256").update(`racked-recovery:${accountId}:${normalizeRecoveryCode(code)}`).digest("base64url");
}

export interface TwoStepChallenge { subject: string; sessionVersion: number; expiresAt: number; }

const challengeSignature = (body: string, secret: string) => createHmac("sha256", secret).update(`racked-two-step-challenge:${body}`).digest();

/** Issued once the password is right. Carries no role, and is signed under its own prefix, so it is never a session. */
export function createTwoStepChallenge(challenge: TwoStepChallenge, secret: string) {
  const body = Buffer.from(JSON.stringify({ subject: challenge.subject, sessionVersion: challenge.sessionVersion, expiresAt: challenge.expiresAt })).toString("base64url");
  return `${body}.${challengeSignature(body, secret).toString("base64url")}`;
}

export function readTwoStepChallenge(token: unknown, secret: string, now = Date.now()): TwoStepChallenge | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = challengeSignature(parts[0], secret), given = Buffer.from(parts[1], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<TwoStepChallenge>;
    if (typeof value.subject !== "string" || !value.subject || !Number.isInteger(value.sessionVersion) || value.sessionVersion! < 0) return null;
    if (typeof value.expiresAt !== "number" || value.expiresAt <= now || value.expiresAt > now + TWO_STEP_CHALLENGE_MS) return null;
    return { subject: value.subject, sessionVersion: value.sessionVersion!, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

/** The stored fields, as far as the rest of the app needs to know them. */
export interface TwoStepFields {
  twoStepSecret?: string;
  twoStepRecovery?: Set<string> | string[];
}

export const twoStepEnabled = (account: TwoStepFields | null | undefined) => typeof account?.twoStepSecret === "string";

/**
 * Offered to brand accounts, except the shared DEMO accounts judges sign into: one person turning it
 * on there would lock every other judge out.
 */
export const twoStepOffered = (account: { role: string; dataClassification?: string }) => account.role === "brand" && account.dataClassification !== "DEMO";

export function recoveryCodesLeft(account: TwoStepFields) {
  const codes = account.twoStepRecovery;
  return codes instanceof Set ? codes.size : Array.isArray(codes) ? codes.length : 0;
}
