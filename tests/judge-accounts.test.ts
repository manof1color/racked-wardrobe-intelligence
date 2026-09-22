import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankCatalogCandidates, searchCatalog } from "../lib/catalog-match.ts";
import { costPerWearLine } from "../lib/cost-per-wear.ts";
import { matchBrandProduct } from "../lib/product-registry.ts";
import { MINIMUM_COHORT_SIZE } from "../lib/privacy.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The seed is run in dry-run mode: it builds every record it would write, touches no AWS, and
// needs no password. That is what makes it checkable here against the app's own rules, rather
// than only after someone has written 176 records to a live table.
process.env.RACKED_SEED_DRY_RUN = "yes";
const { buildJudgeSeed, JUDGE_SEED_IDS } = await import("../scripts/seed-judge-accounts.mjs");
const { written, summary } = await buildJudgeSeed();
const items = written.items as Array<Record<string, unknown>>;
const objects = new Set(written.objects as string[]);
const of = (prefix: string, key = "SK") => items.filter((item) => String(item[key] ?? "").startsWith(prefix));
const profiles = items.filter((item) => item.SK === "PROFILE");
const products = of("PRODUCT#").filter((item) => String(item.PK).startsWith("USER#")) as unknown as BrandProductRegistration[];
const judgeGarments = items.filter((item) => item.PK === `USER#${JUDGE_SEED_IDS.consumer.id}` && String(item.SK).startsWith("GARMENT#"));

test("every judge account is synthetic, labelled, and non-deliverable", () => {
  const judgeProfiles = profiles.filter((profile) => String(profile.email).startsWith("judge."));
  assert.equal(judgeProfiles.length, 4, "a lived-in consumer, an empty consumer, a brand, and an empty brand");
  for (const profile of profiles) {
    assert.equal(profile.dataClassification, "DEMO");
    assert.equal(profile.testCohort, true);
    assert.match(String(profile.email), /@racked\.local$/, "reserved addresses cannot receive real mail");
    assert.ok(!("password" in profile), "only the hash and salt are stored");
    assert.ok(String(profile.passwordHash).length > 0);
  }
  const seed = read("scripts/seed-judge-accounts.mjs");
  assert.match(seed, /RACKED_TEST_PASSWORD/);
  assert.doesNotMatch(seed, /password\s*=\s*"(?!dry-run)/, "no password is ever written into the repository");
});

test("a brand account seeded here holds its name the way a registered one does", () => {
  const claims = items.filter((item) => String(item.PK).startsWith("BRANDNAME#"));
  assert.deepEqual(claims.map((claim) => claim.PK).sort(), [`BRANDNAME#${JUDGE_SEED_IDS.brand.slug}`, `BRANDNAME#${JUDGE_SEED_IDS.freshBrand.slug}`].sort());
  for (const claim of claims) assert.equal(claim.SK, "CLAIM");
});

// A judge signing in should see released metrics on one product and suppression on another. That
// only works if the owners' profiles exist and have sharing on, which is why the seed creates any
// the main cohort did not.
test("the released product clears the k >= 25 threshold and the other two do not", () => {
  const optedIn = new Set(profiles.filter((profile) => profile.brandDataSharing === true).map((profile) => profile.PK));
  const ownersOf = (productId: string) => new Set(items
    .filter((item) => item.GSI1PK === `PRODUCT#${productId}` && optedIn.has(item.PK))
    .map((item) => item.PK));
  assert.ok(ownersOf("judge-product-released").size >= MINIMUM_COHORT_SIZE, `released product needs ${MINIMUM_COHORT_SIZE} opted-in owners, has ${ownersOf("judge-product-released").size}`);
  // A product one owner past the threshold proves the rule and nothing else. Fifty owners gives a
  // judge a distribution and a trend to read, and the suppressed product beside it still shows the
  // rule holding — the contrast is the demo, so both halves of it are pinned here.
  assert.equal(ownersOf("judge-product-released").size, 50, "the released product shows a live-scale cohort, not a borderline one");
  assert.equal(ownersOf("judge-product-suppressed").size, 4, "deliberately below the threshold, so suppression is visible");
  assert.equal(summary.cohort.optedInOwnersForReleased, 50);
  assert.equal(summary.cohort.suppressedProductOwners, 4);
  assert.equal(ownersOf("judge-product-retired").size, 0);
  assert.equal(summary.cohort.thresholdIs, MINIMUM_COHORT_SIZE);

  const wears = of("WEAR#").filter((item) => item.PK === "PRODUCT#judge-product-released");
  assert.ok(wears.length > 40, "a chart needs real events behind it");
  assert.ok(wears.every((wear) => String(wear.ownerPK).startsWith("USER#") && wear.eventType === "confirmed-wear"));
});

test("the judge closet shows a verified link and an owner's pick side by side", () => {
  const verified = judgeGarments.filter((garment) => garment.identityStatus === "verified");
  const picked = judgeGarments.filter((garment) => garment.identityStatus === "owner-selected");
  assert.equal(verified.length, 1);
  assert.equal(picked.length, 1);
  assert.equal(verified[0].GSI1PK, "PRODUCT#judge-product-released", "a verified link joins the brand's owner index");
  assert.equal(picked[0].GSI1PK, undefined, "a pick never does");
  assert.equal(picked[0].registryProductId, null);
  assert.equal(picked[0].selectedProductId, "judge-product-suppressed");
  for (const garment of [verified[0], picked[0]]) {
    assert.ok(costPerWearLine(garment as never), "both show cost per wear from the brand's listed price");
  }
  assert.equal(judgeGarments.length, 12);
});

test("nothing in the seed points at an image that was never uploaded", () => {
  for (const garment of items.filter((item) => String(item.SK).startsWith("GARMENT#") && item.PK === `USER#${JUDGE_SEED_IDS.consumer.id}`)) {
    assert.ok(objects.has(String(garment.imageKey)), `missing wardrobe image ${garment.imageKey}`);
  }
  for (const product of products) {
    for (const view of Object.values(product.views ?? {})) assert.ok(objects.has(String(view.storageKey)), `missing product image ${view.storageKey}`);
  }
  for (const post of items.filter((item) => item.PK === "COMMUNITY" && String(item.SK).startsWith("POST#"))) {
    for (const garment of (post.publishedGarments as Array<{ imageKey: string }>)) assert.ok(objects.has(garment.imageKey), `published look points at missing image ${garment.imageKey}`);
  }
});

test("saved outfits only contain pieces the judge account owns", () => {
  const owned = new Set(judgeGarments.map((garment) => garment.id));
  const outfits = items.filter((item) => String(item.SK).startsWith("OUTFIT#"));
  assert.equal(outfits.length, 2);
  for (const outfit of outfits) for (const itemId of outfit.itemIds as string[]) assert.ok(owned.has(itemId), `outfit references a missing piece ${itemId}`);
});

test("the demo exercises Community, the brand page, and public activity", () => {
  const posts = items.filter((item) => item.PK === "COMMUNITY" && String(item.SK).startsWith("POST#"));
  assert.equal(posts.length, 2, "one consumer look and one Brand Look");
  assert.deepEqual(posts.map((post) => post.sourceType).sort(), ["brand", "consumer"]);
  const consumerPost = posts.find((post) => post.sourceType === "consumer")!;
  const verifiedPieces = (consumerPost.publishedGarments as Array<Record<string, unknown>>).filter((garment) => garment.resolutionState === "EXACT_VERIFIED_PRODUCT");
  assert.equal(verifiedPieces.length, 1, "so Shop the Look has exactly one openable piece");
  assert.ok(!("ownerId" in (verifiedPieces[0] as object)), "a published piece carries no owner");

  const events = items.filter((item) => item.PK === "COMMUNITY" && String(item.SK).startsWith("EVENT#"));
  assert.deepEqual(events.map((event) => event.eventType).sort(), ["demo-purchase", "outbound-product-click", "product-click", "recreate-look-request"]);
  for (const event of events) assert.ok(!("ownerId" in event) && !("ownerPK" in event), "public activity is identity-free");
  assert.equal(items.filter((item) => String(item.SK).startsWith("INSPIRATION#")).length, 1);
  assert.equal(items.filter((item) => String(item.SK).startsWith("BRANDLOOK#")).length, 1);
});

test("the seeded catalog behaves the way the live app will read it", () => {
  const live = products.filter((product) => !product.archived);
  assert.equal(products.length, 3);
  assert.equal(live.length, 2, "one product is retired on purpose");

  assert.equal(matchBrandProduct([], `${JUDGE_SEED_IDS.brand.name} JDA-001`, products)?.product.sku, "JDA-001", "the label a judge can type verifies");
  assert.equal(matchBrandProduct([], `${JUDGE_SEED_IDS.brand.name} JDA-003`, products), null, "the retired product answers nothing");

  const candidates = rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", brandText: "Judge Demo Atelier" }, products);
  assert.equal(candidates[0]?.sku, "JDA-001", "scanning a navy tee finds the enrolled product");
  assert.deepEqual(searchCatalog("judge", products).map((result) => result.sku).sort(), ["JDA-001", "JDA-002"], "search finds the live products only");
});

test("the seed is a dry run by default in tests, and says what it would write", () => {
  assert.match(String(summary.mode), /dry run/);
  assert.equal(summary.judgeBrand.releasedProduct, "JDA-001");
  assert.equal(summary.freshConsumer.wardrobePieces, 0);
  assert.equal(summary.freshBrand.products, 0);
  assert.ok(summary.totals.items > 100);
  const seed = read("scripts/seed-judge-accounts.mjs");
  assert.match(seed, /ALLOW_RACKED_TEST_SEED !== "yes"/, "a real write still needs explicit confirmation");
});
