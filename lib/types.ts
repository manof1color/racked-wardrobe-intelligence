import type { GarmentCategory, GarmentSubtype } from "./garment-taxonomy.ts";

export type Role = "consumer" | "brand";
export type Season = "all-season" | "spring" | "summer" | "fall" | "winter";

export interface WardrobeItem {
  id: string; name: string; category: GarmentCategory | string; subtype?: GarmentSubtype; color: string; pattern?: string; material?: string; style: string[];
  /** A matching left/right footwear set is stored and worn as one wardrobe unit. */
  wearableUnit?: "single" | "pair";
  season: Season; wearCount: number; lastWornDays: number;
  source: "manual" | "ai-confirmed"; art: string;
  imageUrl?: string;
  imageKey?: string;
  evidenceImageKey?: string | null;
  brand?: string | null;
  sku?: string | null;
  /** Present only when registry evidence verified this exact enrolled product. */
  registryProductId?: string | null;
  identityStatus?: "verified" | "suggested" | "user-labeled" | "unverified";
  createdAt?: string;
}

export interface SavedOutfit {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: string;
  wears: number;
  /** V2 snapshot; itemIds remains for backward-compatible wear recording. */
  pieces?: OutfitPieceReference[];
  /** Private, generated flat-lay presentation; evidence photos remain separate. */
  boardImageKey?: string;
  boardImageUrl?: string;
}

export type ProductResolutionState = "EXACT_VERIFIED_PRODUCT" | "AI_ESTIMATED_PRODUCT" | "SIMILAR_PRODUCT" | "GENERIC_UNVERIFIED" | "VERIFIED_UNAVAILABLE";

export interface OutfitPieceReference {
  wardrobeItemId: string;
  resolution: {
    state: ProductResolutionState;
    registryProductId?: string;
    productName?: string;
    brand?: string;
    brandSlug?: string;
    sku?: string;
    reason: string;
  };
}

export interface Product {
  id: string; sku: string; name: string; brand: string; category: string;
  color: string; style: string[]; season: Season; price: number;
  pairsWith: string[]; art: string;
}

export interface ScoreComponent { key: string; label: string; score: number; weight: number; }
export interface MatchResult {
  productId: string; score: number; confidence: "high" | "medium" | "low";
  components: ScoreComponent[]; reasons: string[]; fallback: boolean;
}
