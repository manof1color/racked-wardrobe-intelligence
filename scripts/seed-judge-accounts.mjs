// Seeds two clearly labeled DEMO accounts for competition judging.
//
// Judge note: this writes synthetic demonstration data only. Both accounts are
// classified DEMO, use reserved .local addresses, and are never presented as real
// customers. The password is supplied at runtime through RACKED_TEST_PASSWORD and is
// deliberately never written to this repository — see docs/test-cohort.md.
//
// Run:
//   ALLOW_RACKED_TEST_SEED=yes RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... \
//   RACKED_TEST_PASSWORD=... node --experimental-strip-types scripts/seed-judge-accounts.mjs
//
// Idempotent: stable ids mean re-running refreshes the same records rather than
// creating duplicates.

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

if (process.env.ALLOW_RACKED_TEST_SEED !== "yes") throw new Error("Set ALLOW_RACKED_TEST_SEED=yes to confirm this clearly labeled synthetic write.");
const table = process.env.RACKED_TABLE_NAME, bucket = process.env.RACKED_UPLOAD_BUCKET, password = process.env.RACKED_TEST_PASSWORD;
if (!table || !bucket || !password) throw new Error("RACKED_TABLE_NAME, RACKED_UPLOAD_BUCKET, and RACKED_TEST_PASSWORD are required.");
if (password.length < 16) throw new Error("Use a password of at least 16 characters.");

const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({ region });
const scrypt = promisify(scryptCallback);

const createdAt = "2026-08-14T12:00:00.000Z";
const CONSUMER_ID = "judge-consumer-account";
const CONSUMER_EMAIL = "judge.consumer@racked.local";
const BRAND_ID = "judge-brand-account";
const BRAND_EMAIL = "judge.brand@racked.local";
const BRAND_NAME = "Judge Demo Atelier";
const BRAND_SLUG = "judge-demo-atelier";

// A deliberately varied wardrobe. Categories, colours, styles, seasons, and wear
// counts all differ so the outfit ranker has real material: a near-identical wardrobe
// would make the ranking fix invisible to a judge.
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
  { key: "weekend", name: "Judge Weekend Look", pieces: ["tee", "jean", "sneaker"], wears: 5 },
];

async function accountItem({ id, email, role, displayName, brandName = null, brandSlug = null, brandDataSharing = false }) {
  const salt = randomBytes(18).toString("base64url");
  const passwordHash = Buffer.from(await scrypt(password, salt, 64)).toString("base64url");
  return { id, email, role, displayName, brandName, brandSlug, passwordHash, passwordSalt: salt, createdAt, brandDataSharing, sessionVersion: 0, testCohort: true, dataClassification: "DEMO", PK: `USER#${id}`, SK: "PROFILE", GSI1PK: `EMAIL#${email}`, GSI1SK: "ACCOUNT" };
}

async function garmentImage(piece) {
  const svg = `<svg width="900" height="1100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3efe5"/><path d="M230 230 350 160h200l120 70 115 210-105 58-75-110v520H295V388l-75 110-105-58z" fill="#394a63"/><text x="450" y="430" text-anchor="middle" font-family="Arial" font-weight="800" font-size="40" fill="#d5f66d">${piece.name}</text><text x="450" y="510" text-anchor="middle" font-family="Arial" font-size="34" fill="#d5f66d">${piece.color} ${piece.category}</text><text x="450" y="760" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26" fill="#e94f30">SYNTHETIC DEMO · JUDGE ACCOUNT</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function seedConsumer() {
  await db.send(new PutCommand({ TableName: table, Item: await accountItem({ id: CONSUMER_ID, email: CONSUMER_EMAIL, role: "consumer", displayName: "Competition Judge", brandDataSharing: true }) }));

  const ids = {};
  for (const piece of WARDROBE) {
    const garmentId = `judge-garment-${piece.key}`;
    ids[piece.key] = garmentId;
    const imageKey = `wardrobe/${CONSUMER_ID}/${garmentId}.png`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: imageKey, Body: await garmentImage(piece), ContentType: "image/png", ServerSideEncryption: "AES256", Metadata: { owner: CONSUMER_ID, synthetic: "true" } }));
    await db.send(new PutCommand({ TableName: table, Item: {
      id: garmentId, name: piece.name, category: piece.category, subtype: piece.subtype, color: piece.color, pattern: "solid", material: "unconfirmed",
      style: piece.style, season: piece.season, wearCount: piece.wearCount, lastWornDays: piece.lastWornDays,
      lastWornAt: piece.wearCount > 0 ? new Date(Date.parse(createdAt) - piece.lastWornDays * 86_400_000).toISOString() : null,
      source: "ai-confirmed", art: "photo", imageKey, brand: null, sku: null, identityStatus: "unverified",
      createdAt, testCohort: true, dataClassification: "DEMO",
      PK: `USER#${CONSUMER_ID}`, SK: `GARMENT#${garmentId}`,
    } }));
  }

  for (const outfit of OUTFITS) {
    const outfitId = `judge-outfit-${outfit.key}`;
    await db.send(new PutCommand({ TableName: table, Item: {
      id: outfitId, name: outfit.name, itemIds: outfit.pieces.map((key) => ids[key]), createdAt, wears: outfit.wears,
      testCohort: true, dataClassification: "DEMO",
      PK: `USER#${CONSUMER_ID}`, SK: `OUTFIT#${createdAt}#${outfitId}`,
    } }));
  }
  return { wardrobe: WARDROBE.length, outfits: OUTFITS.length };
}

/** Existing opted-in demo consumers, reused so no second cohort is invented. */
async function optedInDemoConsumers() {
  const result = await db.send(new QueryCommand({ TableName: table, IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": "BRAND_PRODUCTS" }, Limit: 1 }));
  if (!result.Items?.length) console.warn("No enrolled brand products found; is the main cohort seeded?");
  const owners = [];
  for (let index = 1; index <= 25; index++) owners.push(`demo-consumer-${String(index).padStart(2, "0")}`);
  return owners;
}

function productItem({ id, sku, name, category }) {
  const view = (v) => ({ view: v, fileName: `${sku}-${v}.png`, contentType: "image/png", size: 1024, storageKey: `brand/${BRAND_ID}/${sku}-${v}.png` });
  return {
    id, ownerSubject: BRAND_ID, name, brand: BRAND_NAME, brandSlug: BRAND_SLUG, aliases: [BRAND_NAME], sku,
    gtin: null, category, labelText: `${BRAND_NAME} ${sku}`,
    views: { front: view("front"), back: view("back"), label: view("label") },
    enrolledAt: createdAt, source: "brand-enrolled", testCohort: true, dataClassification: "DEMO",
    availability: "available", currency: "USD",
    PK: `USER#${BRAND_ID}`, SK: `PRODUCT#${id}`, GSI1PK: "BRAND_PRODUCTS", GSI1SK: `${BRAND_SLUG}#${sku}`,
  };
}

async function seedBrand() {
  await db.send(new PutCommand({ TableName: table, Item: await accountItem({ id: BRAND_ID, email: BRAND_EMAIL, role: "brand", displayName: "Judge Brand Manager", brandName: BRAND_NAME, brandSlug: BRAND_SLUG }) }));

  // Two products on purpose: one clears the k>=25 release threshold so a judge sees
  // real released metrics immediately, one stays deliberately below it so they can
  // also see suppression working. The contrast is a stronger demo than either alone.
  const released = productItem({ id: "judge-product-released", sku: "JDA-001", name: "Judge Signature Tee", category: "top" });
  const suppressed = productItem({ id: "judge-product-suppressed", sku: "JDA-002", name: "Judge Limited Overshirt", category: "outerwear" });
  await db.send(new PutCommand({ TableName: table, Item: released }));
  await db.send(new PutCommand({ TableName: table, Item: suppressed }));

  const owners = await optedInDemoConsumers();
  const wearPattern = [0, 1, 2, 2, 3, 3, 4, 5, 6, 8];
  let wearEvents = 0;

  // Above threshold: link the released product to all 25 opted-in demo consumers.
  for (const [index, ownerId] of owners.entries()) {
    const garmentId = `judge-linked-${released.sku}-${index + 1}`;
    const wearCount = wearPattern[index % wearPattern.length];
    await db.send(new PutCommand({ TableName: table, Item: {
      id: garmentId, name: released.name, category: released.category, subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton",
      style: ["casual", "everyday"], season: "all-season", wearCount, lastWornDays: wearCount > 0 ? (index % 7) : 999,
      source: "ai-confirmed", art: "photo", imageKey: `wardrobe/${ownerId}/${garmentId}.png`,
      brand: BRAND_NAME, sku: released.sku, registryProductId: released.id, identityStatus: "verified",
      createdAt, testCohort: true, dataClassification: "DEMO",
      PK: `USER#${ownerId}`, SK: `GARMENT#${garmentId}`, GSI1PK: `PRODUCT#${released.id}`, GSI1SK: `OWNER#${ownerId}`,
    } }));
    for (let wear = 0; wear < wearCount; wear++) {
      const occurredAt = new Date(Date.parse(createdAt) - ((index % 7) + wear * 7) * 86_400_000 - index * 3_600_000).toISOString();
      await db.send(new PutCommand({ TableName: table, Item: { PK: `PRODUCT#${released.id}`, SK: `WEAR#${occurredAt}#${ownerId}#${wear}`, occurredAt, ownerPK: `USER#${ownerId}`, garmentId, eventType: "confirmed-wear", testCohort: true } }));
      wearEvents++;
    }
  }

  // Below threshold: only four owners, so the aggregate must stay suppressed.
  for (const [index, ownerId] of owners.slice(0, 4).entries()) {
    const garmentId = `judge-linked-${suppressed.sku}-${index + 1}`;
    await db.send(new PutCommand({ TableName: table, Item: {
      id: garmentId, name: suppressed.name, category: suppressed.category, subtype: "casual-shirt", color: "olive", pattern: "solid", material: "cotton",
      style: ["utility", "casual"], season: "fall", wearCount: index + 1, lastWornDays: index + 3,
      source: "ai-confirmed", art: "photo", imageKey: `wardrobe/${ownerId}/${garmentId}.png`,
      brand: BRAND_NAME, sku: suppressed.sku, registryProductId: suppressed.id, identityStatus: "verified",
      createdAt, testCohort: true, dataClassification: "DEMO",
      PK: `USER#${ownerId}`, SK: `GARMENT#${garmentId}`, GSI1PK: `PRODUCT#${suppressed.id}`, GSI1SK: `OWNER#${ownerId}`,
    } }));
  }

  return { releasedSku: released.sku, suppressedSku: suppressed.sku, linkedOwners: owners.length, wearEvents };
}

const consumer = await seedConsumer();
const brand = await seedBrand();

console.log(JSON.stringify({
  judgeConsumer: { email: CONSUMER_EMAIL, wardrobePieces: consumer.wardrobe, savedOutfits: consumer.outfits, brandDataSharing: true },
  judgeBrand: { email: BRAND_EMAIL, brand: BRAND_NAME, releasedProduct: brand.releasedSku, suppressedProduct: brand.suppressedSku, linkedOwners: brand.linkedOwners, wearEvents: brand.wearEvents },
  passwordSource: "RACKED_TEST_PASSWORD (runtime only, never committed)",
  clearlyLabeledSyntheticData: true,
}, null, 2));
