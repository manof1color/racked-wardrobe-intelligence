import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A trap for scripted sign-ups and reset-email floods, with no CAPTCHA and nothing sent to a third
 * party. Two checks, both invisible to a person:
 *
 * - **A honeypot field.** The form carries an input a person never sees or reaches with the
 *   keyboard. Form-filling bots fill every field they find; anything in it means a bot.
 * - **A signed form token.** The page is served with the time it was issued, signed with the
 *   session secret. A submission must come back with an unaltered token, at least a couple of
 *   seconds after the page was served — a person needs longer than that to type an email and
 *   password — and within two hours. A script posting straight to the API has no token at all.
 */
export const HONEYPOT_FIELD = "website";
export const MIN_FORM_FILL_MS = 2_500;
export const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;

const sign = (issuedAt: string, secret: string) => createHmac("sha256", secret).update(`racked-form:${issuedAt}`).digest("base64url");

export function issueFormToken(secret: string, now = Date.now()) {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt, secret)}`;
}

export type FormCheck = { ok: true } | { ok: false; reason: "honeypot" | "invalid" | "too-fast" | "expired" };

export function checkFormSubmission(input: { token: unknown; honeypot: unknown; secret: string; now?: number }): FormCheck {
  const now = input.now ?? Date.now();
  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") return { ok: false, reason: "honeypot" };
  if (typeof input.token !== "string" || input.token.length > 200) return { ok: false, reason: "invalid" };
  const [issuedAt, signature] = input.token.split(".");
  if (!issuedAt || !signature || !/^\d{1,16}$/.test(issuedAt)) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(issuedAt, input.secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return { ok: false, reason: "invalid" };
  const age = now - Number(issuedAt);
  if (age < MIN_FORM_FILL_MS) return { ok: false, reason: "too-fast" };
  if (age > MAX_FORM_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** What a person sees when a check fails. A bot learns nothing about which check it failed. */
export function formCheckMessage(check: Exclude<FormCheck, { ok: true }>) {
  return check.reason === "expired"
    ? "This page has been open a long time. Refresh it and try again."
    : "We couldn't complete that request. Refresh the page and try again.";
}
