import type { Product } from "./types.ts";
import { scoreProduct } from "./matching.ts";
import { canExposeAggregate, MINIMUM_COHORT_SIZE } from "./privacy.ts";
import { computeProductCohort, type LiveProfile } from "./segments.ts";

export interface BrandMetrics {
  opportunity: number | null;
  gapPrevalence: number | null;
  duplicateRisk: number | null;
  segmentSize: number;
  suppressed: boolean;
  minimumCohortSize: number;
}

export function calculateBrandMetrics(product: Product, liveProfile?: LiveProfile | null): BrandMetrics {
  const cohort = computeProductCohort(product, liveProfile ?? null);
  // Judge note: this is the same k-anonymity gate as the brand agent (lib/privacy.ts,
  // lib/agents.ts), applied here to the dashboard's own metric computation. A suppressed
  // result is returned before any per-profile score is aggregated — the null fields are not
  // filtered out of a computed object afterward, they are never computed at all.
  if (!canExposeAggregate(cohort.size)) {
    return { opportunity:null, gapPrevalence:null, duplicateRisk:null, segmentSize:cohort.size, suppressed:true, minimumCohortSize:MINIMUM_COHORT_SIZE };
  }
  const results = cohort.profiles.map((profile) => scoreProduct(product, profile.wardrobe));
  const opportunity = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  const gapPrevalence = Math.round((results.filter((result) => (result.components.find((c) => c.key === "gap")?.score ?? 0) >= 70).length / Math.max(results.length, 1)) * 100);
  const duplicateRisk = Math.round((results.filter((result) => (result.components.find((c) => c.key === "duplicate")?.score ?? 100) < 50).length / Math.max(results.length, 1)) * 100);
  return { opportunity, gapPrevalence, duplicateRisk, segmentSize:cohort.size, suppressed:false, minimumCohortSize:MINIMUM_COHORT_SIZE };
}
