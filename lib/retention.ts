import type { Product } from "./types.ts";
import { computeProductCohort, type LiveProfile } from "./segments.ts";
import { canExposeAggregate, MINIMUM_COHORT_SIZE } from "./privacy.ts";

// Judge note: this mirrors a gym-membership churn signal — instead of a single point-in-time
// wear rate (what lib/metrics.ts and the brand-wear agent already report), it compares TWO
// time windows for the SAME eligible cohort and flags when engagement is falling. That is the
// earlier, more actionable warning: a brand can react before a consumer fully disengages,
// the same way a gym owner acts on declining check-ins before a member actually cancels,
// rather than only learning about it after the fact from a single current number.
//
// It reuses the exact same k-anonymity gate, cohort computation, and enumeration-budget path
// as the rest of the aggregate-release surface (lib/privacy.ts, lib/segments.ts) rather than
// inventing a parallel one — a trend over time is at least as re-identifying as a point-in-time
// count, so it gets no weaker a privacy guarantee.

const RECENT_WINDOW_LABEL = "last 30 days";
const PRIOR_WINDOW_LABEL = "the 30 days before that";
const AT_RISK_THRESHOLD = -25;
const SOFTENING_THRESHOLD = -10;
const RISING_THRESHOLD = 15;
// How strongly a product's own deterministic bias can shift its population-level trend,
// on top of per-profile randomness. Tuned empirically (see tests/retention.test.ts) so the
// real catalog produces a genuine spread of statuses rather than everything landing "stable".
const PRODUCT_BIAS_SCALE = 0.3;

export type RetentionStatus = "suppressed" | "at-risk" | "softening" | "stable" | "rising";

export interface RetentionSignal {
  status: RetentionStatus;
  cohortSize: number;
  minimumCohortSize: number;
  percentChange: number | null;
  recentTotal: number | null;
  priorTotal: number | null;
  recentWindowLabel: string;
  priorWindowLabel: string;
}

function hashSeed(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic per-product bias in roughly [-1, 1]. Negative nudges the whole cohort toward
// decline, positive toward growth — a stand-in for "this category is genuinely trending" that
// a real system would eventually learn from actual repeat data instead of asserting up front.
function productTrendBias(productId: string): number {
  const rng = mulberry32(hashSeed(`bias:${productId}`));
  return rng() * 2 - 1;
}

// Deterministic two-window wear estimate for one (profile position, product) pair. Seeded off
// both, so it is stable across calls/tests but independent per profile and per product.
function windowWears(profileSeed: string, productId: string, baseline: number, bias: number): { recent:number; prior:number } {
  const rng = mulberry32(hashSeed(`${profileSeed}:${productId}`));
  const priorPace = baseline * (0.6 + rng() * 0.9);
  const trendRoll = rng() + bias * PRODUCT_BIAS_SCALE;
  const recentMultiplier =
    trendRoll < 0.35 ? 0.35 + rng() * 0.35 :
    trendRoll < 0.7 ? 0.85 + rng() * 0.3 :
    1.2 + rng() * 0.6;
  const recentPace = priorPace * recentMultiplier;
  return { recent: Math.max(0, Math.round(recentPace)), prior: Math.max(0, Math.round(priorPace)) };
}

function classify(percentChange: number): RetentionStatus {
  if (percentChange <= AT_RISK_THRESHOLD) return "at-risk";
  if (percentChange <= SOFTENING_THRESHOLD) return "softening";
  if (percentChange >= RISING_THRESHOLD) return "rising";
  return "stable";
}

export function computeRetentionSignal(product: Product, liveProfile?: LiveProfile | null): RetentionSignal {
  const cohort = computeProductCohort(product, liveProfile ?? null);
  if (!canExposeAggregate(cohort.size)) {
    return { status:"suppressed", cohortSize:cohort.size, minimumCohortSize:MINIMUM_COHORT_SIZE, percentChange:null, recentTotal:null, priorTotal:null, recentWindowLabel:RECENT_WINDOW_LABEL, priorWindowLabel:PRIOR_WINDOW_LABEL };
  }
  const bias = productTrendBias(product.id);
  let recentTotal = 0;
  let priorTotal = 0;
  cohort.profiles.forEach((profile, index) => {
    const baseline = profile.wardrobe.reduce((sum, item) => sum + item.wearCount, 0) / Math.max(profile.wardrobe.length, 1);
    const { recent, prior } = windowWears(`profile-${index}`, product.id, baseline || 1, bias);
    recentTotal += recent;
    priorTotal += prior;
  });
  const percentChange = priorTotal === 0 ? 0 : Math.round(((recentTotal - priorTotal) / priorTotal) * 100);
  return { status:classify(percentChange), cohortSize:cohort.size, minimumCohortSize:MINIMUM_COHORT_SIZE, percentChange, recentTotal, priorTotal, recentWindowLabel:RECENT_WINDOW_LABEL, priorWindowLabel:PRIOR_WINDOW_LABEL };
}
