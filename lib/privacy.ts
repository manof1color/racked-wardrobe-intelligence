export const MINIMUM_COHORT_SIZE = 25;
// Judge note: brand-facing aggregate output fails closed below the documented cohort threshold.

/**
 * Only established owners count toward the 25, and only they appear in any released figure.
 * Without this, a brand could make 24 throwaway accounts, link its own product, and watch which
 * single real owner tips the product over the threshold. An owner is established when their
 * account is at least ESTABLISHED_OWNER_MIN_AGE_DAYS old and they have confirmed wears of this
 * product on at least ESTABLISHED_OWNER_MIN_WEAR_DAYS different days. Days are UTC days of the
 * server's own wear time, never the browser's date, so three days need at least two real
 * midnights to pass. A patient attacker can still age accounts; this raises the cost, it does not
 * end the attack.
 */
export const ESTABLISHED_OWNER_MIN_AGE_DAYS = 14;
export const ESTABLISHED_OWNER_MIN_WEAR_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The owners who count, from records the aggregate already loads: each opted-in owner's profile
 * (`createdAt`) and the product's confirmed wear events. An owner with no readable `createdAt`
 * does not count — the check fails closed.
 */
export function establishedOwners(
  profiles: Iterable<{ owner: string; createdAt: unknown }>,
  wears: Iterable<{ owner: string; occurredAt: unknown }>,
  now = Date.now(),
): Set<string> {
  const days = new Map<string, Set<string>>();
  for (const wear of wears) {
    const time = typeof wear.occurredAt === "string" ? Date.parse(wear.occurredAt) : NaN;
    if (!Number.isFinite(time) || time > now) continue;
    const seen = days.get(wear.owner) ?? new Set<string>();
    seen.add(new Date(time).toISOString().slice(0, 10));
    days.set(wear.owner, seen);
  }
  const established = new Set<string>();
  for (const { owner, createdAt } of profiles) {
    const created = typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
    if (!Number.isFinite(created) || now - created < ESTABLISHED_OWNER_MIN_AGE_DAYS * DAY_MS) continue;
    if ((days.get(owner)?.size ?? 0) >= ESTABLISHED_OWNER_MIN_WEAR_DAYS) established.add(owner);
  }
  return established;
}

export function canExposeAggregate(size: number, minimum = MINIMUM_COHORT_SIZE) {
  return Number.isInteger(size) && size >= minimum;
}

export function toBrandSafeSegment(input: { id:string; label:string; size:number; emails?:string[]; wardrobeIds?:string[] }) {
  if (!canExposeAggregate(input.size)) return null;
  return { id:input.id, label:input.label, size:input.size };
}

// Judge note: a single k-anonymity check per query doesn't stop a brand from querying many
// SKUs in sequence and reconstructing a picture of a near-threshold group from the pattern of
// releases/suppressions (a differencing/enumeration attack). This is a real, separate control:
// it caps how many DISTINCT products one subject can pull an aggregate for in a rolling window,
// independent of any single query's own cohort size. Re-querying the same product doesn't count
// against the budget — only breadth of enumeration does.
export interface AggregateQueryEvent { subject:string; productId:string; at:number; }

// A day, not five minutes: six distinct products every five minutes still allowed about seventy an
// hour, enough to line results up. Re-opening a product already opened stays free all day.
export const ENUMERATION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_DISTINCT_PRODUCTS_PER_WINDOW = 6;

/** "3 hours" or "40 minutes": how long until the oldest opened product leaves the window. */
export function budgetWait(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export interface EnumerationBudgetState {
  /** Distinct products this subject has already opened inside the window. */
  used: number;
  limit: number;
  remaining: number;
  /** Seconds until the oldest query in the window ages out and frees a slot. */
  resetsInSeconds: number;
}

/**
 * The same budget, said out loud. A brand that opens a seventh product used to meet a refusal with
 * no warning; showing what is left turns a control into something a person can plan around. It
 * describes only this brand's own query log and says nothing about any consumer.
 */
export function enumerationBudgetState(
  log: AggregateQueryEvent[],
  subject: string,
  now = Date.now(),
  options: { windowMs?: number; maxDistinctProducts?: number } = {},
): EnumerationBudgetState {
  const windowMs = options.windowMs ?? ENUMERATION_WINDOW_MS;
  const limit = options.maxDistinctProducts ?? MAX_DISTINCT_PRODUCTS_PER_WINDOW;
  const events = log.filter((event) => event.subject === subject && event.at >= now - windowMs);
  const used = new Set(events.map((event) => event.productId)).size;
  const oldest = events.length ? Math.min(...events.map((event) => event.at)) : null;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsInSeconds: oldest === null ? 0 : Math.max(0, Math.ceil((oldest + windowMs - now) / 1000)),
  };
}

export function exceedsEnumerationBudget(
  log: AggregateQueryEvent[],
  subject: string,
  productId: string,
  now = Date.now(),
  options: { windowMs?: number; maxDistinctProducts?: number } = {},
): boolean {
  const windowMs = options.windowMs ?? ENUMERATION_WINDOW_MS;
  const maxDistinctProducts = options.maxDistinctProducts ?? MAX_DISTINCT_PRODUCTS_PER_WINDOW;
  const cutoff = now - windowMs;
  const distinctProducts = new Set(
    log.filter((event) => event.subject === subject && event.at >= cutoff).map((event) => event.productId),
  );
  if (distinctProducts.has(productId)) return false;
  return distinctProducts.size + 1 > maxDistinctProducts;
}
