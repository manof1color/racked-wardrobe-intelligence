/**
 * The proposed price tiers: one source for the /pricing page and the README table. Nothing here is
 * billed. `includes` describes only what the product shows today; the Basic plan in particular
 * promises no private wear data below the k ≥ 25 threshold.
 *
 * Brand plans set by the owner on 2026-11-04 after talking with the pilot brands: two plans, $20 and
 * $40 a month, in line with the apps small brands already pay for on platforms like Shopify. The
 * line between them is the privacy threshold: Basic before a product reaches k ≥ 25, Pro after. Enrollment is
 * included in every plan; there is no per-product fee.
 *
 * Owner decision 2026-11-13: a referral commission of 8% on top of the plans, the usual range for
 * fashion affiliate programs. It applies only when someone buys an exact, brand-verified product after
 * following a Racked link (Shop the Look opens the brand's own site), so Racked earns from a sale it
 * caused and nothing else. Like the plans, it is proposed and not billed.
 */
export type PricingTier = { tier: string; price: string; includes: string };

/** The proposed referral commission (owner decision 2026-11-13), as a fraction of the sale price. */
export const REFERRAL_COMMISSION_RATE = 0.08;

/**
 * How a referred sale would split: Racked's commission and what the brand keeps, in dollars, rounded
 * to the cent. Shown on /pricing, the demo bag's confirmation and the Stripe test receipt to illustrate
 * the model; nothing is moved or billed.
 */
export function referralSplit(amount: number) {
  const commission = Math.round(amount * REFERRAL_COMMISSION_RATE * 100) / 100;
  return { commission, brandReceives: Math.round((amount - commission) * 100) / 100 };
}

export const PRICING_TIERS: readonly PricingTier[] = [
  { tier: "Consumer Free", price: "$0", includes: "Wardrobe logging, wear tracking, limited Hanger queries" },
  { tier: "Consumer Pro", price: "$6.99/mo or $59/yr", includes: "Unlimited Hanger, advanced analytics, outfit export" },
  { tier: "Brand Basic (below k≥25)", price: "$20/mo", includes: "Product enrollment and verification, public Community activity for your products, Brand Looks, and threshold status (released or not yet). No private wear data until a product reaches k ≥ 25." },
  { tier: "Brand Pro (post-threshold)", price: "$40/mo", includes: "Basic + the full aggregate dashboard for products past k ≥ 25, CSV export, multi-product comparison and Hanger strategy artifacts" },
  { tier: "Referral commission (brands)", price: "8% of referred sales", includes: "Paid by the brand only when someone buys an exact, verified product after following a Racked link to the brand's own site. Nothing on other purchases, and the shopper pays no extra." },
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
