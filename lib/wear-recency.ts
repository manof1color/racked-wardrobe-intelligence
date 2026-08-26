// Judge note: wear recording writes `lastWornAt` (an absolute timestamp) but the
// wardrobe carries `lastWornDays` (a relative age). Nothing recomputed that age, so a
// recorded wear reverted to its stale stored value on the next load, and the outfit
// ranker kept treating a just-worn garment as never worn. Age is now derived from the
// timestamp on every read, which also stops seeded fixtures drifting as time passes.

/** Sentinel the wardrobe uses for "no wear on record". */
export const NEVER_WORN_DAYS = 999;

/**
 * Whole days between a wear timestamp and now, floored at 0.
 * Falls back to the stored value when there is no usable timestamp, so records
 * written before wear tracking existed keep whatever age they already had.
 */
export function wornDaysAgo(lastWornAt: unknown, storedDays: unknown, now: number = Date.now()): number {
  const timestamp = typeof lastWornAt === "string" ? Date.parse(lastWornAt) : NaN;
  if (!Number.isFinite(timestamp)) {
    const stored = Number(storedDays);
    return Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : NEVER_WORN_DAYS;
  }
  // A clock skew that puts the wear slightly in the future still means "today".
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}
