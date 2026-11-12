import "server-only";
import { DURABLE_LIMITS, durableDecision, reserveSignInAttempt, signInCounterKey, type AiAction, type AiAllowance } from "@/lib/abuse-limits";
import { chargeAccountAllowance, chargeSiteModelCall } from "@/lib/ai-budget";
import { consumeRateLimit, type RateLimitDecision } from "@/lib/rate-limit";
import { decrementSecurityCounter, incrementSecurityCounter } from "@/lib/server/production-store";

/**
 * The shared limits, applied. The two kinds fail in opposite directions when the counter store
 * cannot be reached, each logged by name only:
 *
 * - **Sign-up and reset checks fail open.** The per-instance limiter in rate-limit.ts still
 *   applies, and a storage hiccup must never lock every person out of their account.
 * - **The sign-in pause fails to a stricter per-instance limit**, not to nothing: while the shared
 *   counter is unreachable, each instance still allows only the shared rule's eight attempts per
 *   email per window. That keeps guessing bounded without locking anyone out for good.
 * - **AI budgets fail closed** (lib/ai-budget.ts). A storage hiccup must never mean unmetered paid
 *   model calls; the non-model fallback answers instead.
 */
const OPEN: RateLimitDecision = { allowed: true, retryAfterSeconds: 0 };

function failOpen(check: string, error: unknown) {
  console.error("Shared limit unavailable; failing open", { check, name: error instanceof Error ? error.name : "UnknownError" });
}

const emailKey = (email: string) => email.trim().toLowerCase();

/** Claims a slot before checking a password, across all server instances. */
export async function claimSignInAttempt(email: string, knownDevice: boolean, now = Date.now()) {
  try {
    const decision=await reserveSignInAttempt(incrementSecurityCounter, email, knownDevice, now);
    return {...decision,reserved:decision.allowed};
  } catch (error) {
    failOpen("sign-in attempt", error);
    const rule = DURABLE_LIMITS.signInFailuresPerEmail;
    return {...consumeRateLimit(`signin-fallback:${signInCounterKey(email, knownDevice)}`, rule, now),reserved:false};
  }
}

export function releaseSignInAttempt(email: string, knownDevice: boolean, now: number) {
  return decrementSecurityCounter(signInCounterKey(email, knownDevice), DURABLE_LIMITS.signInFailuresPerEmail.windowMs, now);
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

/** One more demo of any kind across the site (lib/demo-session.ts). Fails open like sign-up; the AI budgets still fail closed. */
export async function claimDemoSession(now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.demoSessionsSiteWide;
  try {
    const { count, resetAt } = await incrementSecurityCounter("demo-wardrobes:site", rule.windowMs, now);
    return durableDecision(count, rule.limit, resetAt, now);
  } catch (error) {
    failOpen("demo session ceiling", error);
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

const ADDRESS_RULES = {
  "sign-in": DURABLE_LIMITS.signInsPerAddress,
  "sign-up": DURABLE_LIMITS.signUpsPerAddress,
  "reset-request": DURABLE_LIMITS.resetRequestsPerAddress,
  demo: DURABLE_LIMITS.demoSessionsPerAddress,
} as const;

/**
 * Counts one signed-out request against its client address across every server instance (the
 * address `clientIdentifier` takes from the platform's own forwarding entry). Fails open like the
 * other sign-in checks. Unreadable addresses share the same budget for each action.
 */
export async function claimAddressRequest(action: keyof typeof ADDRESS_RULES, address: string, now = Date.now()): Promise<RateLimitDecision> {
  const rule = ADDRESS_RULES[action];
  try {
    const { count, resetAt } = await incrementSecurityCounter(`address:${action}:${address}`, rule.windowMs, now);
    return durableDecision(count, rule.limit, resetAt, now);
  } catch (error) {
    failOpen(`${action} per address`, error);
    return OPEN;
  }
}

/**
 * Counts a two-step code against its account before the code is checked, so requests sent at once
 * cannot each try a code before any is counted. Unlike the sign-in pause this fails **closed**: an
 * unreadable counter must never mean unlimited guesses at a six-digit code.
 */
export async function claimTwoStepAttempt(accountId: string, now = Date.now()): Promise<RateLimitDecision> {
  const rule = DURABLE_LIMITS.twoStepAttemptsPerAccount;
  try {
    const { count, resetAt } = await incrementSecurityCounter(`two-step-attempts:${accountId}`, rule.windowMs, now);
    return durableDecision(count, rule.limit, resetAt, now);
  } catch (error) {
    console.error("Two-step limit unavailable; failing closed", { name: error instanceof Error ? error.name : "UnknownError" });
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

/** Spends one request from the account's daily allowance. Call it once per request, before any model call. */
export function spendAiAllowance(action: AiAction, accountId: string, now = Date.now()): Promise<AiAllowance> {
  return chargeAccountAllowance(incrementSecurityCounter, action, accountId, now);
}

/**
 * Spends one model call from the site's daily ceiling. Pass it to `metered` around each model runner,
 * as `siteModelCallFor(session)` so a demo's call is counted against the demos' share.
 */
export function spendSiteModelCall(demo = false): Promise<boolean> {
  return chargeSiteModelCall(incrementSecurityCounter, Date.now(), undefined, demo);
}

/** The model-call spender for one session: a demo's calls come from the demos' share. */
export function siteModelCallFor(session: { demo?: unknown }) {
  const demo = Boolean(session.demo);
  return () => spendSiteModelCall(demo);
}
