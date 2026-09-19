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
  /**
   * Whether the stored display image actually has a transparent background. Absent on
   * garments saved before this was recorded, and treated as a cut-out in that case so
   * their appearance does not change.
   */
  backgroundRemoved?: boolean;
  /**
   * The person's own words for what this garment is, kept only when no controlled subtype
   * fits them. `subtype` still holds the category's "other" entry, so outfit ranking and
   * Community filters keep working.
   */
  customType?: string | null;
  brand?: string | null;
  sku?: string | null;
  /** Present only when registry evidence verified this exact enrolled product. */
  registryProductId?: string | null;
  /**
   * "owner-selected" means the person chose this product from the brand catalog — by recognition
   * or search — without label evidence. It shows the product's details to them and nothing more:
   * it is never verified identity and never counts toward a brand's wear aggregates.
   */
  identityStatus?: "verified" | "owner-selected" | "suggested" | "user-labeled" | "unverified";
  /** The catalog product the person chose, when identityStatus is "owner-selected". */
  selectedProductId?: string | null;
  /** The brand's listed price when the piece was linked — not what the person paid. */
  listedPrice?: number | null;
  listedCurrency?: string | null;
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

/** A person's corrections to one detected piece before it is saved. */
export interface GarmentOverrides {name:string;brand:string;sku:string;category:GarmentCategory;subtype:string;customType?:string|null;/** Label evidence the server re-checks against the registry before it saves a verified link. */labelText?:string|null;/** A catalog product the person chose; saved as their selection, never as verified. */catalogProductId?:string|null}
