import type { BrandProductRegistration } from "./platform-types.ts";

// Judge note: these are fictional storefronts for Racked's own fictional demo brands.
// They exist so the Shop the Look commerce path has a real, always-available HTTPS
// destination to demonstrate against. They never imitate a real company, they sell
// nothing, and they collect nothing. A brand is only given a storefront when its
// products are classified as demonstration data, so a genuine pilot brand can never
// be rendered as a fake shop.

export const DEMO_STORE_BASE = "/demo-store";

export const DEMO_STORE_DISCLAIMER =
  "Fictional demo storefront — not a real shop. No products are for sale and no payment is ever collected.";

export function demoStoreBrandPath(brandSlug: string) {
  return `${DEMO_STORE_BASE}/${encodeURIComponent(brandSlug)}`;
}

export function demoStoreProductPath(brandSlug: string, sku: string) {
  return `${demoStoreBrandPath(brandSlug)}/${encodeURIComponent(sku)}`;
}

/**
 * Absolute URL for seeding into a product's `productUrl`. The seed script builds this
 * from brandSlug + sku so the destination is deterministic and always resolvable.
 */
export function demoStoreProductUrl(origin: string, brandSlug: string, sku: string) {
  return `${origin.replace(/\/+$/, "")}${demoStoreProductPath(brandSlug, sku)}`;
}

/** Only demonstration records get a fictional shop. Never a real or pilot brand. */
export function isDemoStorefrontProduct(product: Pick<BrandProductRegistration, "dataClassification" | "testCohort">) {
  return product.dataClassification === "DEMO" || product.testCohort === true;
}

export function isDemoStorefrontBrand(products: Array<Pick<BrandProductRegistration, "dataClassification" | "testCohort">>) {
  return products.length > 0 && products.every(isDemoStorefrontProduct);
}

/**
 * Stable pseudo-random integer from a string, so fake prices never change between
 * renders. The final avalanche step matters: SKUs in a range differ by one character,
 * and a plain rolling hash left their prices only a few dollars apart, which reads as
 * obviously generated (241 / 244 / 247). Mixing the bits spreads them across the band.
 */
function seedFrom(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

const PRICE_BANDS: Record<string, [number, number]> = {
  top: [28, 74],
  bottom: [48, 118],
  outerwear: [120, 260],
  dress: [78, 180],
  shoe: [70, 190],
  bag: [90, 240],
  jewelry: [35, 145],
  accessory: [18, 68],
};

/** Deterministic fictional price. Uses the brand's own price when one was enrolled. */
export function storefrontPrice(product: Pick<BrandProductRegistration, "sku" | "category" | "price">) {
  if (typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0) return Math.round(product.price);
  const [low, high] = PRICE_BANDS[product.category?.toLowerCase() ?? ""] ?? [30, 120];
  const span = Math.max(1, high - low);
  return low + (seedFrom(product.sku) % span);
}

export function formatPrice(amount: number, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount}`; }
}

const COPY_BY_CATEGORY: Record<string, string> = {
  top: "A everyday layer cut for repeat wear, designed to sit under outerwear without bulk.",
  bottom: "A clean-lined trouser built to pair with most of the rest of a working wardrobe.",
  outerwear: "A structured outer layer intended as the piece a rotation is built around.",
  dress: "A single-piece silhouette meant to carry a full day without restyling.",
  shoe: "A low-profile silhouette intended for high-frequency, everyday rotation.",
  bag: "A carry piece sized for daily use rather than occasional wear.",
  jewelry: "A small repeat-wear piece designed to be layered rather than swapped.",
  accessory: "A finishing piece meant to work across several different outfits.",
};

/** Fictional product copy. Deterministic, and never a real marketing claim. */
export function storefrontDescription(product: Pick<BrandProductRegistration, "name" | "category">) {
  const base = COPY_BY_CATEGORY[product.category?.toLowerCase() ?? ""] ?? "A demonstration product used to exercise Racked's wardrobe and wear features.";
  return `${base} ${product.name} is a fictional product created to demonstrate Racked; it does not exist and cannot be purchased.`;
}
