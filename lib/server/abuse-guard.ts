import "server-only";
import { aiAllowance, DAY_MS, DURABLE_LIMITS, durableDecision, type AiAction, type AiAllowance } from "@/lib/abuse-limits";
import type { RateLimitDecision } from "@/lib/rate-limit";
import { incrementSecurityCounter, readSecurityCounter } from "@/lib/server/production-store";

/**
 * The shared limits, applied. If the counter store cannot be reached, a check fails open: the
 * per-instance limiter in rate-limit.ts still applies, and a storage hiccup must never lock every
 * person out of their account. Each failure is logged by name only.
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

/**
 * Spends one model-backed request from the account's daily allowance and the site's daily ceiling.
 * Call it once per request, before the model is called.
 */
export async function spendAiAllowance(action: AiAction, accountId: string, now = Date.now()): Promise<AiAllowance> {
  try {
    const [account, site] = await Promise.all([
      incrementSecurityCounter(`ai:${action}:${accountId}`, DAY_MS, now),
      incrementSecurityCounter("ai:site", DAY_MS, now),
    ]);
    return aiAllowance(action, account.count, site.count, now);
  } catch (error) {
    failOpen(`ai allowance (${action})`, error);
    return { allowed: true };
  }
}
