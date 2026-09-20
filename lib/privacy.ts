export const MINIMUM_COHORT_SIZE = 25;
// Judge note: brand-facing aggregate output fails closed below the documented cohort threshold.

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

export const ENUMERATION_WINDOW_MS = 5 * 60 * 1000;
export const MAX_DISTINCT_PRODUCTS_PER_WINDOW = 6;

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
