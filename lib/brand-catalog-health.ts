import type { BrandProductRegistration } from "./platform-types.ts";

/**
 * What is unfinished in a brand's own catalog.
 *
 * Deliberately built from the brand's own product records and nothing else. A brand's first screen
 * must never summarise private wear across products: whether a product has crossed the 25-owner
 * release threshold is derived from cohort size, so showing that for a whole catalog at once would
 * be exactly the cross-product differencing the enumeration budget prevents. Everything here is a
 * fact about the brand's own listing — a missing price, a missing destination, a missing photo.
 */
export interface CatalogAttentionItem {
  productId: string;
  name: string;
  detail: string;
}

export const MAX_ATTENTION_ITEMS = 5;

export function catalogAttention(products: BrandProductRegistration[]): CatalogAttentionItem[] {
  return products
    .filter((product) => !product.archived)
    .flatMap((product) => {
      const missing = [
        ...(product.price === undefined ? ["a price"] : []),
        ...(product.productUrl ? [] : ["a product link"]),
        ...(product.views?.front?.storageKey || product.imageUrls?.front ? [] : ["a product photo"]),
        ...(product.color || product.subtype ? [] : ["what it looks like, so a customer's scan can recognise it"]),
      ];
      if (!missing.length) return [];
      const detail = missing.length === 1
        ? `Missing ${missing[0]}.`
        : `Missing ${missing.slice(0, -1).join(", ")} and ${missing.at(-1)}.`;
      return [{ productId: product.id, name: product.name, detail }];
    })
    .slice(0, MAX_ATTENTION_ITEMS);
}
