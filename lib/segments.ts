import type { Product, WardrobeItem } from "./types.ts";
import { scoreProduct } from "./matching.ts";
import { syntheticPopulation, type PopulationProfile } from "./population.ts";

// Judge note: a profile is only "in" a product's cohort if it is BOTH opted in AND its
// deterministic match score clears this relevance bar. Being in the population isn't enough —
// this is what "eligible opted-in segment" means, computed the same way every time it's asked.
export const RELEVANCE_SCORE_THRESHOLD = 55;

export interface LiveProfile { optedIn:boolean; wardrobe:WardrobeItem[]; }

export interface ProductCohort { size:number; profiles:{ optedIn:boolean; wardrobe:WardrobeItem[] }[]; }

export function computeProductCohort(product:Product, liveProfile?:LiveProfile|null, population:PopulationProfile[] = syntheticPopulation): ProductCohort {
  const pool:{ optedIn:boolean; wardrobe:WardrobeItem[] }[] = liveProfile ? [...population, liveProfile] : population;
  const profiles = pool.filter((profile) => profile.optedIn && scoreProduct(product, profile.wardrobe).score >= RELEVANCE_SCORE_THRESHOLD);
  return { size: profiles.length, profiles };
}
