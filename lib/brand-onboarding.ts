import type { BrandProductRegistration } from "./platform-types.ts";

/**
 * The first hour of a brand account, as four steps that finish.
 *
 * A brand signing up sees an empty workspace and has to infer what to do with it. These steps are
 * derived from the account's own records, so they survive a refresh, a new device, and a new session
 * without storing progress anywhere: a product either exists or it does not. Only "shared" is a
 * local convenience, because copying a link is not something the server can observe.
 *
 * Like the rest of the overview, this never consults wear data. Whether a product has reached the
 * 25-owner release threshold is not a step a brand can complete, and showing it per product across a
 * catalog is exactly the comparison the enumeration budget prevents.
 */
export interface BrandOnboardingStep {
  id: "enroll" | "describe" | "look" | "share";
  label: string;
  detail: string;
  done: boolean;
}

export interface BrandOnboardingInput {
  products: BrandProductRegistration[];
  publishedLookCount: number;
  sharedLink: boolean;
}

export function brandOnboardingSteps({ products, publishedLookCount, sharedLink }: BrandOnboardingInput): BrandOnboardingStep[] {
  const live = products.filter((product) => !product.archived);
  const described = live.filter((product) => product.price !== undefined && Boolean(product.productUrl) && Boolean(product.color || product.subtype));
  return [
    {
      id: "enroll",
      label: "Enrol your first product",
      detail: "One product photo and its style code. Racked reads the rest from the photo.",
      done: live.length > 0,
    },
    {
      id: "describe",
      label: "Give it a price, a link, and a description",
      detail: "A price becomes cost per wear in an owner's closet, and what it looks like is how a customer's scan recognises it without the label.",
      done: described.length > 0,
    },
    {
      id: "look",
      label: "Publish a Brand Look",
      detail: "Style your own products into a look. It appears in Community and on your public page.",
      done: publishedLookCount > 0,
    },
    {
      id: "share",
      label: "Share your page with customers",
      detail: "They link a piece by searching your brand name, or with the code on its label. Every link moves a product toward its first release.",
      done: sharedLink,
    },
  ];
}

export function brandOnboardingComplete(steps: BrandOnboardingStep[]) {
  return steps.every((step) => step.done);
}

/** How far along, for a line a brand can read at a glance. */
export function brandOnboardingProgress(steps: BrandOnboardingStep[]) {
  return { done: steps.filter((step) => step.done).length, total: steps.length };
}
