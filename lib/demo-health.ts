/**
 * What `/api/health` says about the AI's daily budget: a band, never the counts, so the endpoint
 * tells the owner whether a demo can run without telling anyone else how busy Racked is.
 */
export type ModelBudgetBand = "plenty" | "low" | "exhausted" | "unknown";

/** "low" leaves at least a couple of demos' worth: the larger of 25 calls or a tenth of the ceiling. */
export function modelBudgetBand(used: number | null, ceiling: number): ModelBudgetBand {
  if (used === null || !Number.isFinite(used) || !Number.isFinite(ceiling) || ceiling <= 0) return "unknown";
  const remaining = ceiling - used;
  if (remaining <= 0) return "exhausted";
  if (remaining < Math.max(25, ceiling / 10)) return "low";
  return "plenty";
}
