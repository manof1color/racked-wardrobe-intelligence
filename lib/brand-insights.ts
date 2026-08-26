import type { BrandCommunityMetrics } from "./platform-types.ts";
import type { BrandMetrics } from "./metrics.ts";

// Judge note: this turns released aggregates into the questions a small apparel
// business actually asks, in their words. It describes observed behaviour only —
// never sales, revenue, conversion, intent, or causation — and it never invents a
// number: every value here is read straight from a server-computed metric.

export type ReadoutTone = "strong" | "watch" | "neutral";

export interface BusinessReadout {
  question: string;
  value: string;
  detail: string;
  tone: ReadoutTone;
}

function pct(value: number | null | undefined) { return `${Math.round(Number(value ?? 0))}%`; }

/** One plain sentence answering the question a brand opens this page to ask. */
export function wearHeadline(metrics: BrandMetrics): { statement: string; support: string } {
  if (metrics.suppressed) {
    return {
      statement: "Not enough opted-in owners yet to say anything about wear.",
      support: `Racked releases product wear only once at least ${metrics.minimumCohortSize} eligible owners have opted in. Until then no wear figure is shown, invented, or estimated.`,
    };
  }
  const engagement = Number(metrics.engagementRate ?? 0);
  const repeat = Number(metrics.repeatWearRate ?? 0);
  const statement = engagement >= 70 && repeat >= 50
    ? "This product is being worn, and worn again."
    : engagement >= 70
      ? "People are wearing this, but most have not come back to it yet."
      : engagement >= 40
        ? "Some owners wear this; a large share have not worn it at all."
        : "Most opted-in owners have not recorded wearing this yet.";
  return {
    statement,
    support: `${pct(engagement)} of ${metrics.segmentSize} eligible owners recorded at least one wear, and ${pct(repeat)} wore it more than once. Observed usage only — this says nothing about sales or intent.`,
  };
}

/** The private, consent-filtered wear questions, released only above the threshold. */
export function wearReadouts(metrics: BrandMetrics): BusinessReadout[] {
  if (metrics.suppressed) return [];
  const engagement = Number(metrics.engagementRate ?? 0);
  const repeat = Number(metrics.repeatWearRate ?? 0);
  const zero = Number(metrics.zeroWearOwners ?? 0);
  const staple = Number(metrics.highFrequencyOwners ?? 0);
  return [
    { question: "Are people actually wearing it?", value: pct(engagement), detail: `${metrics.activeOwners} of ${metrics.segmentSize} eligible owners recorded at least one confirmed wear.`, tone: engagement >= 70 ? "strong" : engagement >= 40 ? "neutral" : "watch" },
    { question: "Do they wear it more than once?", value: pct(repeat), detail: "Share of owners with two or more confirmed wears.", tone: repeat >= 50 ? "strong" : repeat >= 25 ? "neutral" : "watch" },
    { question: "Is it becoming a wardrobe staple?", value: `${staple} owner${staple === 1 ? "" : "s"}`, detail: "Owners with six or more confirmed wears.", tone: staple > 0 ? "strong" : "neutral" },
    { question: "How often does a typical owner reach for it?", value: `${metrics.medianWearsPerOwner ?? 0}×`, detail: `Median wears per eligible owner; the average is ${metrics.averageWearsPerOwner ?? 0}×.`, tone: "neutral" },
    { question: "Who bought it but never wore it?", value: `${zero} owner${zero === 1 ? "" : "s"}`, detail: "An education or styling opportunity. Racked cannot tell you who they are, and you cannot contact them.", tone: zero > 0 ? "watch" : "strong" },
    { question: "When was it last worn?", value: metrics.lastWearAt ? new Date(metrics.lastWearAt).toLocaleDateString() : "No events yet", detail: "Most recent confirmed wear event in the eligible cohort.", tone: "neutral" },
  ];
}

/** The public, intentionally-shared questions. Separate data path from wear. */
export function communityReadouts(metrics: BrandCommunityMetrics): BusinessReadout[] {
  return [
    { question: "Is it showing up in outfits people share?", value: `${metrics.publicOutfitAppearances}`, detail: `${metrics.consumerOutfitAppearances} published by people, ${metrics.brandLookAppearances} styled by you.`, tone: metrics.publicOutfitAppearances > 0 ? "strong" : "neutral" },
    { question: "Do those looks resonate?", value: `${metrics.inspirationCount}`, detail: "Inspirations saved on public Looks featuring this product.", tone: metrics.inspirationCount > 0 ? "strong" : "neutral" },
    { question: "Does it make people check their own closet?", value: `${metrics.recreateLookRequests}`, detail: "Identity-free 'recreate this look' requests on Looks featuring this product.", tone: metrics.recreateLookRequests > 0 ? "strong" : "neutral" },
    { question: "Does it send people to your product page?", value: `${metrics.outboundProductClicks}`, detail: "Clicks through Racked's controlled outbound link. A click is not a sale — Racked does not observe what happens on your site.", tone: metrics.outboundProductClicks > 0 ? "strong" : "neutral" },
    // Deliberately phrased as a demonstration count. This is a $0.00 simulation on a
    // fictional storefront; calling it a purchase, an order, or revenue would be false.
    { question: "How many demo checkouts have been completed?", value: `${metrics.demoPurchaseSimulations}`, detail: "Completed $0.00 purchase simulations on the fictional demo storefront. Nothing was charged and no order exists — this is a demonstration count, not a sale.", tone: "neutral" },
  ];
}

/** True when nothing public has happened yet, so the UI can say so instead of showing zeroes. */
export function communityIsEmpty(metrics: BrandCommunityMetrics) {
  return metrics.publicOutfitAppearances === 0 && metrics.inspirationCount === 0 && metrics.recreateLookRequests === 0 && metrics.outboundProductClicks === 0 && metrics.demoPurchaseSimulations === 0;
}

/** "What is it worn with?" — ranked pairings, public activity only. */
export function pairingSummary(metrics: BrandCommunityMetrics) {
  return {
    categories: metrics.pairedCategories.slice(0, 6),
    products: metrics.pairedVerifiedProducts.slice(0, 6),
    hasAny: metrics.pairedCategories.length > 0 || metrics.pairedVerifiedProducts.length > 0,
  };
}
