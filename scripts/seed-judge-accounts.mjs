import { JUDGE_LOOKS, JUDGE_LOOK_PRODUCTS } from "./lib/judge-community-looks.mjs";
// Seeds the clearly labeled DEMO accounts a judge signs into.
//
// Judge note: every record written here is synthetic. Accounts use reserved .local addresses,
// carry `dataClassification: "DEMO"` and `testCohort: true`, and are never presented as real
// customers. The password is supplied at runtime through RACKED_TEST_PASSWORD and is deliberately
// never written to this repository — see docs/judge-accounts.md.
//
// What it creates:
//   judge.consumer@racked.local     a lived-in wardrobe: 12 pieces, 2 saved outfits, one piece
//                                   verified against a brand product, one linked by the owner's own
//                                   pick, a published Community look, and a saved inspiration
//   judge.newconsumer@racked.local  an empty account, so the first-run experience can be shown
//                                   without disturbing the one above
//   judge.brand@racked.local        Judge Demo Atelier: one product with 50 opted-in owners, so a
//                                   judge sees what a live product looks like rather than one
//                                   scraping over the line; one deliberately below the k>=25
//                                   threshold, so suppression is visible beside it; one retired;
//                                   and a published Brand Look
//   judge.newbrand@racked.local     a brand with no products, so enrollment can be shown live
//
// Run (dry run first — it writes nothing and needs no AWS):
//   RACKED_SEED_DRY_RUN=yes node scripts/seed-judge-accounts.mjs
//
//   ALLOW_RACKED_TEST_SEED=yes RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... \
//   RACKED_TEST_PASSWORD=... node scripts/seed-judge-accounts.mjs
//
// Dates are counted back from the day it runs (RACKED_SEED_NOW, an ISO date, overrides it), so the
// released product's eight-week chart is full on the day of the demo. A fixed date left it empty.
// Accounts are 120 days old; wears, looks and public activity are recent.
//
// Re-running does not double anything. Records keyed by stable ids are overwritten in place. Records
// whose sort key carries a date (wear events, public activity, the published looks, saved outfits,
// the Brand Look) would get a new key every day, so the seeded copies are deleted first: only items
// carrying `testCohort: true`, only in the seeded families, each delete conditional on that flag.
// The dry run reads nothing, so it counts deletions against an empty table unless
// RACKED_SEED_COUNT_EXISTING=yes is set with RACKED_TABLE_NAME, which reads the table, read-only.

import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import { JUDGE_PHOTO_TYPE, judgePhoto, productPhotoName } from "./lib/judge-photos.mjs";
import { judgeChartProblems, weeklyWearBuckets } from "./lib/judge-wear-window.mjs";

const dryRun = process.env.RACKED_SEED_DRY_RUN === "yes" || process.argv.includes("--dry-run");
// A dry run that may read the table, never write it, to count what a real run would delete.
const countExisting = dryRun && process.env.RACKED_SEED_COUNT_EXISTING === "yes" && Boolean(process.env.RACKED_TABLE_NAME);
const table = process.env.RACKED_TABLE_NAME ?? (dryRun ? "dry-run-table" : undefined);
const bucket = process.env.RACKED_UPLOAD_BUCKET ?? (dryRun ? "dry-run-bucket" : undefined);
const password = process.env.RACKED_TEST_PASSWORD ?? (dryRun ? "dry-run-password-not-real" : undefined);
if (!dryRun) {
  if (process.env.ALLOW_RACKED_TEST_SEED !== "yes") throw new Error("Set ALLOW_RACKED_TEST_SEED=yes to confirm this clearly labeled synthetic write, or RACKED_SEED_DRY_RUN=yes to see what it would write.");
  if (!table || !bucket || !password) throw new Error("RACKED_TABLE_NAME, RACKED_UPLOAD_BUCKET, and RACKED_TEST_PASSWORD are required.");
  if (password.length < 16) throw new Error("Use a password of at least 16 characters.");
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const db = dryRun && !countExisting ? null : DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const s3 = dryRun ? null : new S3Client({ region });
const scrypt = promisify(scryptCallback);
const publicOrigin = (process.env.RACKED_PUBLIC_ORIGIN ?? "https://main.d2iv0khybuuaeh.amplifyapp.com").replace(/\/+$/, "");

const written = { items: [], objects: [] };
async function putItem(item) {
  written.items.push(item);
  if (!dryRun) await db.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}
async function putObject(key, body, ownerId, contentType = JUDGE_PHOTO_TYPE) {
  written.objects.push(key);
  if (!dryRun) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256", Metadata: { owner: ownerId, synthetic: "true", classification: "demo" } }));
  return key;
}

/** The seed's "now". The day it runs, unless RACKED_SEED_NOW pins it (tests, or a rehearsal). */
export function seedClock(configured = process.env.RACKED_SEED_NOW) {
  const now = Date.parse(configured ?? new Date().toISOString());
  if (Number.isNaN(now)) throw new Error("RACKED_SEED_NOW must be an ISO date, for example 2026-11-18T12:00:00Z.");
  return now;
}

/** Old enough to read as a lived-in account, and past any minimum account age a privacy rule sets. */
export const ACCOUNT_AGE_DAYS = 120;
let seedNow = seedClock();
let createdAt = new Date(seedNow - ACCOUNT_AGE_DAYS * 86_400_000).toISOString();
const at = (daysAgo, extraMinutes = 0) => new Date(seedNow - daysAgo * 86_400_000 + extraMinutes * 60_000).toISOString();

/**
 * Opted-in owners for the released product. A product one owner past k>=25 proves the threshold
 * and nothing else; fifty is a readable distribution, a real trend line, and a dashboard a judge
 * can reason about. The judge consumer owns it too, so the synthetic cohort supplies the rest.
 */
const RELEASED_OWNER_TARGET = 50;

/**
 * Wears per cohort owner of the released product, one a week from the most recent back. Every owner
 * wears it on at least three separate days, so each counts as established; the longer histories
 * reach back past eight weeks, so every week of the chart clears the five-wear cell minimum
 * whatever weekday the seed runs on. The longest, 12 weekly wears from 7 days back, ends 84 days
 * back, well inside the accounts' 120.
 */
export const RELEASED_WEAR_PATTERN = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const CONSUMER_ID = "judge-consumer-account";
const CONSUMER_EMAIL = "judge.consumer@racked.local";
const FRESH_CONSUMER_ID = "judge-fresh-consumer-account";
const FRESH_CONSUMER_EMAIL = "judge.newconsumer@racked.local";
const BRAND_ID = "judge-brand-account";
const BRAND_EMAIL = "judge.brand@racked.local";
const BRAND_NAME = "Judge Demo Atelier";
const BRAND_SLUG = "judge-demo-atelier";
const FRESH_BRAND_ID = "judge-fresh-brand-account";
const FRESH_BRAND_EMAIL = "judge.newbrand@racked.local";
const FRESH_BRAND_NAME = "Judge New Label";
const FRESH_BRAND_SLUG = "judge-new-label";

// A deliberately varied wardrobe. Categories, colours, styles, seasons, and wear counts all differ
// so the outfit ranker has real material: a near-identical wardrobe would make the ranking
// invisible to a judge.
const WARDROBE = [
  { key: "oxford", name: "Judge Blue Oxford", category: "top", subtype: "dress-shirt", color: "blue", style: ["classic", "smart", "tailored"], season: "all-season", wearCount: 6, lastWornDays: 4 },
  { key: "tee", name: "Judge White Tee", category: "top", subtype: "t-shirt", color: "white", style: ["casual", "relaxed"], season: "summer", wearCount: 14, lastWornDays: 1 },
  { key: "knit", name: "Judge Charcoal Knit", category: "top", subtype: "sweater", color: "charcoal", style: ["minimal", "classic"], season: "winter", wearCount: 1, lastWornDays: 70 },
  { key: "trouser", name: "Judge Wool Trouser", category: "bottom", subtype: "dress-pants", color: "navy", style: ["tailored", "structured"], season: "winter", wearCount: 3, lastWornDays: 21 },
  { key: "jean", name: "Judge Indigo Jean", category: "bottom", subtype: "jeans", color: "indigo", style: ["casual", "everyday"], season: "all-season", wearCount: 18, lastWornDays: 2 },
  { key: "short", name: "Judge Linen Short", category: "bottom", subtype: "shorts", color: "sand", style: ["casual", "relaxed"], season: "summer", wearCount: 0, lastWornDays: 999 },
  { key: "blazer", name: "Judge Tailored Blazer", category: "outerwear", subtype: "blazer", color: "navy", style: ["tailored", "refined", "classic"], season: "all-season", wearCount: 2, lastWornDays: 45 },
  { key: "shell", name: "Judge Rain Shell", category: "outerwear", subtype: "rain-jacket", color: "olive", style: ["utility", "technical"], season: "fall", wearCount: 1, lastWornDays: 90 },
  { key: "derby", name: "Judge Leather Derby", category: "shoe", subtype: "dress-shoes", color: "brown", style: ["classic", "tailored"], season: "all-season", wearCount: 4, lastWornDays: 30 },
  { key: "sneaker", name: "Judge White Sneaker", category: "shoe", subtype: "sneakers", color: "white", style: ["casual", "sporty"], season: "all-season", wearCount: 22, lastWornDays: 1 },
];

const OUTFITS = [
  { key: "workday", name: "Judge Workday Look", pieces: ["oxford", "trouser", "derby", "blazer"], wears: 3 },
  { key: "weekend", name: "Judge Weekend Look", pieces: ["tee", "jean", "sneaker", "verified"], wears: 5 },
];

// Three products demonstrate analytics and lifecycle (fourteen Look pieces below also clear the threshold, an even split). The Founder Jacket is for Community only. One clears the k>=25 release threshold so a judge sees released
// metrics immediately; one stays deliberately below it so they can see suppression working; one is
// retired, so they can see that a retired product keeps its owners and leaves the public page.
const FOUNDER = { key: "founder", id: "judge-product-founder", sku: "JDA-004", name: "Judge Founder Jacket", category: "outerwear", subtype: "jacket", color: "brown", pattern: "solid", material: "suede", style: ["casual", "utility"], price: 295 };
const PRODUCTS = [
  { key: "released", id: "judge-product-released", sku: "JDA-001", name: "Judge Signature Tee", category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", style: ["minimal", "everyday"], price: 48 },
  { key: "suppressed", id: "judge-product-suppressed", sku: "JDA-002", name: "Judge Limited Overshirt", category: "outerwear", subtype: "denim-jacket", color: "olive", pattern: "solid", material: "cotton", style: ["utility", "casual"], price: 128 },
  { key: "retired", id: "judge-product-retired", sku: "JDA-003", name: "Judge Archive Cap", category: "accessory", subtype: "hat", color: "black", pattern: "solid", material: "cotton", style: ["casual"], price: 32, archived: true },
  FOUNDER,
  ...JUDGE_LOOK_PRODUCTS,
];

/**
 * Look pieces that also carry a full opted-in cohort, so a judge has more than one product whose
 * wear intelligence opens. Each gets the same cohort and wear pattern as the released product.
 */
// With the Signature Tee these make 15 of the 30 demo products open, an even split with the 15 below it.
export const EXTRA_RELEASED_SKUS = ["JDA-005", "JDA-006", "JDA-007", "JDA-009", "JDA-010", "JDA-012", "JDA-013", "JDA-014", "JDA-015", "JDA-017", "JDA-020", "JDA-023", "JDA-024", "JDA-026"];
const EXTRA_RELEASED = EXTRA_RELEASED_SKUS.map((sku) => PRODUCTS.find((product) => product.sku === sku));

/**
 * Whether a seeded demo product has enough synthetic owners for wear data. Fixed by construction,
 * so the catalog can label demo pieces without reading any cohort. Retired and Community-only
 * pieces have no wear cohort to open.
 */
export function demoWearCohort(product) {
  return product.sku === "JDA-001" || EXTRA_RELEASED_SKUS.includes(product.sku) ? "open" : "too-few";
}

async function accountItem({ id, email, role, displayName, brandName = null, brandSlug = null, brandDataSharing = false }) {
  const salt = randomBytes(18).toString("base64url");
  const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString("base64url");
  return { id, email, role, displayName, brandName, brandSlug, passwordHash, passwordSalt: salt, createdAt, brandDataSharing, sessionVersion: 0, testCohort: true, dataClassification: "DEMO", PK: `USER#${id}`, SK: "PROFILE", GSI1PK: `EMAIL#${email}`, GSI1SK: "ACCOUNT" };
}

/** A brand name belongs to one account, so a seeded brand holds its name the same way a real one does. */
function brandNameClaim(brandSlug, accountId, brandName) {
  return { PK: `BRANDNAME#${brandSlug}`, SK: "CLAIM", GSI1PK: "BRAND_NAMES", GSI1SK: brandSlug, accountId, brandName, createdAt, testCohort: true, dataClassification: "DEMO" };
}

/** A judge photo's bytes. Read in a dry run too, so a missing photo fails before anything is written. */
function photoBytes(name) {
  return judgePhoto(name);
}

/**
 * The opted-in owners the released product needs. They come from the main demo cohort; any that
 * are missing are created here, so the judge brand shows released metrics even when only this seed
 * has been run. Without their profiles, every aggregate would sit suppressed and the threshold demo
 * would look like a bug.
 */
async function ensureCohortOwners() {
  const ids = Array.from({ length: RELEASED_OWNER_TARGET - 1 }, (_, index) => `demo-consumer-${String(index + 1).padStart(2, "0")}`);
  let existing = new Set();
  if (!dryRun) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100).map((id) => ({ PK: `USER#${id}`, SK: "PROFILE" }));
      const found = await db.send(new BatchGetCommand({ RequestItems: { [table]: { Keys: chunk, ProjectionExpression: "PK, brandDataSharing" } } }));
      for (const item of found.Responses?.[table] ?? []) if (item.brandDataSharing === true) existing.add(String(item.PK).replace("USER#", ""));
    }
  }
  const created = [];
  for (const id of ids) {
    if (existing.has(id)) continue;
    const suffix = id.slice(-2);
    await putItem(await accountItem({ id, email: `demo.consumer${suffix}@racked.local`, role: "consumer", displayName: `Synthetic Demo Consumer ${suffix}`, brandDataSharing: true }));
    created.push(id);
  }
  return { ids, created };
}

async function seedBrand() {
  await putItem(await accountItem({ id: BRAND_ID, email: BRAND_EMAIL, role: "brand", displayName: "Judge Brand Manager", brandName: BRAND_NAME, brandSlug: BRAND_SLUG }));
  await putItem(brandNameClaim(BRAND_SLUG, BRAND_ID, BRAND_NAME));
  await putItem(await accountItem({ id: FRESH_BRAND_ID, email: FRESH_BRAND_EMAIL, role: "brand", displayName: "Judge New Brand Manager", brandName: FRESH_BRAND_NAME, brandSlug: FRESH_BRAND_SLUG }));
  await putItem(brandNameClaim(FRESH_BRAND_SLUG, FRESH_BRAND_ID, FRESH_BRAND_NAME));

  const products = {};
  for (const product of PRODUCTS) {
    const views = {};
    for (const view of product.frontOnly ? ["front"] : ["front", "back", "label"]) {
      const bytes = photoBytes(productPhotoName(product.sku, view));
      const key = `brand/${BRAND_ID}/${product.sku}-${view}.webp`;
      await putObject(key, bytes, BRAND_ID);
      views[view] = { view, fileName: `${product.sku}-${view}.webp`, contentType: JUDGE_PHOTO_TYPE, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storageKey: key };
    }
    products[product.key] = await putItem({
      id: product.id, ownerSubject: BRAND_ID, name: product.name, brand: BRAND_NAME, brandSlug: BRAND_SLUG,
      aliases: [BRAND_NAME, "Judge Atelier"], sku: product.sku, gtin: null,
      category: product.category, subtype: product.subtype, color: product.color, pattern: product.pattern,
      material: product.material, style: product.style, labelText: `${BRAND_NAME} ${product.sku}`,
      views, enrolledAt: createdAt, source: "brand-enrolled", availability: product.archived ? "discontinued" : "available",
      price: product.price, currency: "USD",
      productUrl: `${publicOrigin}/demo-store/${BRAND_SLUG}/${product.sku}`,
      ...(product.archived ? { archived: true } : {}),
      demoWearCohort: demoWearCohort(product),
      testCohort: true, dataClassification: "DEMO",
      PK: `USER#${BRAND_ID}`, SK: `PRODUCT#${product.id}`, GSI1PK: "BRAND_PRODUCTS", GSI1SK: `${BRAND_SLUG}#${product.sku}`,
    });
  }
  return products;
}

async function seedExtraCommunityLooks(products) {
  for (const look of JUDGE_LOOKS) {
    const ownerId = look.member ? `judge-member-${look.member}` : BRAND_ID;
    const sourceType = look.member ? "consumer" : "brand";
    const createdAt = at(look.daysAgo);
    const caption = `Clearly labeled synthetic ${look.member ? "Community" : "Brand"} Look for competition testing.`;
    const imageKey = await putObject(`wardrobe/${ownerId}/${look.photo}.webp`, photoBytes(look.photo), ownerId);
    const publishedGarments = [];
    const productIds = [];
    for (const [index, piece] of look.pieces.entries()) {
      const { name, category, subtype, color, pattern, material, style } = piece;
      const product = piece.sku ? products[piece.key] : null;
      const publicGarmentId = `${look.id}-item-${index + 1}`;
      const thumbnail = product?.views.front.storageKey ?? await putObject(`wardrobe/${ownerId}/${piece.photo}.webp`, photoBytes(piece.photo), ownerId);
      if (product) productIds.push(product.id);
      publishedGarments.push({
        publicGarmentId, name, category, subtype, color, pattern, material, style, imageKey: thumbnail,
        resolutionState: product ? "EXACT_VERIFIED_PRODUCT" : "GENERIC_UNVERIFIED",
        ...(product ? { verifiedProduct: { registryProductId: product.id, sku: product.sku, name: product.name, brand: BRAND_NAME, brandSlug: BRAND_SLUG, commerceState: "EXACT_AVAILABLE", outboundUrl: `/api/products/${encodeURIComponent(product.id)}/outbound?sourcePostId=${encodeURIComponent(look.id)}`, price: product.price, currency: product.currency } } : {}),
      });
    }
    if (look.brandLookId) await putItem({
      id: look.brandLookId, ownerSubject: BRAND_ID, brand: BRAND_NAME, brandSlug: BRAND_SLUG,
      title: look.title, caption, productIds, createdAt, sourceType, published: true,
      testCohort: true, dataClassification: "DEMO", PK: `USER#${BRAND_ID}`, SK: `BRANDLOOK#${createdAt}#${look.brandLookId}`,
    });
    await putItem({
      id: look.id, ownerId, sourceType, ...(look.brandLookId ? { sourceBrandLookId: look.brandLookId } : {}),
      handle: look.member ? `@demo_${look.member}` : `@${BRAND_SLUG.replaceAll("-", "_")}`,
      outfitTitle: look.title, caption, image: "", imageKey, createdAt, likes: 0, publishedGarments, garments: [], products: [],
      fictional: true, testCohort: true, dataClassification: "DEMO", PK: "COMMUNITY", SK: `POST#${createdAt}#${look.id}`,
    });
  }
}

/** Links a product to one owner, with its wear events, exactly as a verified save would. */
async function linkVerified({ ownerId, product, garmentId, wearCount, lastWornDays, imageKey }) {
  await putItem({
    id: garmentId, name: product.name, category: product.category, subtype: product.subtype, color: product.color,
    pattern: product.pattern, material: product.material, style: product.style, season: "all-season",
    wearCount, lastWornDays: wearCount > 0 ? lastWornDays : 999,
    lastWornAt: wearCount > 0 ? at(lastWornDays) : null,
    source: "ai-confirmed", art: "photo", imageKey,
    brand: BRAND_NAME, sku: product.sku, registryProductId: product.id, identityStatus: "verified",
    listedPrice: product.price, listedCurrency: "USD",
    createdAt, testCohort: true, dataClassification: "DEMO",
    PK: `USER#${ownerId}`, SK: `GARMENT#${garmentId}`, GSI1PK: `PRODUCT#${product.id}`, GSI1SK: `OWNER#${ownerId}`,
  });
  for (let wear = 0; wear < wearCount; wear++) {
    const occurredAt = at(lastWornDays + wear * 7, -wear);
    await putItem({ PK: `PRODUCT#${product.id}`, SK: `WEAR#${occurredAt}#${ownerId}#${wear}`, occurredAt, ownerPK: `USER#${ownerId}`, garmentId, eventType: "confirmed-wear", testCohort: true, dataClassification: "DEMO" });
  }
}

async function seedConsumer(products) {
  await putItem(await accountItem({ id: CONSUMER_ID, email: CONSUMER_EMAIL, role: "consumer", displayName: "Competition Judge", brandDataSharing: true }));
  await putItem(await accountItem({ id: FRESH_CONSUMER_ID, email: FRESH_CONSUMER_EMAIL, role: "consumer", displayName: "New Judge Account", brandDataSharing: false }));

  const ids = {};
  const imageKeys = {};
  for (const piece of WARDROBE) {
    const garmentId = `judge-garment-${piece.key}`;
    ids[piece.key] = garmentId;
    const imageKey = await putObject(`wardrobe/${CONSUMER_ID}/${garmentId}.webp`, photoBytes(piece.key), CONSUMER_ID);
    imageKeys[piece.key] = imageKey;
    await putItem({
      id: garmentId, name: piece.name, category: piece.category, subtype: piece.subtype, color: piece.color,
      pattern: "solid", material: "unconfirmed", style: piece.style, season: piece.season,
      wearCount: piece.wearCount, lastWornDays: piece.lastWornDays,
      lastWornAt: piece.wearCount > 0 ? at(piece.lastWornDays) : null,
      source: "ai-confirmed", art: "photo", imageKey, brand: null, sku: null, identityStatus: "unverified",
      createdAt, testCohort: true, dataClassification: "DEMO",
      PK: `USER#${CONSUMER_ID}`, SK: `GARMENT#${garmentId}`,
    });
  }

  // One piece verified by label evidence, and one linked by the owner's own catalog pick. Side by
  // side they show the difference the whole boundary rests on: only the first is a brand link.
  const verifiedId = "judge-garment-verified-tee";
  ids.verified = verifiedId;
  imageKeys.verified = await putObject(`wardrobe/${CONSUMER_ID}/${verifiedId}.webp`, photoBytes(productPhotoName(products.released.sku, "front")), CONSUMER_ID);
  await linkVerified({ ownerId: CONSUMER_ID, product: PRODUCTS[0], garmentId: verifiedId, wearCount: 5, lastWornDays: 3, imageKey: imageKeys.verified });

  const founderId = "judge-garment-verified-founder";
  ids.founder = founderId;
  imageKeys.founder = await putObject(`wardrobe/${CONSUMER_ID}/${founderId}.webp`, photoBytes(productPhotoName(FOUNDER.sku, "front")), CONSUMER_ID);
  await linkVerified({ ownerId: CONSUMER_ID, product: FOUNDER, garmentId: founderId, wearCount: 0, imageKey: imageKeys.founder });

  const pickedId = "judge-garment-picked-overshirt";
  ids.picked = pickedId;
  imageKeys.picked = await putObject(`wardrobe/${CONSUMER_ID}/${pickedId}.webp`, photoBytes(productPhotoName(products.suppressed.sku, "front")), CONSUMER_ID);
  await putItem({
    id: pickedId, name: "Judge Olive Overshirt", category: "outerwear", subtype: "denim-jacket", color: "olive",
    pattern: "solid", material: "cotton", style: ["utility", "casual"], season: "fall", wearCount: 4, lastWornDays: 6,
    lastWornAt: at(6), source: "ai-confirmed", art: "photo", imageKey: imageKeys.picked,
    brand: BRAND_NAME, sku: PRODUCTS[1].sku, registryProductId: null, selectedProductId: PRODUCTS[1].id,
    identityStatus: "owner-selected", listedPrice: PRODUCTS[1].price, listedCurrency: "USD",
    createdAt, testCohort: true, dataClassification: "DEMO",
    PK: `USER#${CONSUMER_ID}`, SK: `GARMENT#${pickedId}`,
  });

  for (const outfit of OUTFITS) {
    const outfitId = `judge-outfit-${outfit.key}`;
    await putItem({
      id: outfitId, name: outfit.name, itemIds: outfit.pieces.map((key) => ids[key]), createdAt, wears: outfit.wears,
      testCohort: true, dataClassification: "DEMO",
      PK: `USER#${CONSUMER_ID}`, SK: `OUTFIT#${createdAt}#${outfitId}`,
    });
  }
  return { ids, imageKeys };
}

/** The judge consumer's own published look, so Community, the brand page, and public activity are not empty. */
async function seedCommunity({ imageKeys }, products) {
  const postId = "judge-consumer-post";
  const postCreated = at(5);
  const pieces = [
    { ...FOUNDER, verified: FOUNDER },
    { key: "jean", name: "Judge Indigo Jean", category: "bottom", subtype: "jeans", color: "indigo" },
    { key: "sneaker", name: "Judge White Sneaker", category: "shoe", subtype: "sneakers", color: "white" },
  ];
  const publishedGarments = pieces.map((piece, index) => ({
    publicGarmentId: `${postId}-item-${index + 1}`,
    name: piece.name, category: piece.category, subtype: piece.subtype, color: piece.color,
    pattern: "solid", material: piece.verified?.material ?? "cotton", style: piece.verified?.style ?? ["everyday"], imageKey: imageKeys[piece.key],
    resolutionState: piece.verified ? "EXACT_VERIFIED_PRODUCT" : "GENERIC_UNVERIFIED",
    ...(piece.verified ? { verifiedProduct: { registryProductId: piece.verified.id, sku: piece.verified.sku, name: piece.verified.name, brand: BRAND_NAME, brandSlug: BRAND_SLUG, commerceState: "EXACT_AVAILABLE", outboundUrl: `/api/products/${encodeURIComponent(piece.verified.id)}/outbound?sourcePostId=${encodeURIComponent(postId)}`, price: piece.verified.price, currency: "USD" } } : {}),
  }));
  await putItem({
    id: postId, ownerId: CONSUMER_ID, sourceOutfitId: "judge-outfit-weekend", sourceType: "consumer",
    handle: "@judge_demo", outfitTitle: "Judge Weekend Look", caption: "Clearly labeled synthetic Community Look for competition testing.",
    image: "", imageKey: await putObject(`wardrobe/${CONSUMER_ID}/look-member-founder.webp`, photoBytes("look-member-founder"), CONSUMER_ID), createdAt: postCreated, likes: 9, publishedGarments, garments: [], products: [],
    fictional: true, testCohort: true, dataClassification: "DEMO",
    PK: "COMMUNITY", SK: `POST#${postCreated}#${postId}`,
  });

  // Identity-free public activity, so the brand's Community Intelligence readout has something real
  // to show and is visibly separate from private wear.
  const events = [
    { eventType: "recreate-look-request", daysAgo: 4 },
    { eventType: "product-click", daysAgo: 3 },
    { eventType: "outbound-product-click", daysAgo: 2 },
    { eventType: "demo-purchase", daysAgo: 1 },
  ];
  for (const [index, event] of events.entries()) {
    const eventAt = at(event.daysAgo, index);
    await putItem({ PK: "COMMUNITY", SK: `EVENT#${eventAt}#judge-${index + 1}`, productId: products.released.id, postId, eventType: event.eventType, createdAt: eventAt, testCohort: true, dataClassification: "DEMO" });
  }

  // A saved inspiration, so Hanger's private style signal is not empty for the judge account.
  await putItem({
    postId, outfitTitle: "Judge Weekend Look", styleHints: ["everyday"], colors: ["brown", "indigo", "white"],
    categories: ["outerwear", "bottom", "shoe"], subtypes: ["jacket", "jeans", "sneakers"], createdAt: at(2),
    testCohort: true, dataClassification: "DEMO",
    PK: `USER#${CONSUMER_ID}`, SK: `INSPIRATION#${postId}`,
  });

  // A published Brand Look, so the brand's public page carries both provenances.
  const lookId = "judge-brand-look";
  const lookCreated = at(7);
  await putItem({
    id: lookId, ownerSubject: BRAND_ID, brand: BRAND_NAME, brandSlug: BRAND_SLUG,
    title: "Judge Demo Atelier Look 1", caption: "Clearly labeled synthetic Brand Look for competition testing.",
    productIds: [products.founder.id], createdAt: lookCreated, sourceType: "brand", published: true,
    testCohort: true, dataClassification: "DEMO",
    PK: `USER#${BRAND_ID}`, SK: `BRANDLOOK#${lookCreated}#${lookId}`,
  });
  const brandPostId = "judge-brand-post";
  await putItem({
    id: brandPostId, ownerId: BRAND_ID, sourceBrandLookId: lookId, sourceType: "brand",
    handle: `@${BRAND_SLUG.replaceAll("-", "_")}`, outfitTitle: "Judge Demo Atelier Look 1",
    caption: "Clearly labeled synthetic Brand Look for competition testing.", image: "", imageKey: await putObject(`wardrobe/${BRAND_ID}/look-brand-founder.webp`, photoBytes("look-brand-founder"), BRAND_ID), createdAt: lookCreated, likes: 4,
    publishedGarments: [products.founder].map((product, index) => ({
      publicGarmentId: `${brandPostId}-item-${index + 1}`,
      name: product.name, category: product.category, subtype: product.subtype, color: product.color,
      pattern: product.pattern, material: product.material, style: product.style, imageKey: product.views.front.storageKey,
      resolutionState: "EXACT_VERIFIED_PRODUCT",
      verifiedProduct: { registryProductId: product.id, sku: product.sku, name: product.name, brand: BRAND_NAME, brandSlug: BRAND_SLUG, commerceState: "EXACT_AVAILABLE", outboundUrl: `/api/products/${encodeURIComponent(product.id)}/outbound?sourcePostId=${encodeURIComponent(brandPostId)}`, price: product.price, currency: product.currency },
    })),
    garments: [], products: [], fictional: true, testCohort: true, dataClassification: "DEMO",
    PK: "COMMUNITY", SK: `POST#${lookCreated}#${brandPostId}`,
  });
  return { consumerPostId: postId, brandPostId, lookId, events: events.length };
}

/** The cohort that puts the released product over the threshold, and the four owners that keep the other one under it. */
async function seedCohortLinks(products, ownerIds) {
  let wearEvents = 0;
  for (const [index, ownerId] of ownerIds.entries()) {
    const wearCount = RELEASED_WEAR_PATTERN[index % RELEASED_WEAR_PATTERN.length];
    await linkVerified({ ownerId, product: PRODUCTS[0], garmentId: `judge-linked-${PRODUCTS[0].sku}-${index + 1}`, wearCount, lastWornDays: (index % 7) + 1, imageKey: `wardrobe/${ownerId}/judge-linked-${PRODUCTS[0].sku}.png` });
    wearEvents += wearCount;
  }
  for (const product of EXTRA_RELEASED) {
    for (const [index, ownerId] of ownerIds.entries()) {
      // Offset so each product's owners differ in how much they wear it.
      const wearCount = RELEASED_WEAR_PATTERN[(index + product.sku.length + Number(product.sku.slice(-1))) % RELEASED_WEAR_PATTERN.length];
      await linkVerified({ ownerId, product, garmentId: `judge-linked-${product.sku}-${index + 1}`, wearCount, lastWornDays: ((index + 3) % 7) + 1, imageKey: `wardrobe/${ownerId}/judge-linked-${product.sku}.png` });
      wearEvents += wearCount;
    }
  }
  const suppressedOwners = ownerIds.slice(0, 4);
  for (const [index, ownerId] of suppressedOwners.entries()) {
    await linkVerified({ ownerId, product: PRODUCTS[1], garmentId: `judge-linked-${PRODUCTS[1].sku}-${index + 1}`, wearCount: index + 1, lastWornDays: index + 3, imageKey: `wardrobe/${ownerId}/judge-linked-${PRODUCTS[1].sku}.png` });
    wearEvents += index + 1;
  }
  return { wearEvents, suppressedOwners: suppressedOwners.length };
}

/**
 * The seeded families whose sort key carries a date. Re-seeding on another day writes new keys, so
 * the old seeded copies are found and deleted first. `owned` narrows each family to this seed's own
 * records; the planner also requires `testCohort: true`, so nothing a real person wrote is touched.
 */
const DATED_FAMILIES = [
  ...PRODUCTS.map((product) => ({ label: "wearEvents", PK: `PRODUCT#${product.id}`, prefix: "WEAR#", owned: () => true })),
  { label: "communityEvents", PK: "COMMUNITY", prefix: "EVENT#", owned: (item) => /#judge-\d+$/.test(String(item.SK)) },
  { label: "communityPosts", PK: "COMMUNITY", prefix: "POST#", owned: (item) => item.id === "judge-consumer-post" || item.id === "judge-brand-post" || JUDGE_LOOKS.some((look) => look.id === item.id) },
  { label: "outfits", PK: `USER#${CONSUMER_ID}`, prefix: "OUTFIT#", owned: (item) => String(item.id ?? "").startsWith("judge-outfit-") },
  { label: "brandLooks", PK: `USER#${BRAND_ID}`, prefix: "BRANDLOOK#", owned: (item) => item.id === "judge-brand-look" || JUDGE_LOOKS.some((look) => look.brandLookId && look.brandLookId === item.id) },
];

/**
 * Which existing items a run deletes before it writes, by family. Pure, so it is tested without a table.
 * @param {Array<Record<string, unknown>>} existing
 * @returns {Record<string, Array<{ PK: unknown, SK: unknown }>>}
 */
export function planSeededDeletes(existing) {
  /** @type {Record<string, Array<{ PK: unknown, SK: unknown }>>} */
  const plan = Object.fromEntries(DATED_FAMILIES.map((family) => [family.label, []]));
  for (const family of DATED_FAMILIES) {
    for (const item of existing) {
      if (item.PK === family.PK && String(item.SK).startsWith(family.prefix) && item.testCohort === true && family.owned(item)) plan[family.label].push({ PK: item.PK, SK: item.SK });
    }
  }
  return plan;
}

/** The current seeded items in each dated family, read with a projection. Read-only. */
async function readDatedFamilies() {
  const found = [];
  for (const family of DATED_FAMILIES) {
    let startKey;
    do {
      const page = await db.send(new QueryCommand({
        TableName: table, KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ProjectionExpression: "#pk, #sk, #id, #tc", ExpressionAttributeNames: { "#pk": "PK", "#sk": "SK", "#id": "id", "#tc": "testCohort" },
        ExpressionAttributeValues: { ":pk": family.PK, ":prefix": family.prefix }, ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }));
      found.push(...(page.Items ?? []));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
  }
  return found;
}

/** Deletes the planned items, each only if it still carries `testCohort: true`. */
async function deletePlanned(plan) {
  let deleted = 0, skipped = 0;
  for (const keys of Object.values(plan)) {
    for (const key of keys) {
      try {
        await db.send(new DeleteCommand({ TableName: table, Key: key, ConditionExpression: "#tc = :yes", ExpressionAttributeNames: { "#tc": "testCohort" }, ExpressionAttributeValues: { ":yes": true } }));
        deleted++;
      } catch (error) {
        if (error?.name !== "ConditionalCheckFailedException") throw error;
        skipped++;
      }
    }
  }
  return { deleted, skipped };
}

/** Wear events actually written against one product, counted rather than restated. */
function wearEventsFor(productId) {
  return written.items.filter((item) => item.PK === `PRODUCT#${productId}` && String(item.SK).startsWith("WEAR#")).length;
}

export const JUDGE_SEED_IDS = {
  consumer: { id: CONSUMER_ID, email: CONSUMER_EMAIL },
    freshConsumer: { id: FRESH_CONSUMER_ID, email: FRESH_CONSUMER_EMAIL },
  brand: { id: BRAND_ID, email: BRAND_EMAIL, name: BRAND_NAME, slug: BRAND_SLUG },
    freshBrand: { id: FRESH_BRAND_ID, email: FRESH_BRAND_EMAIL, name: FRESH_BRAND_NAME, slug: FRESH_BRAND_SLUG },
  products: PRODUCTS,
};

/**
 * Runs the seed and returns everything it wrote, so a dry run can be checked before a real one.
 * `now` pins the clock; `existing` stands in for the table when a test plans deletions.
 * @param {{ now?: number, existing?: Array<Record<string, unknown>> }} [options]
 */
export async function buildJudgeSeed({ now = seedClock(), existing } = {}) {
  if (!Number.isFinite(now)) throw new Error("The seed clock must be a valid time.");
  seedNow = now;
  createdAt = at(ACCOUNT_AGE_DAYS);
  written.items = [];
  written.objects = [];
  const deleteSource = existing ? "supplied" : db ? "table read" : "nothing read (dry run)";
  const plan = planSeededDeletes(existing ?? (db ? await readDatedFamilies() : []));
  const deletion = !dryRun && !existing ? await deletePlanned(plan) : { deleted: 0, skipped: 0 };
  const owners = await ensureCohortOwners();
  const products = await seedBrand();
  const consumer = await seedConsumer(products);
  const community = await seedCommunity(consumer, products);
  await seedExtraCommunityLooks(products);
  const cohort = await seedCohortLinks(products, owners.ids);
  const optedInOwnersForReleased = owners.ids.length + 1; // the cohort, plus the judge consumer
  const plannedDeletes = Object.fromEntries(Object.entries(plan).map(([label, keys]) => [label, keys.length]));
  const releasedWears = written.items.filter((item) => item.PK === `PRODUCT#${PRODUCTS[0].id}` && String(item.SK).startsWith("WEAR#")).map((item) => item.occurredAt);
  return { written, plan, products, summary: {
    mode: dryRun ? "dry run — nothing was written" : "written",
    seedNow: new Date(seedNow).toISOString(),
    accountsCreatedAt: createdAt,
    // What a real run deletes before it writes. A plain dry run reads nothing, so it counts zero.
    deletesBeforeWrite: { countedFrom: deleteSource, ...plannedDeletes, total: Object.values(plannedDeletes).reduce((sum, count) => sum + count, 0), ...(dryRun ? {} : deletion) },
    releasedChart: { weeks: weeklyWearBuckets(releasedWears, new Date(seedNow)), problems: judgeChartProblems(releasedWears, new Date(seedNow)) },
    judgeConsumer: { email: CONSUMER_EMAIL, wardrobePieces: WARDROBE.length + 3, savedOutfits: OUTFITS.length, verifiedPiece: PRODUCTS[0].sku, ownerPickedPiece: PRODUCTS[1].sku, publishedLook: community.consumerPostId, savedInspiration: 1, brandDataSharing: true },
  freshConsumer: { email: FRESH_CONSUMER_EMAIL, wardrobePieces: 0, purpose: "first-run experience" },
    judgeBrand: { email: BRAND_EMAIL, brand: BRAND_NAME, publicPage: `/brands/${BRAND_SLUG}`, releasedProduct: PRODUCTS[0].sku, suppressedProduct: PRODUCTS[1].sku, retiredProduct: PRODUCTS[2].sku, communityProduct: FOUNDER.sku, brandLook: community.lookId, publicActivityEvents: community.events },
  freshBrand: { email: FRESH_BRAND_EMAIL, brand: FRESH_BRAND_NAME, products: 0, purpose: "live enrollment from one photo" },
    // Per-product wear counts, because a single cohort total — which spans both products and omits
    // the judge's own wears — was once quoted as the released product's figure. It was not.
    cohort: { optedInOwnersForReleased, suppressedProductOwners: cohort.suppressedOwners, createdMissingOwners: owners.created.length, cohortWearEvents: cohort.wearEvents, releasedWearEvents: wearEventsFor(PRODUCTS[0].id), extraReleasedProducts: Object.fromEntries(EXTRA_RELEASED.map((product) => [product.sku, { owners: owners.ids.length, wearEvents: wearEventsFor(product.id) }])), suppressedWearEvents: wearEventsFor(PRODUCTS[1].id), thresholdIs: 25 },
    totals: { items: written.items.length, objects: written.objects.length },
    passwordSource: "RACKED_TEST_PASSWORD (runtime only, never committed)",
    clearlyLabeledSyntheticData: true,
  } };
}

// Running the file seeds; importing it does not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { summary } = await buildJudgeSeed();
  console.log(JSON.stringify(summary, null, 2));
}
