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
 * "Denial of wallet": scans and Hanger messages call a paid model, so a flood of them spends real
 * money even when nothing breaks. Two budgets, in two different units:
 *
 * - **Per account, per day, in requests** — 40 scans, 120 Hanger messages, and so on. A person can
 *   understand "messages"; these sit far above a day's real use.
 * - **Site-wide, per day, in model calls** (lib/ai-budget.ts) — the unit Bedrock bills. One Hanger
 *   message can make up to five agent calls and a plain fallback reply, so counting requests would
 *   understate spending several times over.
 *
 * Both fail closed: if the counter cannot be read, no model is called and the non-model fallback
 * answers.
 */
export type AiAction = "scan" | "hanger" | "brand-describe" | "brand-hanger";

export const AI_DAILY_ALLOWANCE: Record<AiAction, number> = {
  scan: 40,
  hanger: 120,
  "brand-describe": 40,
  "brand-hanger": 60,
};

/**
 * Model calls per day across every account; `AI_DAILY_CEILING` overrides it. At Nova Pro prices a
 * call costs roughly half a cent to a cent and a half, so 1,500 bounds a worst day at about $8–20.
 */
export const DEFAULT_AI_DAILY_CEILING = 1_500;

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
  | { allowed: false; scope: "account" | "unavailable"; retryAfterSeconds: number; message: string };

const ACCOUNT_MESSAGES: Record<AiAction, (limit: number) => string> = {
  scan: (limit) => `You've used today's ${limit} scans. More open at midnight UTC.`,
  hanger: (limit) => `You've sent Hanger ${limit} messages today. More open at midnight UTC.`,
  "brand-describe": (limit) => `You've used today's ${limit} photo fills. More open at midnight UTC — you can still fill in the details yourself.`,
  "brand-hanger": (limit) => `You've asked Brand Hanger ${limit} questions today. More open at midnight UTC.`,
};

/** When the budget counter itself cannot be read: fail closed, without blaming the person. */
export const AI_UNAVAILABLE_MESSAGE = "Racked's AI is briefly unavailable. Try again in a few minutes.";
/**
 * The reason on Hanger's "written without the stylist model" note when a budget stopped the model:
 * the site's ceiling, or a counter that could not be read. True in both cases.
 */
export const AI_PAUSED_REASON = "the AI is paused to protect the service";

export function aiUnavailable(): AiAllowance {
  return { allowed: false, scope: "unavailable", retryAfterSeconds: 60, message: AI_UNAVAILABLE_MESSAGE };
}

/** The account's daily allowance, in requests. The site's ceiling is enforced per model call. */
export function aiAllowance(action: AiAction, accountCount: number, now = Date.now()): AiAllowance {
  const resetAt = windowStart(now, DAY_MS) + DAY_MS;
  const account = durableDecision(accountCount, AI_DAILY_ALLOWANCE[action], resetAt, now);
  if (!account.allowed) return { allowed: false, scope: "account", retryAfterSeconds: account.retryAfterSeconds, message: ACCOUNT_MESSAGES[action](AI_DAILY_ALLOWANCE[action]) };
  return { allowed: true };
}

/** Whether one more model call fits under the site's daily ceiling. */
export function siteModelCallAllowed(callCount: number, ceiling = aiDailyCeiling()) {
  return callCount <= ceiling;
}

export function signInPausedMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts for this email address. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`;
}
