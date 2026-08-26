import test from "node:test";
import assert from "node:assert/strict";
import { communityIsEmpty, communityReadouts, pairingSummary, wearHeadline, wearReadouts } from "../lib/brand-insights.ts";
import type { BrandCommunityMetrics } from "../lib/platform-types.ts";
import type { BrandMetrics } from "../lib/metrics.ts";

const released: BrandMetrics = {
  opportunity: null, gapPrevalence: null, duplicateRisk: null, segmentSize: 25, suppressed: false, minimumCohortSize: 25,
  actualWears: 76, activeOwners: 22, engagementRate: 88, repeatWearRate: 76, averageWearsPerOwner: 3, medianWearsPerOwner: 3,
  zeroWearOwners: 3, highFrequencyOwners: 2, lastWearAt: "2026-08-09T00:00:00.000Z", wearDistribution: [], weeklyTrend: [],
};

const suppressed: BrandMetrics = { opportunity: null, gapPrevalence: null, duplicateRisk: null, segmentSize: 7, suppressed: true, minimumCohortSize: 25 };

const community: BrandCommunityMetrics = {
  productId: "p1", publicOutfitAppearances: 11, consumerOutfitAppearances: 9, brandLookAppearances: 2,
  inspirationCount: 37, recreateLookRequests: 15, outboundProductClicks: 4,
  pairedCategories: [{ category: "bottom", appearances: 7 }], pairedVerifiedProducts: [{ productId: "p2", name: "City Sneaker", brand: "Other", appearances: 5 }], demoPurchaseSimulations: 0, lastDemoPurchaseAt: null,
  privacyBoundary: "PUBLIC_ACTIVITY_ONLY",
};

test("a suppressed cohort produces no wear readouts and says why", () => {
  assert.deepEqual(wearReadouts(suppressed), []);
  const headline = wearHeadline(suppressed);
  assert.match(headline.statement, /not enough/i);
  assert.match(headline.support, /25 eligible owners/);
  assert.doesNotMatch(JSON.stringify(headline), /\b7\b/, "the below-threshold cohort size must not leak into the headline");
});

test("every readout is phrased as a business question with a real value", () => {
  for (const readout of [...wearReadouts(released), ...communityReadouts(community)]) {
    assert.match(readout.question, /\?$/, `"${readout.question}" should be a question`);
    assert.ok(readout.value.length > 0);
    assert.ok(readout.detail.length > 0);
  }
});

test("REGRESSION: brand-facing copy never claims sales, revenue, conversion, intent, or causation", () => {
  const copy = JSON.stringify([wearHeadline(released), ...wearReadouts(released), ...communityReadouts(community)]).toLowerCase();
  for (const forbidden of ["sales lift", "revenue", "conversion rate", "purchase intent", "caused", "drove sales", "roi"]) {
    assert.equal(copy.includes(forbidden), false, `copy must not contain "${forbidden}"`);
  }
  assert.match(copy, /not a sale/, "outbound clicks must be explicitly disclaimed");
});

test("the zero-wear question never implies the brand can reach those owners", () => {
  const zeroWear = wearReadouts(released).find((readout) => /never wore it/i.test(readout.question));
  assert.ok(zeroWear);
  assert.match(zeroWear.detail, /cannot tell you who they are/i);
});

test("headline reflects the actual engagement and repeat picture", () => {
  assert.match(wearHeadline(released).statement, /worn again/i);
  assert.match(wearHeadline({ ...released, engagementRate: 30, repeatWearRate: 5 }).statement, /have not recorded wearing/i);
  assert.match(wearHeadline({ ...released, engagementRate: 80, repeatWearRate: 10 }).statement, /not come back/i);
});

test("empty public activity is detectable so the UI can be honest instead of showing zeroes", () => {
  assert.equal(communityIsEmpty(community), false);
  assert.equal(communityIsEmpty({ ...community, publicOutfitAppearances: 0, inspirationCount: 0, recreateLookRequests: 0, outboundProductClicks: 0 }), true);
});

test("pairings are bounded and report whether anything exists", () => {
  const summary = pairingSummary(community);
  assert.equal(summary.hasAny, true);
  assert.ok(summary.categories.length <= 6 && summary.products.length <= 6);
  assert.equal(pairingSummary({ ...community, pairedCategories: [], pairedVerifiedProducts: [] }).hasAny, false);
});
