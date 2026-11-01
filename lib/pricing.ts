/**
 * The proposed price tiers: one source for the /pricing page and the README table. Nothing here is
 * billed. `includes` describes only what the product shows today; the Starter tier in particular
 * promises no private wear data below the k ≥ 25 threshold.
 */
export type PricingTier = { tier: string; price: string; includes: string };

export const PRICING_TIERS: readonly PricingTier[] = [
  { tier: "Consumer Free", price: "$0", includes: "Wardrobe logging, wear tracking, limited Hanger queries" },
  { tier: "Consumer Pro", price: "$6.99/mo or $59/yr", includes: "Unlimited Hanger, advanced analytics, outfit export" },
  { tier: "Brand SKU Enrollment", price: "$25 one-time + $10/yr/SKU", includes: "Verification, registry matching" },
  { tier: "Brand Starter (below k≥25)", price: "$29/mo", includes: "Product enrollment and verification, public Community activity for your products, Brand Looks, and threshold status (released or not yet). No private wear data until a product reaches k ≥ 25." },
  { tier: "Brand Standard (post-threshold)", price: "$149/mo", includes: "Full aggregate dashboard, CSV export" },
  { tier: "Brand Growth", price: "$299/mo", includes: "Standard + multi-product comparison + Hanger strategy artifacts" },
  { tier: "A la carte strategy artifact", price: "$15/artifact", includes: "For non-subscribers" },
];

export const PRICING_BLOCK_START = "<!-- pricing:start (generated from lib/pricing.ts; tests/pricing.test.ts) -->";
export const PRICING_BLOCK_END = "<!-- pricing:end -->";

/** The README table, between its markers. */
export function renderPricingBlock(tiers: readonly PricingTier[] = PRICING_TIERS): string {
  return [
    PRICING_BLOCK_START,
    "| Tier | Price | Includes |",
    "| --- | --- | --- |",
    ...tiers.map((row) => `| ${row.tier} | ${row.price} | ${row.includes} |`),
    PRICING_BLOCK_END,
  ].join("\n");
}
