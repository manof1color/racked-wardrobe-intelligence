import "server-only";
import { DURABLE_LIMITS, durableDecision, type AiAction, type AiAllowance } from "@/lib/abuse-limits";
import { chargeAccountAllowance, chargeSiteModelCall } from "@/lib/ai-budget";
import type { RateLimitDecision } from "@/lib/rate-limit";
import { incrementSecurityCounter, readSecurityCounter } from "@/lib/server/production-store";

/**
 * The shared limits, applied. The two kinds fail in opposite directions when the counter store
 * cannot be reached, each logged by name only:
 *
 * - **Sign-in, sign-up and reset checks fail open.** The per-instance limiter in rate-limit.ts still
 *   applies, and a storage hiccup must never lock every person out of their account.
 * - **AI budgets fail closed** (lib/ai-budget.ts). A storage hiccup must never mean unmetered paid
 *   model calls; the non-model fallback answers instead.
 */
const OPEN: RateLimitDecision = { allowed: true, retryAfterSeconds: 0 };

function failOpen(check: string, error: unknown) {
  console.error("Shared limit unavailable; failing open", { check, name: error instanceof Error ? error.name : "UnknownError" });
}

const emailKey = (email: string) => email.trim().toLowerCase();

/** Whether this email address is paused after too many wrong passwords. Reads; does not count. */
export async function signInPause(email: string, now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.signInFailuresPerEmail;
  try {
    const { count, resetAt } = await readSecurityCounter(`sign-in-failures:${emailKey(email)}`, rule.windowMs, now);
    return durableDecision(count + 1, rule.limit, resetAt, now);
  } catch (error) {
    failOpen("sign-in pause", error);
    return OPEN;
  }
}

/**
 * A known-device cookie's own failure budget — the same eight wrong passwords per fifteen minutes,
 * counted against the cookie rather than the email (the key is a keyed hash of the cookie). Past it,
 * the cookie no longer exempts its holder from the email's pause.
 */
export async function knownDevicePause(deviceToken: string, now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.signInFailuresPerEmail;
  try {
    const { count, resetAt } = await readSecurityCounter(`sign-in-failures-device:${deviceToken}`, rule.windowMs, now);
    return durableDecision(count + 1, rule.limit, resetAt, now);
  } catch (error) {
    failOpen("known-device pause", error);
    return OPEN;
  }
}

export async function countKnownDeviceFailure(deviceToken: string, now = Date.now()) {
  try {
    await incrementSecurityCounter(`sign-in-failures-device:${deviceToken}`, DURABLE_LIMITS.signInFailuresPerEmail.windowMs, now);
  } catch (error) {
    failOpen("known-device failure count", error);
  }
}

/** Counts a wrong password against the email typed — the same write whether or not it has an account. */
export async function countSignInFailure(email: string, now = Date.now()) {
  try {
    await incrementSecurityCounter(`sign-in-failures:${emailKey(email)}`, DURABLE_LIMITS.signInFailuresPerEmail.windowMs, now);
  } catch (error) {
    failOpen("sign-in failure count", error);
  }
}

export async function claimSignUp(now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.signUpsSiteWide;
  try {
    const { count, resetAt } = await incrementSecurityCounter("sign-ups:site", rule.windowMs, now);
    return durableDecision(count, rule.limit, resetAt, now);
  } catch (error) {
    failOpen("sign-up ceiling", error);
    return OPEN;
  }
}

export async function claimPasswordResetEmail(email: string, now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.passwordResetsPerEmail;
  try {
    const { count, resetAt } = await incrementSecurityCounter(`password-resets:${emailKey(email)}`, rule.windowMs, now);
    return durableDecision(count, rule.limit, resetAt, now);
  } catch (error) {
    failOpen("password reset emails", error);
    return OPEN;
  }
}

/** Spends one request from the account's daily allowance. Call it once per request, before any model call. */
export function spendAiAllowance(action: AiAction, accountId: string, now = Date.now()): Promise<AiAllowance> {
  return chargeAccountAllowance(incrementSecurityCounter, action, accountId, now);
}

/** Spends one model call from the site's daily ceiling. Pass it to `metered` around each model runner. */
export function spendSiteModelCall(): Promise<boolean> {
  return chargeSiteModelCall(incrementSecurityCounter);
}
