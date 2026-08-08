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
