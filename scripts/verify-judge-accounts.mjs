// Checks the seeded judge accounts against the live table, read-only.
//
// Judge note: this script writes nothing and needs no password. It answers one question — will a
// judge signing in actually see what the demo promises? — by reading the same records the app
// reads: the accounts, the enrolled products, the opted-in owner cohort behind the k>=25
// threshold, the judge closet's verified and owner-picked pieces, the published looks, and the
// image objects every one of those points at.
//
// Run:
//   RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... node scripts/verify-judge-accounts.mjs

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const table = process.env.RACKED_TABLE_NAME;
const bucket = process.env.RACKED_UPLOAD_BUCKET;
if (!table || !bucket) throw new Error("RACKED_TABLE_NAME and RACKED_UPLOAD_BUCKET are required.");
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });

const MINIMUM_COHORT_SIZE = 25;
const CONSUMER_ID = "judge-consumer-account";
const BRAND_ID = "judge-brand-account";
const RELEASED = "judge-product-released";
const SUPPRESSED = "judge-product-suppressed";
const RETIRED = "judge-product-retired";
const EMAILS = ["judge.consumer@racked.local", "judge.newconsumer@racked.local", "judge.brand@racked.local", "judge.newbrand@racked.local"];

const results = [];
const check = (pass, label, detail = "") => { results.push({ pass, label, detail }); return pass; };

async function queryAll(input) {
  const items = [];
  let startKey;
  do {
    const page = await db.send(new QueryCommand({ TableName: table, ...input, ...(startKey ? { ExclusiveStartKey: startKey } : {}) }));
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function accountFor(email) {
  const found = await queryAll({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `EMAIL#${email}` } });
  return found[0] ?? null;
}

async function objectExists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; }
  catch { return false; }
}

for (const email of EMAILS) {
  const account = await accountFor(email);
  check(Boolean(account), `account ${email} exists`);
  if (account) check(account.dataClassification === "DEMO" && account.testCohort === true, `${email} is labelled synthetic demo data`);
}

const products = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `USER#${BRAND_ID}`, ":sk": "PRODUCT#" } });
check(products.length === 3, "the judge brand has its three products", `${products.length} found`);
check(products.some((product) => product.id === RETIRED && product.archived === true), "one product is retired, so retirement can be shown");

for (const product of products) {
  for (const view of Object.values(product.views ?? {})) {
    if (!view?.storageKey) continue;
    check(await objectExists(view.storageKey), `product photo is present: ${view.storageKey}`);
  }
}

const linked = await queryAll({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `PRODUCT#${RELEASED}` } });
const ownerKeys = [...new Set(linked.map((item) => String(item.PK)))];
const optedIn = new Set();
for (let offset = 0; offset < ownerKeys.length; offset += 100) {
  const keys = ownerKeys.slice(offset, offset + 100).map((PK) => ({ PK, SK: "PROFILE" }));
  const found = await db.send(new BatchGetCommand({ RequestItems: { [table]: { Keys: keys, ProjectionExpression: "PK, brandDataSharing" } } }));
  for (const item of found.Responses?.[table] ?? []) if (item.brandDataSharing === true) optedIn.add(String(item.PK));
}
check(optedIn.size >= MINIMUM_COHORT_SIZE, `the released product has at least ${MINIMUM_COHORT_SIZE} opted-in owners, so its metrics release`, `${optedIn.size} opted in of ${ownerKeys.length} linked`);

const suppressedLinked = await queryAll({ IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `PRODUCT#${SUPPRESSED}` } });
check(suppressedLinked.length > 0 && suppressedLinked.length < MINIMUM_COHORT_SIZE, "the second product stays below the threshold, so suppression can be shown", `${suppressedLinked.length} owners`);

const wears = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `PRODUCT#${RELEASED}`, ":sk": "WEAR#" } });
check(wears.length >= 40, "the released product has enough wear events to draw its chart", `${wears.length} events`);

const closet = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `USER#${CONSUMER_ID}`, ":sk": "GARMENT#" } });
check(closet.length >= 12, "the judge closet has a lived-in wardrobe", `${closet.length} pieces`);
check(closet.some((piece) => piece.identityStatus === "verified"), "one piece is verified against a brand product");
check(closet.some((piece) => piece.identityStatus === "owner-selected"), "one piece is linked by the owner's own pick");
let missingImages = 0;
for (const piece of closet) if (piece.imageKey && !(await objectExists(piece.imageKey))) missingImages++;
check(missingImages === 0, "every piece in the judge closet has its photo", missingImages ? `${missingImages} missing` : "");

const outfits = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `USER#${CONSUMER_ID}`, ":sk": "OUTFIT#" } });
check(outfits.length >= 2, "saved outfits are present", `${outfits.length} outfits`);

const posts = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": "COMMUNITY", ":sk": "POST#" } });
const judgePosts = posts.filter((post) => post.ownerId === CONSUMER_ID || post.ownerId === BRAND_ID);
check(judgePosts.some((post) => post.sourceType === "consumer"), "the judge account has a published Community look");
check(judgePosts.some((post) => post.sourceType === "brand"), "the judge brand has a published Brand Look");

const events = await queryAll({ KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": "COMMUNITY", ":sk": "EVENT#" } });
check(events.some((event) => event.productId === RELEASED), "public activity exists for the released product", `${events.filter((event) => event.productId === RELEASED).length} events`);

const failures = results.filter((result) => !result.pass);
for (const result of results) console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.label}${result.detail ? ` — ${result.detail}` : ""}`);
console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length) {
  console.log("Re-run scripts/seed-judge-accounts.mjs to repair the demo data.");
  process.exitCode = 1;
}
