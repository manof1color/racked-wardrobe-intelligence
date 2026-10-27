/**
 * Brand approval, and the catalog size each brand may reach.
 *
 * Anyone could register a brand account and at once enroll products, publish Looks and read wear
 * analytics under a brand name they did not have to prove. A brand registered from now on starts
 * **pending**: it can sign in, change its settings and set up two-step sign-in, but every brand
 * capability is refused until the owner approves it (docs/brand-approval.md). The owner can also
 * **revoke** a brand, which refuses the same capabilities and takes its products out of the public
 * registry.
 *
 * Brand accounts created before approval existed have no status, and stay approved: the live
 * brands and the judge accounts keep working with no migration. Any status other than the three
 * below is treated as not approved.
 */
export type BrandStatus = "pending" | "approved" | "revoked";

export function brandStatusOf(account: { role?: unknown; brandStatus?: unknown } | null | undefined): BrandStatus | null {
  if (!account || account.role !== "brand") return null;
  if (account.brandStatus === undefined || account.brandStatus === "approved") return "approved";
  if (account.brandStatus === "revoked") return "revoked";
  return "pending";
}

export const brandApproved = (account: { role?: unknown; brandStatus?: unknown } | null | undefined) => brandStatusOf(account) === "approved";

export const BRAND_STATUS_MESSAGES: Record<Exclude<BrandStatus, "approved">, string> = {
  pending: "Your brand account is waiting for approval. You can update your settings meanwhile; adding products, publishing Looks and brand insights open once it is approved.",
  revoked: "This brand account's access has been withdrawn. Contact Racked if you think this is a mistake.",
};

/**
 * How many products one brand may enroll. Archived products still count: their photos are still
 * stored. Real catalogs sit well below it; raising it is a one-line change here.
 */
export const BRAND_PRODUCT_LIMIT = 300;

export function productLimitMessage(limit: number) {
  return `Your catalog has reached its limit of ${limit} products. Contact Racked to raise it.`;
}
