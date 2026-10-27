import { aiAllowance, aiDailyCeiling, aiUnavailable, DAY_MS, siteModelCallAllowed, type AiAction, type AiAllowance } from "./abuse-limits.ts";

/**
 * Charging and metering for paid model calls.
 *
 * Two budgets, in two units (lib/abuse-limits.ts): each account's daily allowance counts
 * **requests** — "40 scans" is something a person can understand — and the site-wide ceiling counts
 * **model calls**, the unit Bedrock bills. One Hanger message can run up to five agent rounds and a
 * plain fallback reply, so a request count would understate spending several times over. Every
 * place that calls a model is wrapped with `metered` or `meteredOrNull`, and each call spends one
 * unit from the day's ceiling first.
 *
 * Both budgets fail closed. If the shared counter cannot be read, no model is called: the person is
 * told the AI is briefly unavailable, or gets the non-model fallback — Hanger's reply from their
 * own wardrobe, or an editable item to fill in by hand. A storage fault never means unmetered
 * spending.
 *
 * The counter is passed in, so all of this is tested without a database; lib/server/abuse-guard.ts
 * binds it to DynamoDB, where `ADD` makes every increment atomic across server instances.
 */
export type CounterIncrement = (name: string, windowMs: number, now: number) => Promise<{ count: number; resetAt: number }>;

function budgetUnavailable(check: string, error: unknown) {
  console.error("AI budget unavailable; failing closed", { check, name: error instanceof Error ? error.name : "UnknownError" });
}

/** Spends one request from the account's daily allowance for this action. */
export async function chargeAccountAllowance(increment: CounterIncrement, action: AiAction, accountId: string, now = Date.now()): Promise<AiAllowance> {
  try {
    const { count } = await increment(`ai:${action}:${accountId}`, DAY_MS, now);
    return aiAllowance(action, count, now);
  } catch (error) {
    budgetUnavailable(`account allowance (${action})`, error);
    return aiUnavailable();
  }
}

/** Spends one model call from the site's daily ceiling. False means: do not call the model. */
export async function chargeSiteModelCall(increment: CounterIncrement, now = Date.now(), ceiling = aiDailyCeiling()): Promise<boolean> {
  try {
    const { count } = await increment("ai:site-calls", DAY_MS, now);
    return siteModelCallAllowed(count, ceiling);
  } catch (error) {
    budgetUnavailable("site model calls", error);
    return false;
  }
}

export class AiBudgetExhausted extends Error {
  constructor() {
    super("The site's AI budget refused this model call.");
    this.name = "AiBudgetExhausted";
  }
}

export type SpendModelCall = () => Promise<boolean>;

/** For callers that recover from errors (the agent loop, scan detection): a refused call throws. */
export function metered<A extends unknown[], R>(spend: SpendModelCall, call: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    if (!(await spend())) throw new AiBudgetExhausted();
    return call(...args);
  };
}

/** For runners whose contract is "null means no model reply": a refused call returns null. */
export function meteredOrNull<A extends unknown[], R>(spend: SpendModelCall, call: (...args: A) => Promise<R | null>) {
  return async (...args: A): Promise<R | null> => ((await spend()) ? call(...args) : null);
}
