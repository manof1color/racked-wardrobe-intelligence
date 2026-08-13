import type { OutfitPieceReference, WardrobeItem } from "./types.ts";

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// Exactness is granted only by the registry link persisted at garment enrollment.
// Suggested/user labels intentionally remain generic rather than being promoted to
// an AI-estimated product. Future recommendation logic may explicitly create the
// estimated/similar states, but this conversion never guesses one.
export function wardrobeItemToOutfitPiece(item: WardrobeItem): OutfitPieceReference {
  if (item.identityStatus === "verified" && item.registryProductId && item.brand && item.sku) {
    return {
      wardrobeItemId: item.id,
      resolution: {
        state: "EXACT_VERIFIED_PRODUCT",
        registryProductId: item.registryProductId,
        productName: item.name,
        brand: item.brand,
        brandSlug: slugify(item.brand),
        sku: item.sku,
        reason: "The wardrobe item carries an authorized registry product ID from GTIN or brand-plus-SKU evidence.",
      },
    };
  }
  return {
    wardrobeItemId: item.id,
    resolution: {
      state: "GENERIC_UNVERIFIED",
      ...(item.brand ? { brand: item.brand, brandSlug: slugify(item.brand) } : {}),
      ...(item.sku ? { sku: item.sku } : {}),
      reason: "No authorized exact-product registry link is attached to this wardrobe item.",
    },
  };
}

export function buildOutfitPieceReferences(itemIds: string[], wardrobe: WardrobeItem[]) {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  return [...new Set(itemIds)].map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error("Every outfit piece must belong to the selected wardrobe.");
    return wardrobeItemToOutfitPiece(item);
  });
}
