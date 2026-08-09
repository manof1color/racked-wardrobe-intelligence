import type { OutfitPost } from "./platform-types.ts";

// Judge note: community posts are stored alongside private fields (owner account ID,
// private S3 image key, and DynamoDB key attributes). The public API must never ship
// those, so this sanitizer rebuilds each post from an explicit allowlist of public
// fields instead of spreading the stored record into the response.
export function toPublicOutfitPost(stored: Partial<OutfitPost>): OutfitPost {
  return {
    id: String(stored.id ?? ""),
    handle: String(stored.handle ?? ""),
    outfitTitle: String(stored.outfitTitle ?? ""),
    caption: String(stored.caption ?? ""),
    image: String(stored.image ?? ""),
    createdAt: String(stored.createdAt ?? ""),
    likes: Number(stored.likes ?? 0) || 0,
    ...(stored.fictional === true ? { fictional: true } : {}),
    products: (Array.isArray(stored.products) ? stored.products : []).map((product) => ({
      sku: String(product?.sku ?? ""),
      name: String(product?.name ?? ""),
      brand: String(product?.brand ?? ""),
      brandSlug: String(product?.brandSlug ?? ""),
      category: String(product?.category ?? ""),
    })),
  };
}
