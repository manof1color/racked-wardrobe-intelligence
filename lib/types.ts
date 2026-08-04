export type Role = "consumer" | "brand";
export type Season = "all-season" | "spring" | "summer" | "fall" | "winter";

export interface WardrobeItem {
  id: string; name: string; category: string; color: string; style: string[];
  season: Season; wearCount: number; lastWornDays: number;
  source: "manual" | "ai-confirmed"; art: string;
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
