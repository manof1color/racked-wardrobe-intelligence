import type { OutfitPost, PublicOutfitGarment } from "./platform-types.ts";
import { shoppableLanguage, type ShoppableLanguage } from "./look-language.ts";

/**
 * What a piece in a Community post shows. The catalog is the only source of a price: a price appears
 * only for a piece Racked has verified as an exact registry product that is not unavailable. A piece
 * from someone's own closet, or one only recognised or resembling a product, shows none, and a visual
 * resemblance never turns into a link (lib/look-language.ts, lib/product-registry.ts).
 */
export interface PieceCard {
  id: string;
  name: string;
  thumb: string;
  /** "catalog": an exact verified product from a participating brand. "closet": anything else. */
  kind: "catalog" | "closet";
  brand: string | null;
  brandSlug: string | null;
  registryProductId: string | null;
  /** Formatted price, or null when the catalog gives none. Never inferred. */
  price: string | null;
  language: ShoppableLanguage;
  /** The server-validated outbound route, only for an exact product with an available destination. */
  outboundUrl: string | null;
}

export function formatPrice(price: unknown, currency?: string): string | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: /^[A-Z]{3}$/.test(currency ?? "") ? currency : "USD" }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

export function pieceCard(garment: PublicOutfitGarment): PieceCard {
  const language = shoppableLanguage(garment);
  const verified = garment.resolutionState === "EXACT_VERIFIED_PRODUCT" ? garment.verifiedProduct : undefined;
  const unavailable = verified?.commerceState === "EXACT_UNAVAILABLE";
  return {
    id: garment.publicGarmentId,
    name: verified?.name ?? garment.name,
    thumb: garment.image,
    kind: verified ? "catalog" : "closet",
    brand: verified?.brand ?? null,
    brandSlug: verified?.brandSlug ?? null,
    registryProductId: verified?.registryProductId ?? null,
    price: verified && !unavailable ? formatPrice(verified.price, verified.currency) : null,
    language,
    outboundUrl: language.canShopExact ? verified?.outboundUrl ?? null : null,
  };
}

/** Other looks that contain the same exact product, matched only by its registry id. */
export function looksWithProduct(posts: readonly OutfitPost[], registryProductId: string | null, exceptPostId?: string): OutfitPost[] {
  if (!registryProductId) return [];
  return posts.filter((post) => post.id !== exceptPostId && post.garments.some((garment) => garment.resolutionState === "EXACT_VERIFIED_PRODUCT" && garment.verifiedProduct?.registryProductId === registryProductId));
}

/** The photo a post leads with: the person wearing the outfit, or null to fall back to its pieces. */
export const postPhoto = (post: Pick<OutfitPost, "photo">) => (post.photo ? post.photo : null);

/** The name shown for an author: the brand's own name for a brand post, else the member's handle. */
export function authorName(post: Pick<OutfitPost, "sourceType" | "handle" | "products">) {
  return post.sourceType === "brand" && post.products[0]?.brand ? post.products[0].brand : post.handle;
}

export function authorInitials(name: string) {
  const letters = name.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase();
  return (letters || "R").slice(0, 2);
}

/** "2h ago" style age, for the post header. */
export function timeAgo(iso: string, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
