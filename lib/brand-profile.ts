import type { OutfitPost } from "./platform-types.ts";

// Judge note: a brand's public page separates what the brand said about itself from
// what people did with its products. Both sections are built from already-public
// Community posts — no new data path, and nothing here can reach a private wardrobe.

export interface BrandProfileLooks {
  /** Outfits the brand composed and published from its own enrolled products. */
  brandLooks: OutfitPost[];
  /** Public consumer outfits that contain at least one verified product from this brand. */
  communityLooks: OutfitPost[];
}

export function featuresBrand(post: OutfitPost, brandSlug: string) {
  return post.garments.some((garment) => garment.verifiedProduct?.brandSlug === brandSlug);
}

export function splitBrandProfileLooks(posts: OutfitPost[], brandSlug: string): BrandProfileLooks {
  const featured = posts.filter((post) => featuresBrand(post, brandSlug));
  return {
    brandLooks: featured.filter((post) => post.sourceType === "brand"),
    communityLooks: featured.filter((post) => post.sourceType === "consumer"),
  };
}

/**
 * Real-world social proof, counted only from intentionally public posts.
 * Deliberately excludes anything sourced from private wear records.
 */
export function brandProfileSummary(looks: BrandProfileLooks) {
  const all = [...looks.brandLooks, ...looks.communityLooks];
  return {
    brandLookCount: looks.brandLooks.length,
    communityLookCount: looks.communityLooks.length,
    inspirationCount: all.reduce((sum, post) => sum + post.likes, 0),
  };
}
