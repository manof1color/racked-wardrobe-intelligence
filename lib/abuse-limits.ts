/**
 * Limits that hold across every server instance, and what they say when they are reached.
 *
 * The in-memory limiter in rate-limit.ts lives in each warm instance, so an attacker whose
 * requests land on many instances gets many budgets. These limits are counted in DynamoDB, shared
 * by all of them. They are keyed on what an attack is aimed at — an email address, an account, the
 * site's AI budget — rather than on an IP address: the client address a request reports in
 * X-Forwarded-For can be supplied by the client itself, so per-address limits belong at the edge
 * (AWS WAF), where the real address is known.
 *
 * Every key is stored as a keyed hash, never as the email or account id itself.
 */
import type { RateLimitDecision } from "./rate-limit.ts";

export interface DurableRule {
  limit: number;
  windowMs: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DURABLE_LIMITS = {
  /** Wrong passwords for one email address before it is paused for the rest of the window. */
  signInFailuresPerEmail: { limit: 8, windowMs: 15 * 60 * 1000 },
  /** New accounts across the whole site: generous for real sign-ups, a wall for a script. */
  signUpsSiteWide: { limit: 100, windowMs: 60 * 60 * 1000 },
  /** Reset emails to one address, so nobody can flood someone's inbox through Racked. */
  passwordResetsPerEmail: { limit: 3, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, DurableRule>;

/**
 * "Denial of wallet": every scan and Hanger message is a paid model call, so a flood of them
 * spends real money even when nothing breaks. Each account has a daily allowance per action, and
 * the whole site has a daily ceiling on model-backed requests. The allowances sit far above
 * anything a person uses in a day.
 */
export type AiAction = "scan" | "hanger" | "brand-describe" | "brand-hanger";

export const AI_DAILY_ALLOWANCE: Record<AiAction, number> = {
  scan: 40,
  hanger: 120,
  "brand-describe": 40,
  "brand-hanger": 60,
};

/** Model-backed requests per day across every account; `AI_DAILY_CEILING` overrides it. */
export const DEFAULT_AI_DAILY_CEILING = 1_000;

export function aiDailyCeiling(configured: string | undefined = process.env.AI_DAILY_CEILING) {
  const value = Number(configured);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_AI_DAILY_CEILING;
}

/** Whether a counter at `count` (this request included) is still inside `limit`. */
export function durableDecision(count: number, limit: number, resetAt: number, now = Date.now()): RateLimitDecision {
  if (count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
}

/** The start of the window `now` falls in; windows are aligned so every instance agrees. */
export function windowStart(now: number, windowMs: number) {
  return Math.floor(now / windowMs) * windowMs;
}

export type AiAllowance =
  | { allowed: true }
  | { allowed: false; scope: "account" | "site"; retryAfterSeconds: number; message: string };

const ACCOUNT_MESSAGES: Record<AiAction, (limit: number) => string> = {
  scan: (limit) => `You've used today's ${limit} scans. More open at midnight UTC.`,
  hanger: (limit) => `You've sent Hanger ${limit} messages today. More open at midnight UTC.`,
  "brand-describe": (limit) => `You've used today's ${limit} photo fills. More open at midnight UTC — you can still fill in the details yourself.`,
  "brand-hanger": (limit) => `You've asked Brand Hanger ${limit} questions today. More open at midnight UTC.`,
};

export const SITE_PAUSE_MESSAGE = "Racked's AI is paused for the rest of today to protect the service. It resumes at midnight UTC.";
/** The same pause, as the reason on Hanger's "written without the stylist model" note. */
export const SITE_PAUSE_REASON = "the AI is paused for the rest of today to protect the service, and resumes at midnight UTC";

/** Combines the account's allowance and the site's ceiling into one answer. */
export function aiAllowance(action: AiAction, accountCount: number, siteCount: number, now = Date.now(), ceiling = aiDailyCeiling()): AiAllowance {
  const resetAt = windowStart(now, DAY_MS) + DAY_MS;
  const account = durableDecision(accountCount, AI_DAILY_ALLOWANCE[action], resetAt, now);
  if (!account.allowed) return { allowed: false, scope: "account", retryAfterSeconds: account.retryAfterSeconds, message: ACCOUNT_MESSAGES[action](AI_DAILY_ALLOWANCE[action]) };
  const site = durableDecision(siteCount, ceiling, resetAt, now);
  if (!site.allowed) return { allowed: false, scope: "site", retryAfterSeconds: site.retryAfterSeconds, message: SITE_PAUSE_MESSAGE };
  return { allowed: true };
}

export function signInPausedMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts for this email address. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`;
}
