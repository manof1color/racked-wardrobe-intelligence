import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canExposeAggregate, ESTABLISHED_OWNER_MIN_AGE_DAYS, ESTABLISHED_OWNER_MIN_WEAR_DAYS, establishedOwners, exceedsEnumerationBudget, MINIMUM_COHORT_SIZE, toBrandSafeSegment } from "../lib/privacy.ts";
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
  assert.equal(metrics.segmentSize, 0, "a count below the threshold is a small cell too");
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

// ─── Established owners (S3) ──────────────────────────────────────────────────
// A brand could otherwise make 24 throwaway accounts, link its own product, and watch which one
// real owner tips the product over 25. Only owners whose account is 14+ days old and who wore the
// product on 3+ different days count, and only they appear in any figure.
const NOW = Date.parse("2026-11-18T15:00:00.000Z");
const DAY = 86_400_000;
const iso = (time: number) => new Date(time).toISOString();
/** An owner `ageDays` old with one confirmed wear on each of `wearDays` different days. */
function owner(id: string, ageDays: number, wearDays: number) {
  return {
    profile: { owner: id, createdAt: iso(NOW - ageDays * DAY) },
    wears: Array.from({ length: wearDays }, (_, day) => ({ owner: id, occurredAt: iso(NOW - (day + 1) * DAY) })),
  };
}
function counted(owners: ReturnType<typeof owner>[]) {
  return establishedOwners(owners.map((entry) => entry.profile), owners.flatMap((entry) => entry.wears), NOW);
}

test("the established-owner rule sits beside the cohort size", () => {
  assert.equal(ESTABLISHED_OWNER_MIN_AGE_DAYS, 14);
  assert.equal(ESTABLISHED_OWNER_MIN_WEAR_DAYS, 3);
  assert.equal(MINIMUM_COHORT_SIZE, 25);
});

test("24 new accounts and 1 established owner stay suppressed; 25 established owners are released", () => {
  const sybils = Array.from({ length: 24 }, (_, index) => owner(`USER#new-${index}`, 2, 5));
  const real = owner("USER#real", 200, 9);
  const mixed = counted([...sybils, real]);
  assert.deepEqual([...mixed], ["USER#real"]);
  assert.equal(canExposeAggregate(mixed.size), false, "25 linked owners, but only one counts");
  const established = counted(Array.from({ length: 25 }, (_, index) => owner(`USER#est-${index}`, 30, 3)));
  assert.equal(established.size, 25);
  assert.equal(canExposeAggregate(established.size), true);
});

test("wears on one day count as one day, however many there are", () => {
  const sameDay = { profile: { owner: "USER#a", createdAt: iso(NOW - 60 * DAY) }, wears: Array.from({ length: 10 }, (_, hour) => ({ owner: "USER#a", occurredAt: iso(Date.parse("2026-11-10T00:30:00.000Z") + hour * 3_600_000) })) };
  assert.equal(counted([sameDay]).size, 0);
  // Two days is still short; a third day qualifies.
  assert.equal(counted([owner("USER#b", 60, 2)]).size, 0);
  assert.equal(counted([owner("USER#b", 60, 3)]).size, 1);
  // Days are UTC days of the server's wear time: 23:59 and 00:01 are two days, two wears at 01:00 and 22:00 one.
  const edges = [{ owner: "USER#c", occurredAt: "2026-11-10T01:00:00.000Z" }, { owner: "USER#c", occurredAt: "2026-11-10T22:00:00.000Z" }, { owner: "USER#c", occurredAt: "2026-11-11T23:59:00.000Z" }, { owner: "USER#c", occurredAt: "2026-11-12T00:01:00.000Z" }];
  assert.equal(establishedOwners([{ owner: "USER#c", createdAt: iso(NOW - 60 * DAY) }], edges, NOW).size, 1);
  assert.equal(establishedOwners([{ owner: "USER#c", createdAt: iso(NOW - 60 * DAY) }], edges.slice(0, 3), NOW).size, 0);
});

test("an account younger than 14 days does not count, however often it wears", () => {
  assert.equal(counted([owner("USER#young", 13, 10)]).size, 0);
  assert.equal(counted([owner("USER#young", 13.99, 10)]).size, 0);
  assert.equal(counted([owner("USER#ready", 14, 10)]).size, 1);
});

test("the rule fails closed on anything it cannot read", () => {
  const wears = owner("USER#x", 60, 5).wears;
  for (const createdAt of [undefined, null, "", "not a date", 1_700_000_000_000]) {
    assert.equal(establishedOwners([{ owner: "USER#x", createdAt }], wears, NOW).size, 0, String(createdAt));
  }
  // Unreadable or future wear times are not days worn.
  const bad = [{ owner: "USER#y", occurredAt: "garbage" }, { owner: "USER#y", occurredAt: 12 }, { owner: "USER#y", occurredAt: iso(NOW + DAY) }, { owner: "USER#y", occurredAt: iso(NOW + 2 * DAY) }, { owner: "USER#y", occurredAt: iso(NOW - DAY) }, { owner: "USER#y", occurredAt: iso(NOW - 2 * DAY) }];
  assert.equal(establishedOwners([{ owner: "USER#y", createdAt: iso(NOW - 60 * DAY) }], bad, NOW).size, 0);
  // Another owner's wears never count toward this one, and an owner with no profile never counts.
  assert.equal(establishedOwners([{ owner: "USER#z", createdAt: iso(NOW - 60 * DAY) }], wears, NOW).size, 0);
  assert.equal(establishedOwners([], wears, NOW).size, 0);
  const real = Date.now();
  assert.equal(establishedOwners([{ owner: "USER#now", createdAt: iso(real - 60 * DAY) }], [1, 2, 3].map((days) => ({ owner: "USER#now", occurredAt: iso(real - days * DAY) }))).size, 1, "defaults to the current time");
});

test("the production aggregate counts only established owners, in every figure, from the reads it already makes", () => {
  const store = readFileSync(new URL("../lib/server/production-store.ts", import.meta.url), "utf8");
  const fn = store.slice(store.indexOf("export async function getRealProductMetrics"), store.indexOf("// ─── Hanger conversation memory"));
  assert.match(fn, /const countedOwners=establishedOwners\(optedInProfiles\.map\(account=>\(\{owner:String\(account\.PK\),createdAt:account\.createdAt\}\)\),wearEvents\.map\(event=>\(\{owner:String\(event\.ownerPK\),occurredAt:event\.occurredAt\}\)\)\);/);
  assert.match(fn, /const eligibleItems=items\.filter\(item=>countedOwners\.has\(String\(item\.PK\)\)\);/, "the cohort and the wear counts");
  assert.match(fn, /const eligibleEventDates=wearEvents\.filter\(event=>countedOwners\.has\(String\(event\.ownerPK\)\)\)/, "the weekly chart and the latest wear");
  assert.doesNotMatch(fn, /optedInOwners/, "no figure is built from the wider opted-in set");
  assert.match(fn, /const minimumCohortSize=MINIMUM_COHORT_SIZE;/);
  assert.doesNotMatch(fn, /minimumCohortSize=\d/, "no hard-coded threshold");
  assert.match(fn, /filter\(key=>!isDemoAccountId\(key\.slice\("USER#"\.length\)\)\)/, "demo accounts stay excluded");
  assert.match(fn, /filter\(account=>account\.brandDataSharing===true\)/, "consent still comes first");
  // No new read: one product check, the budget, two queries, and the batched profile reads.
  assert.equal(fn.match(/db\.send\(/g)?.length, 2);
  assert.equal(fn.match(/queryEveryPage\(/g)?.length, 2);
  assert.equal(fn.match(/enforceAggregateEnumerationBudget\(/g)?.length, 1);
});

test("the judge demo's released product still clears 25 established owners, and the small one stays suppressed", async () => {
  process.env.RACKED_SEED_DRY_RUN = "yes";
  const { buildJudgeSeed } = await import("../scripts/seed-judge-accounts.mjs");
  const items = (await buildJudgeSeed()).written.items as Array<Record<string, unknown>>;
  const profiles = items.filter((item) => item.SK === "PROFILE" && item.brandDataSharing === true).map((item) => ({ owner: String(item.PK), createdAt: item.createdAt }));
  const latest = (values: unknown[]) => Math.max(...values.map((value) => Date.parse(String(value))).filter(Number.isFinite));
  // Judged just after the newest seeded record and at least 14 days after the newest account, whatever clock the seed ran on.
  const at = Math.max(latest(items.filter((item) => String(item.SK).startsWith("WEAR#")).map((item) => item.occurredAt)), latest(profiles.map((entry) => entry.createdAt)) + 14 * DAY) + 3_600_000;
  for (const [product, released] of [["PRODUCT#judge-product-released", true], ["PRODUCT#judge-product-suppressed", false]] as const) {
    const linked = new Set(items.filter((item) => item.GSI1PK === product && String(item.PK).startsWith("USER#")).map((item) => String(item.PK)));
    const wears = items.filter((item) => item.PK === product && String(item.SK).startsWith("WEAR#")).map((item) => ({ owner: String(item.ownerPK), occurredAt: item.occurredAt }));
    const cohort = [...establishedOwners(profiles, wears, at)].filter((key) => linked.has(key));
    assert.equal(canExposeAggregate(cohort.length), released, `${product}: ${cohort.length} established`);
  }
});
