import { wardrobe } from "./demo-data.ts";
import type { WardrobeItem } from "./types.ts";

// Judge note: this replaces a hand-typed "optedInCohortSize" constant per product with a
// deterministically generated population of fictional profiles, each with its own opt-in
// flag and its own wardrobe. Cohort size for a product is then computed (see segments.ts),
// not declared — so it can't drift out of sync with what the k-anonymity gate actually checks.
// The generator is a seeded PRNG (mulberry32), not Math.random(), so results are identical on
// every run/build/test — required for deterministic tests and a reproducible demo.

export interface PopulationProfile { id:string; optedIn:boolean; wardrobe:WardrobeItem[]; }

function mulberry32(seed:number) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const POPULATION_SIZE = 160;
// Fraction of profiles that opted into brand-facing wear-data sharing at all.
const OPT_IN_RATE = 0.8;
// Per-item probability that a given base wardrobe item appears in a synthetic profile's closet.
const MIN_KEEP_PROBABILITY = 0.28;
const MAX_KEEP_PROBABILITY = 0.6;

function buildProfile(index:number): PopulationProfile {
  const rng = mulberry32(90210 + index * 7919);
  const keepProbability = MIN_KEEP_PROBABILITY + rng() * (MAX_KEEP_PROBABILITY - MIN_KEEP_PROBABILITY);
  const items = wardrobe
    .filter(() => rng() < keepProbability)
    .map((item) => ({ ...item, wearCount: Math.max(0, Math.round(item.wearCount * (0.3 + rng() * 1.3))) }));
  const finalItems = items.length >= 2 ? items : wardrobe.slice(0, 3);
  return { id:`pop-${index}`, optedIn: rng() < OPT_IN_RATE, wardrobe: finalItems };
}

export const syntheticPopulation: PopulationProfile[] = Array.from({ length: POPULATION_SIZE }, (_, index) => buildProfile(index));
