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
//   judge.brand@racked.local        Judge Demo Atelier: one product above the k>=25 release
//                                   threshold, one deliberately below it, one retired, and a
//                                   published Brand Look
//   judge.newbrand@racked.local     a brand with no products, so enrollment can be shown live
//
// Run (dry run first — it writes nothing and needs no AWS):
//   RACKED_SEED_DRY_RUN=yes node scripts/seed-judge-accounts.mjs
//
//   ALLOW_RACKED_TEST_SEED=yes RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... \
//   RACKED_TEST_PASSWORD=... node scripts/seed-judge-accounts.mjs
//
// Idempotent: stable ids mean re-running refreshes the same records rather than creating duplicates.

import { createHash, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { BatchGetCommand, DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const dryRun = process.env.RACKED_SEED_DRY_RUN === "yes" || process.argv.includes("--dry-run");
const table = process.env.RACKED_TABLE_NAME ?? (dryRun ? "dry-run-table" : undefined);
const bucket = process.env.RACKED_UPLOAD_BUCKET ?? (dryRun ? "dry-run-bucket" : undefined);
const password = process.env.RACKED_TEST_PASSWORD ?? (dryRun ? "dry-run-password-not-real" : undefined);
if (!dryRun) {
  if (process.env.ALLOW_RACKED_TEST_SEED !== "yes") throw new Error("Set ALLOW_RACKED_TEST_SEED=yes to confirm this clearly labeled synthetic write, or RACKED_SEED_DRY_RUN=yes to see what it would write.");
  if (!table || !bucket || !password) throw new Error("RACKED_TABLE_NAME, RACKED_UPLOAD_BUCKET, and RACKED_TEST_PASSWORD are required.");
  if (password.length < 16) throw new Error("Use a password of at least 16 characters.");
}

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const db = dryRun ? null : DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const s3 = dryRun ? null : new S3Client({ region });
const scrypt = promisify(scryptCallback);
const publicOrigin = (process.env.RACKED_PUBLIC_ORIGIN ?? "https://main.d2iv0khybuuaeh.amplifyapp.com").replace(/\/+$/, "");

const written = { items: [], objects: [] };
async function putItem(item) {
  written.items.push(item);
  if (!dryRun) await db.send(new PutCommand({ TableName: table, Item: item }));
  return item;
}
async function putObject(key, body, ownerId) {
  written.objects.push(key);
  if (!dryRun) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "image/png", ServerSideEncryption: "AES256", Metadata: { owner: ownerId, synthetic: "true", classification: "demo" } }));
  return key;
}

const createdAt = "2026-09-01T12:00:00.000Z";
const at = (daysAgo, extraMinutes = 0) => new Date(Date.parse(createdAt) - daysAgo * 86_400_000 + extraMinutes * 60_000).toISOString();

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

// Three products on purpose. One clears the k>=25 release threshold so a judge sees released
// metrics immediately; one stays deliberately below it so they can see suppression working; one is
// retired, so they can see that a retired product keeps its owners and leaves the public page.
const PRODUCTS = [
  { key: "released", id: "judge-product-released", sku: "JDA-001", name: "Judge Signature Tee", category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", style: ["minimal", "everyday"], price: 48 },
  { key: "suppressed", id: "judge-product-suppressed", sku: "JDA-002", name: "Judge Limited Overshirt", category: "outerwear", subtype: "denim-jacket", color: "olive", pattern: "solid", material: "cotton", style: ["utility", "casual"], price: 128 },
  { key: "retired", id: "judge-product-retired", sku: "JDA-003", name: "Judge Archive Cap", category: "accessory", subtype: "hat", color: "black", pattern: "solid", material: "cotton", style: ["casual"], price: 32, archived: true },
];

async function accountItem({ id, email, role, displayName, brandName = null, brandSlug = null, brandDataSharing = false }) {
  const salt = randomBytes(18).toString("base64url");
  const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString("base64url");
  return { id, email, role, displayName, brandName, brandSlug, passwordHash, passwordSalt: salt, createdAt, brandDataSharing, sessionVersion: 0, testCohort: true, dataClassification: "DEMO", PK: `USER#${id}`, SK: "PROFILE", GSI1PK: `EMAIL#${email}`, GSI1SK: "ACCOUNT" };
}

/** A brand name belongs to one account, so a seeded brand holds its name the same way a real one does. */
function brandNameClaim(brandSlug, accountId, brandName) {
  return { PK: `BRANDNAME#${brandSlug}`, SK: "CLAIM", GSI1PK: "BRAND_NAMES", GSI1SK: brandSlug, accountId, brandName, createdAt, testCohort: true, dataClassification: "DEMO" };
}

async function garmentImage({ name, color, category }) {
  if (dryRun) return Buffer.from("dry-run-image");
  const svg = `<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3efe5"/><path d="M230 230 350 160h200l120 70 115 210-105 58-75-110v520H295V388l-75 110-105-58z" fill="#394a63"/><text x="450" y="430" text-anchor="middle" font-family="Arial" font-weight="800" font-size="40" fill="#d5f66d">${name}</text><text x="450" y="510" text-anchor="middle" font-family="Arial" font-size="34" fill="#d5f66d">${color} ${category}</text><text x="450" y="760" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26" fill="#e94f30">SYNTHETIC DEMO · JUDGE ACCOUNT</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function productImage(product, view) {
  if (dryRun) return Buffer.from("dry-run-image");
  const shape = view === "label"
    ? `<rect x="130" y="180" width="640" height="740" rx="28" fill="#fffdf8" stroke="#171914" stroke-width="8"/>`
    : `<path d="M230 230 350 160h200l120 70 115 210-105 58-75-110v520H295V388l-75 110-105-58z" fill="#2f3a4d"/>`;
  const ink = view === "label" ? "#171914" : "#d5f66d";
  const svg = `<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3efe5"/>${shape}<text x="450" y="430" text-anchor="middle" font-family="Arial" font-weight="800" font-size="42" fill="${ink}">${BRAND_NAME}</text><text x="450" y="520" text-anchor="middle" font-family="Arial" font-size="38" fill="${ink}">${product.name}</text><text x="450" y="605" text-anchor="middle" font-family="Arial" font-size="34" fill="${ink}">${product.sku}</text><text x="450" y="760" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26" fill="#e94f30">SYNTHETIC DEMO · ${view.toUpperCase()}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The 25 opted-in owners the released product needs. They come from the main demo cohort; any that
 * are missing are created here, so the judge brand shows released metrics even when only this seed
 * has been run. Without their profiles, every aggregate would sit suppressed and the threshold demo
 * would look like a bug.
 */
async function ensureCohortOwners() {
  const ids = Array.from({ length: 25 }, (_, index) => `demo-consumer-${String(index + 1).padStart(2, "0")}`);
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
    for (const view of ["front", "back", "label"]) {
      const bytes = await productImage(product, view);
      const key = `brand/${BRAND_ID}/${product.sku}-${view}.png`;
      await putObject(key, bytes, BRAND_ID);
      views[view] = { view, fileName: `${product.sku}-${view}.png`, contentType: "image/png", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), storageKey: key };
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
      testCohort: true, dataClassification: "DEMO",
      PK: `USER#${BRAND_ID}`, SK: `PRODUCT#${product.id}`, GSI1PK: "BRAND_PRODUCTS", GSI1SK: `${BRAND_SLUG}#${product.sku}`,
    });
  }
  return products;
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
    const imageKey = await putObject(`wardrobe/${CONSUMER_ID}/${garmentId}.png`, await garmentImage(piece), CONSUMER_ID);
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
  imageKeys.verified = await putObject(`wardrobe/${CONSUMER_ID}/${verifiedId}.png`, await garmentImage({ name: products.released.name, color: "navy", category: "top" }), CONSUMER_ID);
  await linkVerified({ ownerId: CONSUMER_ID, product: PRODUCTS[0], garmentId: verifiedId, wearCount: 5, lastWornDays: 3, imageKey: imageKeys.verified });

  const pickedId = "judge-garment-picked-overshirt";
  ids.picked = pickedId;
  imageKeys.picked = await putObject(`wardrobe/${CONSUMER_ID}/${pickedId}.png`, await garmentImage({ name: products.suppressed.name, color: "olive", category: "outerwear" }), CONSUMER_ID);
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
async function seedCommunity({ ids, imageKeys }, products) {
  const postId = "judge-consumer-post";
  const postCreated = at(5);
  const pieces = [
    { key: "verified", name: products.released.name, category: "top", subtype: "t-shirt", color: "navy", verified: PRODUCTS[0] },
    { key: "jean", name: "Judge Indigo Jean", category: "bottom", subtype: "jeans", color: "indigo" },
    { key: "sneaker", name: "Judge White Sneaker", category: "shoe", subtype: "sneakers", color: "white" },
  ];
  const publishedGarments = pieces.map((piece, index) => ({
    publicGarmentId: `${postId}-item-${index + 1}`,
    name: piece.name, category: piece.category, subtype: piece.subtype, color: piece.color,
    pattern: "solid", material: "cotton", style: ["everyday"], imageKey: imageKeys[piece.key],
    resolutionState: piece.verified ? "EXACT_VERIFIED_PRODUCT" : "GENERIC_UNVERIFIED",
    ...(piece.verified ? { verifiedProduct: { registryProductId: piece.verified.id, sku: piece.verified.sku, name: piece.verified.name, brand: BRAND_NAME, brandSlug: BRAND_SLUG, commerceState: "EXACT_AVAILABLE", outboundUrl: `/api/products/${encodeURIComponent(piece.verified.id)}/outbound?sourcePostId=${encodeURIComponent(postId)}`, price: piece.verified.price, currency: "USD" } } : {}),
  }));
  await putItem({
    id: postId, ownerId: CONSUMER_ID, sourceOutfitId: "judge-outfit-weekend", sourceType: "consumer",
    handle: "@judge_demo", outfitTitle: "Judge Weekend Look", caption: "Clearly labeled synthetic Community Look for competition testing.",
    image: "", createdAt: postCreated, likes: 9, publishedGarments, garments: [], products: [],
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
    postId, outfitTitle: "Judge Weekend Look", styleHints: ["everyday"], colors: ["navy", "indigo", "white"],
    categories: ["top", "bottom", "shoe"], subtypes: ["t-shirt", "jeans", "sneakers"], createdAt: at(2),
    testCohort: true, dataClassification: "DEMO",
    PK: `USER#${CONSUMER_ID}`, SK: `INSPIRATION#${postId}`,
  });

  // A published Brand Look, so the brand's public page carries both provenances.
  const lookId = "judge-brand-look";
  const lookCreated = at(7);
  await putItem({
    id: lookId, ownerSubject: BRAND_ID, brand: BRAND_NAME, brandSlug: BRAND_SLUG,
    title: "Judge Demo Atelier Look 1", caption: "Clearly labeled synthetic Brand Look for competition testing.",
    productIds: [products.released.id, products.suppressed.id], createdAt: lookCreated, sourceType: "brand", published: true,
    testCohort: true, dataClassification: "DEMO",
    PK: `USER#${BRAND_ID}`, SK: `BRANDLOOK#${lookCreated}#${lookId}`,
  });
  const brandPostId = "judge-brand-post";
  await putItem({
    id: brandPostId, ownerId: BRAND_ID, sourceBrandLookId: lookId, sourceType: "brand",
    handle: `@${BRAND_SLUG.replaceAll("-", "_")}`, outfitTitle: "Judge Demo Atelier Look 1",
    caption: "Clearly labeled synthetic Brand Look for competition testing.", image: "", createdAt: lookCreated, likes: 4,
    publishedGarments: [products.released, products.suppressed].map((product, index) => ({
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
  const wearPattern = [0, 1, 2, 2, 3, 3, 4, 5, 6, 8];
  let wearEvents = 0;
  for (const [index, ownerId] of ownerIds.entries()) {
    const wearCount = wearPattern[index % wearPattern.length];
    await linkVerified({ ownerId, product: PRODUCTS[0], garmentId: `judge-linked-${PRODUCTS[0].sku}-${index + 1}`, wearCount, lastWornDays: (index % 7) + 1, imageKey: `wardrobe/${ownerId}/judge-linked-${PRODUCTS[0].sku}.png` });
    wearEvents += wearCount;
  }
  for (const [index, ownerId] of ownerIds.slice(0, 4).entries()) {
    await linkVerified({ ownerId, product: PRODUCTS[1], garmentId: `judge-linked-${PRODUCTS[1].sku}-${index + 1}`, wearCount: index + 1, lastWornDays: index + 3, imageKey: `wardrobe/${ownerId}/judge-linked-${PRODUCTS[1].sku}.png` });
    wearEvents += index + 1;
  }
  return { wearEvents };
}

export const JUDGE_SEED_IDS = {
  consumer: { id: CONSUMER_ID, email: CONSUMER_EMAIL },
    freshConsumer: { id: FRESH_CONSUMER_ID, email: FRESH_CONSUMER_EMAIL },
  brand: { id: BRAND_ID, email: BRAND_EMAIL, name: BRAND_NAME, slug: BRAND_SLUG },
    freshBrand: { id: FRESH_BRAND_ID, email: FRESH_BRAND_EMAIL, name: FRESH_BRAND_NAME, slug: FRESH_BRAND_SLUG },
  products: PRODUCTS,
};

/** Runs the seed and returns everything it wrote, so a dry run can be checked before a real one. */
export async function buildJudgeSeed() {
  written.items = [];
  written.objects = [];
  const owners = await ensureCohortOwners();
  const products = await seedBrand();
  const consumer = await seedConsumer(products);
  const community = await seedCommunity(consumer, products);
  const cohort = await seedCohortLinks(products, owners.ids);
  const optedInOwnersForReleased = owners.ids.length + 1; // the cohort, plus the judge consumer
  return { written, products, summary: {
    mode: dryRun ? "dry run — nothing was written" : "written",
    judgeConsumer: { email: CONSUMER_EMAIL, wardrobePieces: WARDROBE.length + 2, savedOutfits: OUTFITS.length, verifiedPiece: PRODUCTS[0].sku, ownerPickedPiece: PRODUCTS[1].sku, publishedLook: community.consumerPostId, savedInspiration: 1, brandDataSharing: true },
  freshConsumer: { email: FRESH_CONSUMER_EMAIL, wardrobePieces: 0, purpose: "first-run experience" },
    judgeBrand: { email: BRAND_EMAIL, brand: BRAND_NAME, publicPage: `/brands/${BRAND_SLUG}`, releasedProduct: PRODUCTS[0].sku, suppressedProduct: PRODUCTS[1].sku, retiredProduct: PRODUCTS[2].sku, brandLook: community.lookId, publicActivityEvents: community.events },
  freshBrand: { email: FRESH_BRAND_EMAIL, brand: FRESH_BRAND_NAME, products: 0, purpose: "live enrollment from one photo" },
    cohort: { optedInOwnersForReleased, createdMissingOwners: owners.created.length, wearEvents: cohort.wearEvents, thresholdIs: 25 },
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
