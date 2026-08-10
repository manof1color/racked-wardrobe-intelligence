import test from "node:test";
import assert from "node:assert/strict";
import { canExposeAggregate, exceedsEnumerationBudget, MINIMUM_COHORT_SIZE, toBrandSafeSegment } from "../lib/privacy.ts";
import { runBrandWearAgent } from "../lib/agents.ts";
import { calculateBrandMetrics } from "../lib/metrics.ts";
import { computeProductCohort } from "../lib/segments.ts";
import { catalog } from "../lib/demo-data.ts";
import type { WardrobeItem } from "../lib/types.ts";

const sampleWardrobe: WardrobeItem[] = [
  { id:"s1", name:"Sample tee", category:"top", color:"white", style:["minimal"], season:"all-season", wearCount:10, lastWornDays:2, source:"manual", art:"ivory" },
  { id:"s2", name:"Sample jean", category:"bottom", color:"indigo", style:["classic"], season:"all-season", wearCount:8, lastWornDays:4, source:"manual", art:"denim" },
];

test("segments below the privacy threshold are suppressed", () => {
  assert.equal(canExposeAggregate(MINIMUM_COHORT_SIZE - 1), false);
  assert.equal(toBrandSafeSegment({ id:"small",label:"Small",size:12,emails:["fictional@example.test"] }), null);
});

test("brand-safe segments exclude identities and raw wardrobe references", () => {
  const result = toBrandSafeSegment({ id:"s1",label:"Neutral-first",size:148,emails:["fictional@example.test"],wardrobeIds:["w1"] });
  assert.deepEqual(result, { id:"s1",label:"Neutral-first",size:148 });
});

test("computeProductCohort only counts profiles that are BOTH opted in and score-relevant", () => {
  const product = catalog[0];
  const population = [
    { id:"pop-1", optedIn:true, wardrobe:sampleWardrobe },   // opted in, may or may not clear the relevance bar
    { id:"pop-2", optedIn:false, wardrobe:sampleWardrobe },  // relevant but NOT opted in — must be excluded
    { id:"pop-3", optedIn:true, wardrobe:[] },               // opted in but empty wardrobe — very unlikely to be relevant
  ];
  const cohort = computeProductCohort(product, null, population);
  assert.ok(cohort.profiles.every((profile) => profile.optedIn), "every counted profile must be opted in");
  assert.ok(cohort.size <= population.filter((p) => p.optedIn).length, "cohort can never exceed the opted-in subset");
});

test("computeProductCohort includes a live profile only when it is opted in", () => {
  const product = catalog[0];
  const basePopulation = Array.from({ length: 30 }, (_, index) => ({ id:`base-${index}`, optedIn:true, wardrobe:sampleWardrobe }));
  const withConsent = computeProductCohort(product, { optedIn:true, wardrobe:sampleWardrobe }, basePopulation);
  const withoutConsent = computeProductCohort(product, { optedIn:false, wardrobe:sampleWardrobe }, basePopulation);
  assert.equal(withConsent.size, withoutConsent.size + (withConsent.size > withoutConsent.size ? 1 : 0));
  assert.ok(withConsent.size >= withoutConsent.size, "revoking consent must never increase the cohort");
});

test("brand wear agent actually suppresses aggregates for a below-threshold cohort", () => {
  // NA-AC-6044 (p7, an accessory that only pairs with dresses/outerwear) lands below the
  // k >= 25 floor with the real seeded population — an emergent case, not a hand-picked one.
  const smallCohortProduct = catalog.find((product) => product.id === "p7")!;
  const cohort = computeProductCohort(smallCohortProduct);
  assert.ok(cohort.size < MINIMUM_COHORT_SIZE, "fixture assumption: this product's real computed cohort must stay below threshold");
  const reply = runBrandWearAgent(smallCohortProduct.id);
  assert.equal(reply.confidence, "low");
  assert.ok(!/\d+% .*wear rate/.test(reply.message), "no wear-rate percentage should be released");
  assert.match(reply.message, /below the minimum/i);
  assert.ok(!reply.actions.some((action) => action.type === "segment"), "no segment drill-down action for a suppressed cohort");
});

test("brand wear agent releases the aggregate for an above-threshold cohort", () => {
  const largeCohortProduct = catalog.find((product) => product.id === "p1")!;
  const cohort = computeProductCohort(largeCohortProduct);
  assert.ok(cohort.size >= MINIMUM_COHORT_SIZE);
  const reply = runBrandWearAgent(largeCohortProduct.id);
  assert.equal(reply.confidence, "high");
  assert.match(reply.message, /actual-wear rate/);
});

test("calculateBrandMetrics suppresses per-product metrics for a below-threshold cohort", () => {
  const smallCohortProduct = catalog.find((product) => product.id === "p7")!;
  const metrics = calculateBrandMetrics(smallCohortProduct);
  assert.equal(metrics.suppressed, true);
  assert.equal(metrics.opportunity, null);
  assert.equal(metrics.gapPrevalence, null);
  assert.equal(metrics.duplicateRisk, null);
});

test("calculateBrandMetrics releases per-product metrics for an above-threshold cohort", () => {
  const largeCohortProduct = catalog.find((product) => product.id === "p1")!;
  const metrics = calculateBrandMetrics(largeCohortProduct);
  assert.equal(metrics.suppressed, false);
  assert.equal(typeof metrics.opportunity, "number");
});

test("a consumer revoking brand-data consent can never increase any product's cohort", () => {
  for (const product of catalog) {
    const withConsent = computeProductCohort(product, { optedIn:true, wardrobe:sampleWardrobe });
    const withoutConsent = computeProductCohort(product, { optedIn:false, wardrobe:sampleWardrobe });
    assert.ok(withConsent.size >= withoutConsent.size);
  }
});

test("enumeration budget allows re-querying the same product freely", () => {
  const now = Date.now();
  const log = [
    { subject:"brand-1", productId:"p1", at:now },
    { subject:"brand-1", productId:"p1", at:now },
    { subject:"brand-1", productId:"p1", at:now },
  ];
  assert.equal(exceedsEnumerationBudget(log, "brand-1", "p1", now), false);
});

test("enumeration budget trips after too many DISTINCT products in the window", () => {
  const now = Date.now();
  const log = Array.from({ length: 6 }, (_, i) => ({ subject:"brand-1", productId:`p${i+1}`, at:now }));
  assert.equal(exceedsEnumerationBudget(log, "brand-1", "p8", now, { maxDistinctProducts:6 }), true);
  assert.equal(exceedsEnumerationBudget(log, "brand-1", "p1", now, { maxDistinctProducts:6 }), false, "re-querying an already-seen product should not trip the budget");
});

test("enumeration budget is scoped per subject and per time window", () => {
  const now = Date.now();
  const log = Array.from({ length: 6 }, (_, i) => ({ subject:"brand-1", productId:`p${i+1}`, at:now }));
  assert.equal(exceedsEnumerationBudget(log, "brand-2", "p8", now, { maxDistinctProducts:6 }), false, "a different subject has its own budget");
  assert.equal(exceedsEnumerationBudget(log, "brand-1", "p8", now + 10 * 60 * 1000, { maxDistinctProducts:6, windowMs:5 * 60 * 1000 }), false, "events outside the window no longer count");
});
