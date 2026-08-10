export type Role = "consumer" | "brand";
export type Season = "all-season" | "spring" | "summer" | "fall" | "winter";

export interface WardrobeItem {
  id: string; name: string; category: string; color: string; style: string[];
  season: Season; wearCount: number; lastWornDays: number;
  source: "manual" | "ai-confirmed"; art: string;
  imageUrl?: string;
  imageKey?: string;
  evidenceImageKey?: string | null;
  brand?: string | null;
  sku?: string | null;
  identityStatus?: "verified" | "suggested" | "user-labeled" | "unverified";
  createdAt?: string;
}

export interface SavedOutfit {
  id: string;
  name: string;
  itemIds: string[];
  createdAt: string;
  wears: number;
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
