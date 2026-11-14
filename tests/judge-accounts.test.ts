import { JUDGE_LOOKS, JUDGE_LOOK_PRODUCTS } from "../scripts/lib/judge-community-looks.mjs";
import { GARMENT_TAXONOMY } from "../lib/garment-taxonomy.ts";
import { classifyLookStyles } from "../lib/look-discovery.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { rankCatalogCandidates, searchCatalog } from "../lib/catalog-match.ts";
import { costPerWearLine } from "../lib/cost-per-wear.ts";
import { matchBrandProduct } from "../lib/product-registry.ts";
import { MINIMUM_COHORT_SIZE } from "../lib/privacy.ts";
import { buildWearUsageAnalytics, MINIMUM_CELL_SIZE, releaseWearAnalytics } from "../lib/metrics.ts";
import { JUDGE_CHART_RULE, judgeChartProblems, weeklyWearBuckets } from "../scripts/lib/judge-wear-window.mjs";
import { JUDGE_PHOTO_DIR, JUDGE_PHOTO_SIZE, JUDGE_PHOTO_TYPE, judgePhoto, judgePhotoPath, productPhotoName } from "../scripts/lib/judge-photos.mjs";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The seed is run in dry-run mode: it builds every record it would write, touches no AWS, and
// needs no password. That is what makes it checkable here against the app's own rules, rather
// than only after someone has written 176 records to a live table.
process.env.RACKED_SEED_DRY_RUN = "yes";
// The seed counts its dates back from the day it runs; pinned here so every assertion is exact.
const SEED_NOW = "2026-11-18T15:00:00.000Z";
process.env.RACKED_SEED_NOW = SEED_NOW;
const { buildJudgeSeed, planSeededDeletes, seedClock, ACCOUNT_AGE_DAYS, JUDGE_SEED_IDS } = await import("../scripts/seed-judge-accounts.mjs");
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

// More than one product opens, and every demo product says which side of the threshold it is on, so a
// brand can go straight to the pieces with wear data.
test("half the demo products clear the threshold and every one is labelled to match", () => {
  const optedIn = new Set(profiles.filter((profile) => profile.brandDataSharing === true).map((profile) => profile.PK));
  const ownersOf = (productId: string) => new Set(items.filter((item) => item.GSI1PK === `PRODUCT#${productId}` && optedIn.has(item.PK)).map((item) => item.PK)).size;
  const products = items.filter((item) => item.PK === `USER#${JUDGE_SEED_IDS.brand.id}` && String(item.SK).startsWith("PRODUCT#"));
  const open = products.filter((product) => product.demoWearCohort === "open").map((product) => product.sku).sort();
  assert.equal(open.length, 15);
  assert.equal(products.length - open.length, 15, "an even split between open and too few");
  assert.ok(open.includes("JDA-001"));
  for (const product of products) {
    const owners = ownersOf(String(product.id));
    if (product.demoWearCohort === "open") assert.ok(owners >= MINIMUM_COHORT_SIZE, `${product.sku} is labelled open with ${owners} owners`);
    else { assert.equal(product.demoWearCohort, "too-few"); assert.ok(owners < MINIMUM_COHORT_SIZE, `${product.sku} is labelled too few with ${owners} owners`); }
  }
});

test("the judge closet shows a verified link and an owner's pick side by side", () => {
  const verified = judgeGarments.filter((garment) => garment.identityStatus === "verified");
  const picked = judgeGarments.filter((garment) => garment.identityStatus === "owner-selected");
  assert.equal(verified.length, 2);
  assert.equal(picked.length, 1);
  assert.deepEqual(verified.map((piece) => piece.GSI1PK).sort(), ["PRODUCT#judge-product-founder", "PRODUCT#judge-product-released"]);
  assert.equal(picked[0].GSI1PK, undefined, "a pick never does");
  assert.equal(picked[0].registryProductId, null);
  assert.equal(picked[0].selectedProductId, "judge-product-suppressed");
  for (const garment of [...verified, picked[0]]) {
    assert.ok(costPerWearLine(garment as never), "both show cost per wear from the brand's listed price");
  }
  assert.equal(judgeGarments.length, 13);
});

// Scope, stated plainly: this covers everything a judge is shown — the judge closet, the brand's
// product photos, and the published looks. It does not cover the synthetic cohort's linked
// garments, whose image keys are never uploaded. Those records exist to be counted by the brand
// aggregate, which reads no image; nobody signs in as a cohort owner during the demo. If that ever
// changes, this test must widen before the demo does.
test("nothing a judge is shown points at an image that was never uploaded", () => {
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

// The judge accounts show AI-generated photos of fictional items (docs/judge-accounts.md), one per
// wardrobe piece and per product view. A missing or oversized photo would show a broken tile or a
// slow page to every judge.
test("every judge image is one of the demo photos, and every photo is used", () => {
  const photos = readdirSync(JUDGE_PHOTO_DIR).filter((name) => name.endsWith(".webp")).map((name) => name.replace(/\.webp$/, "")).sort();
  const expected = ["look-brand-founder", "look-member-founder", ...JUDGE_LOOKS.flatMap((look) => [look.photo, ...look.pieces.flatMap((piece: { photo?: string }) => piece.photo ? [piece.photo] : [])]), ...judgeGarments.filter((garment) => !String(garment.registryProductId ?? "") && !String(garment.selectedProductId ?? "")).map((garment) => String(garment.id).replace("judge-garment-", "")), ...products.flatMap((product) => Object.keys(product.views).map((view) => productPhotoName(product.sku, view)))].sort();
  assert.deepEqual(photos, expected, "one photo per plain wardrobe piece and per product view, with none left over");
  for (const key of objects) {
    if (key.startsWith(`wardrobe/${JUDGE_SEED_IDS.consumer.id}/`) || key.startsWith(`brand/${JUDGE_SEED_IDS.brand.id}/`)) assert.match(key, /\.webp$/, key);
  }
  // The verified tee and the picked overshirt in the closet show their product's own front photo.
  for (const [id, sku] of [["judge-garment-verified-tee", "JDA-001"], ["judge-garment-picked-overshirt", "JDA-002"], ["judge-garment-verified-founder", "JDA-004"]]) {
    assert.ok(judgeGarments.some((garment) => garment.id === id && String(garment.imageKey).endsWith(`/${id}.webp`)), id);
    assert.ok(photos.includes(productPhotoName(sku, "front")));
  }
  assert.throws(() => judgePhoto("not-a-photo"), /Missing judge photo not-a-photo\.webp/);
});

test("each demo photo has its expected WebP size, and each product view records its real bytes", async () => {
  for (const name of readdirSync(JUDGE_PHOTO_DIR).filter((file) => file.endsWith(".webp"))) {
    const path = `${JUDGE_PHOTO_DIR}/${name}`;
    const { width, height, format } = await sharp(path).metadata();
    const look = name.startsWith("look-");
    assert.deepEqual([width, height, format], [look ? 1080 : JUDGE_PHOTO_SIZE.width, look ? 1350 : JUDGE_PHOTO_SIZE.height, "webp"], name);
    assert.ok(statSync(path).size < (look || name.startsWith("jda-004-") || JUDGE_LOOK_PRODUCTS.some((product) => name === productPhotoName(product.sku, "front") + ".webp") || name.startsWith("closet-") ? 120_000 : 250_000), `${name} is ${statSync(path).size} bytes`);
  }
  for (const product of products) {
    for (const [view, record] of Object.entries(product.views ?? {}) as Array<[string, { contentType: string; size: number; sha256?: string; fileName: string }]>) {
      const bytes = readFileSync(judgePhotoPath(productPhotoName(product.sku, view)));
      assert.equal(record.contentType, JUDGE_PHOTO_TYPE);
      assert.equal(record.size, bytes.length);
      assert.equal(record.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(record.fileName, `${product.sku}-${view}.webp`);
    }
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
  assert.equal(posts.length, 2 + JUDGE_LOOKS.length);
  for (const look of JUDGE_LOOKS) {
    const post = posts.find((item) => item.id === look.id);
    assert.ok(post);
    assert.ok(objects.has(String(post.imageKey)));
    const garments = post.publishedGarments as Parameters<typeof classifyLookStyles>[0]["garments"];
    assert.ok(classifyLookStyles({ garments }).some((style) => style === look.style), look.id);
    for (const garment of garments ?? []) {
      const subtypes: readonly string[] = GARMENT_TAXONOMY[garment.category as keyof typeof GARMENT_TAXONOMY] ?? [];
      assert.ok(subtypes.includes(garment.subtype ?? ""), garment.name);
      assert.ok(objects.has(String((garment as { imageKey?: string }).imageKey)), garment.name);
    }
    assert.deepEqual((garments ?? []).flatMap((piece) => piece.verifiedProduct ? [[piece.verifiedProduct.sku, piece.verifiedProduct.price]] : []),
      look.pieces.flatMap((piece: { sku?: string; price?: number }) => piece.sku ? [[piece.sku, piece.price]] : []), look.id);
  }
  for (const [id, photo] of [["judge-brand-post", "look-brand-founder.webp"], ["judge-consumer-post", "look-member-founder.webp"]]) {
    const post = posts.find((item) => item.id === id);
    assert.ok(post);
    assert.ok(String(post.imageKey).endsWith(photo));
    assert.ok(objects.has(String(post.imageKey)));
    const pieces = post.publishedGarments as Array<{ resolutionState: string; verifiedProduct?: { registryProductId: string; sku: string; price: number } }>;
    const jacket = pieces.find((piece) => piece.verifiedProduct?.sku === "JDA-004");
    assert.equal(jacket?.resolutionState, "EXACT_VERIFIED_PRODUCT");
    assert.equal(jacket?.verifiedProduct?.registryProductId, "judge-product-founder");
    assert.equal(jacket?.verifiedProduct?.price, 295);
    if (id === "judge-consumer-post") assert.equal(pieces.filter((piece) => piece.resolutionState === "GENERIC_UNVERIFIED" && !piece.verifiedProduct).length, 2);
  }
  assert.ok(!items.some((item) => item.PK === "PRODUCT#judge-product-founder" && String(item.SK).startsWith("WEAR#")));
  assert.deepEqual(posts.slice(0, 2).map((post) => post.sourceType).sort(), ["brand", "consumer"]);
  const consumerPost = posts.find((post) => post.sourceType === "consumer")!;
  const verifiedPieces = (consumerPost.publishedGarments as Array<Record<string, unknown>>).filter((garment) => garment.resolutionState === "EXACT_VERIFIED_PRODUCT");
  assert.equal(verifiedPieces.length, 1, "so Shop the Look has exactly one openable piece");
  assert.ok(!("ownerId" in (verifiedPieces[0] as object)), "a published piece carries no owner");

  const events = items.filter((item) => item.PK === "COMMUNITY" && String(item.SK).startsWith("EVENT#"));
  assert.deepEqual(events.map((event) => event.eventType).sort(), ["demo-purchase", "outbound-product-click", "product-click", "recreate-look-request"]);
  for (const event of events) assert.ok(!("ownerId" in event) && !("ownerPK" in event), "public activity is identity-free");
  assert.equal(items.filter((item) => String(item.SK).startsWith("INSPIRATION#")).length, 1);
  assert.equal(items.filter((item) => String(item.SK).startsWith("BRANDLOOK#")).length, 1 + JUDGE_LOOKS.filter((look) => look.brandLookId).length);
});

test("the seeded catalog behaves the way the live app will read it", () => {
  const live = products.filter((product) => !product.archived);
  assert.equal(products.length, 4 + JUDGE_LOOK_PRODUCTS.length);
  assert.equal(live.length, 3 + JUDGE_LOOK_PRODUCTS.length, "one product is retired on purpose");

  assert.equal(matchBrandProduct([], `${JUDGE_SEED_IDS.brand.name} JDA-001`, products)?.product.sku, "JDA-001", "the label a judge can type verifies");
  assert.equal(matchBrandProduct([], `${JUDGE_SEED_IDS.brand.name} JDA-003`, products), null, "the retired product answers nothing");

  const candidates = rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", brandText: "Judge Demo Atelier" }, products);
  assert.equal(candidates[0]?.sku, "JDA-001", "scanning a navy tee finds the enrolled product");
  for (const product of live) assert.equal(searchCatalog(product.sku, products)[0]?.sku, product.sku);
  assert.deepEqual(searchCatalog("JDA-003", products), [], "archived products stay out of search");
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

// ── The seed clock (D1) ────────────────────────────────────────────────────────

const DAY = 86_400_000;
const seedNow = Date.parse(SEED_NOW);
const releasedWears = of("WEAR#").filter((item) => item.PK === "PRODUCT#judge-product-released");
const releasedDates = releasedWears.map((wear) => String(wear.occurredAt));

test("accounts are 120 days old on the day the seed runs, and dates follow the clock rather than a fixed day", () => {
  assert.equal(ACCOUNT_AGE_DAYS, 120);
  assert.equal(summary.seedNow, SEED_NOW);
  for (const profile of profiles) assert.equal(profile.createdAt, new Date(seedNow - 120 * DAY).toISOString(), String(profile.email));
  const dated = items.filter((item) => item.PK === "COMMUNITY" || String(item.SK).startsWith("WEAR#") || String(item.SK).startsWith("BRANDLOOK#"));
  for (const item of dated) {
    const when = Date.parse(String(item.occurredAt ?? item.createdAt));
    assert.ok(when <= seedNow && when > seedNow - 91 * DAY, `${item.SK} is recent: wears, looks and public activity sit inside the last 13 weeks`);
  }
});

test("an unreadable RACKED_SEED_NOW stops the seed instead of writing dates from it", async () => {
  assert.throws(() => seedClock("next tuesday"), /RACKED_SEED_NOW must be an ISO date/);
  assert.equal(seedClock("2026-11-18T12:00:00Z"), Date.parse("2026-11-18T12:00:00Z"));
  await assert.rejects(buildJudgeSeed({ now: Number.NaN }), /valid time/);
});

test("no seeded wear happens before its owner's account existed", () => {
  const created = new Map(profiles.map((profile) => [profile.PK, Date.parse(String(profile.createdAt))]));
  for (const wear of of("WEAR#")) {
    const owner = created.get(String(wear.ownerPK));
    assert.ok(owner !== undefined && Date.parse(String(wear.occurredAt)) > owner, `${wear.SK} predates ${wear.ownerPK}`);
  }
});

test("every wear of the released product is on its own day, and most owners wear it", () => {
  // Owners who never wore it are part of a believable cohort (see the realism test below); those who
  // did each wore it on separate days, so a repeat wear is never two events on one date.
  const days = new Map<string, Set<string>>();
  const events = new Map<string, number>();
  for (const wear of releasedWears) {
    const owner = String(wear.ownerPK);
    if (!days.has(owner)) days.set(owner, new Set());
    days.get(owner)!.add(String(wear.occurredAt).slice(0, 10));
    events.set(owner, (events.get(owner) ?? 0) + 1);
  }
  assert.equal(days.size, 44, "44 of the 50 owners have worn it");
  for (const [owner, set] of days) assert.equal(set.size, events.get(owner), `${owner} has two wears on one day`);
});

test("the chart helper buckets weeks exactly as the brand dashboard does", () => {
  const app = buildWearUsageAnalytics([], releasedDates, new Date(seedNow)).weeklyTrend;
  assert.deepEqual(weeklyWearBuckets(releasedDates, new Date(seedNow)), app.map(({ weekStart, wears }) => ({ weekStart, wears })));
  assert.equal(JUDGE_CHART_RULE.minimumWearsPerWeek, MINIMUM_CELL_SIZE, "the verifier uses the dashboard's own cell minimum");
});

// Every date the seed writes is relative to its clock, so shifting all of them and "now" by k days is
// exactly what a run k days later writes: one build covers all seven weekdays.
test("seeded on any weekday, at least 6 of the last 8 weekly buckets hold 5+ wears and the newest wear is days old", () => {
  for (let shift = 0; shift < 7; shift++) {
    const now = new Date(seedNow + shift * DAY);
    const dates = releasedDates.map((date) => new Date(Date.parse(date) + shift * DAY).toISOString());
    const weeks = buildWearUsageAnalytics([], dates, now).weeklyTrend;
    const shown = weeks.filter((week) => week.wears >= MINIMUM_CELL_SIZE).length;
    assert.ok(shown >= 6, `seeded on ${now.toISOString().slice(0, 10)}: ${shown} of 8 weeks shown (${weeks.map((week) => week.wears).join(", ")})`);
    assert.deepEqual(judgeChartProblems(dates, now), []);
  }
  assert.deepEqual(summary.releasedChart.problems, []);
});

test("the chart still passes the verifier for the week after a seed, and fails once it goes stale", () => {
  for (let day = 0; day <= 6; day++) assert.deepEqual(judgeChartProblems(releasedDates, new Date(seedNow + day * DAY)), [], `day ${day} after seeding`);
  assert.match(judgeChartProblems(releasedDates, new Date(seedNow + 30 * DAY)).join(" "), /newest wear is \d+ days old/, "a month later the verifier asks for a re-seed");
  assert.match(judgeChartProblems([], new Date(seedNow)).join(" "), /0 of 8 weeks/);
});

test("a re-run deletes only the seeded, dated records it is about to rewrite, so nothing doubles", async () => {
  // Yesterday's run, plus records the seed must never touch: a real wear on a judge product, a real
  // public event, a real post, and a real outfit, none carrying testCohort, and the main cohort's own
  // seeded post, which is synthetic but not this seed's.
  const yesterday = (await buildJudgeSeed({ now: seedNow - 3 * DAY, existing: [] })).written.items.slice() as Array<Record<string, unknown>>;
  const foreign = [
    { PK: "PRODUCT#judge-product-released", SK: "WEAR#2026-11-10T00:00:00.000Z#USER#real-person#0", ownerPK: "USER#real-person", eventType: "confirmed-wear" },
    { PK: "COMMUNITY", SK: "EVENT#2026-11-10T00:00:00.000Z#judge-1", eventType: "product-click" },
    { PK: "COMMUNITY", SK: "POST#2026-11-10T00:00:00.000Z#judge-consumer-post", id: "judge-consumer-post" },
    { PK: "COMMUNITY", SK: "POST#2026-11-10T00:00:00.000Z#demo-consumer-post-01", id: "demo-consumer-post-01", testCohort: true },
    { PK: `USER#${JUDGE_SEED_IDS.consumer.id}`, SK: "OUTFIT#2026-11-10T00:00:00.000Z#judge-outfit-mine", id: "judge-outfit-mine" },
  ];
  const plan = planSeededDeletes([...yesterday, ...foreign]);
  const count = (family: string) => plan[family].length;
  const yesterdayOf = (test: (item: Record<string, unknown>) => boolean) => yesterday.filter(test).length;
  assert.equal(count("wearEvents"), yesterdayOf((item) => String(item.SK).startsWith("WEAR#")));
  assert.equal(count("communityEvents"), 4);
  assert.equal(count("communityPosts"), 2 + JUDGE_LOOKS.length);
  assert.equal(count("outfits"), 2);
  assert.equal(count("brandLooks"), 1 + JUDGE_LOOKS.filter((look) => look.brandLookId).length);
  const planned = new Set(Object.values(plan).flat().map((key) => `${key.PK}|${key.SK}`));
  for (const item of foreign) assert.ok(!planned.has(`${item.PK}|${item.SK}`), `never deletes ${item.SK}`);

  // Apply it: the table after today's run holds exactly one copy of everything, plus the foreign records.
  const today = await buildJudgeSeed({ now: seedNow, existing: [...yesterday, ...foreign] });
  assert.equal(today.summary.deletesBeforeWrite.countedFrom, "supplied");
  assert.equal(today.summary.deletesBeforeWrite.total, planned.size);
  const table = new Map<string, Record<string, unknown>>();
  for (const item of [...yesterday, ...foreign]) if (!planned.has(`${item.PK}|${item.SK}`)) table.set(`${item.PK}|${item.SK}`, item);
  const todayItems = today.written.items as Array<Record<string, unknown>>;
  for (const item of todayItems) table.set(`${item.PK}|${item.SK}`, item);
  const rows = [...table.values()].filter((item) => item.testCohort === true);
  const seededOf = (test: (item: Record<string, unknown>) => boolean) => rows.filter(test).length;
  assert.equal(seededOf((item) => item.PK === "COMMUNITY" && String(item.SK).startsWith("POST#") && String(item.id).startsWith("judge-")), 2 + JUDGE_LOOKS.length);
  assert.equal(seededOf((item) => String(item.SK).startsWith("OUTFIT#")), 2);
  assert.equal(seededOf((item) => String(item.SK).startsWith("BRANDLOOK#")), 1 + JUDGE_LOOKS.filter((look) => look.brandLookId).length);
  assert.equal(seededOf((item) => /^EVENT#.*#judge-\d+$/.test(String(item.SK))), 4);
  assert.equal(seededOf((item) => String(item.SK).startsWith("WEAR#")), todayItems.filter((item) => String(item.SK).startsWith("WEAR#")).length);
});

test("a plain dry run reads nothing, so it plans no deletions and needs no AWS", () => {
  assert.equal(summary.deletesBeforeWrite.countedFrom, "nothing read (dry run)");
  assert.equal(summary.deletesBeforeWrite.total, 0);
  const seed = read("scripts/seed-judge-accounts.mjs");
  assert.match(seed, /const db = dryRun && !countExisting \? null/, "no client exists in a dry run unless a read-only count was asked for");
  assert.match(seed, /ConditionExpression: "#tc = :yes"/, "every delete is conditional on testCohort");
});


test("the released product reads like a real one: not everyone wears it, and nothing is withheld", () => {
  // Every seeded owner used to wear the tee three or more times, so the dashboard said 100% active
  // and 100% repeat — a figure a judge reads as staged. The released view must look plausible and
  // still release every figure: each wear bucket is empty or holds at least the minimum cell size.
  const owners = items.filter((item) => item.GSI1PK === "PRODUCT#judge-product-released" && String(item.SK).startsWith("GARMENT#"));
  const counts = owners.map((item) => Number(item.wearCount));
  const dates = items.filter((item) => item.PK === "PRODUCT#judge-product-released" && String(item.SK).startsWith("WEAR#")).map((item) => String(item.occurredAt));
  assert.equal(owners.length, 50);
  assert.equal(counts.reduce((sum, value) => sum + value, 0), dates.length, "each wear count matches its events");
  const released = releaseWearAnalytics(counts, dates, new Date(SEED_NOW));
  assert.deepEqual(released.withheld, []);
  assert.equal(released.engagementRate, 88);
  assert.equal(released.repeatWearRate, 78);
  for (const bucket of released.wearDistribution) assert.ok(bucket.owners === 0 || (bucket.owners ?? 0) >= MINIMUM_CELL_SIZE, bucket.label);
  assert.ok(released.wearDistribution.every((bucket) => (bucket.owners ?? 0) > 0), "every bucket, including never worn, is represented");
});
