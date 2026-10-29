// Real-use snapshot for the README (work order W3). Owner-run and read-only: it scans the table
// once, reads nothing personal into its output, and changes nothing in AWS. By default it prints
// the totals; with --write it saves them to data/pilot-usage.json for a pull request.
//
//   RACKED_TABLE_NAME=<table> node scripts/pilot-usage-snapshot.mjs           # print only
//   RACKED_TABLE_NAME=<table> node scripts/pilot-usage-snapshot.mjs --write   # save the file
//
// Demo and test-cohort accounts are left out entirely. Any count under 5 is written as
// "fewer than 5", and AI-acceptance rates are published only once at least 5 pieces were saved.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SMALL_COUNT = 5;
const ACCEPTANCE_KEYS = ["saved", "unchanged", "needsLabel", "categoryEdited", "subtypeEdited", "nameEdited"];
const small = (value) => (value < SMALL_COUNT ? "fewer than 5" : value);

/** Totals for real accounts, from raw table items. Pure, so it is tested without AWS. */
export function summarizeUsage(items, today, countingSince) {
  const real = new Map();
  for (const item of items) {
    if (item.SK !== "PROFILE" || !String(item.PK).startsWith("USER#")) continue;
    if (item.dataClassification === "DEMO" || item.testCohort === true) continue;
    real.set(String(item.PK), item.role);
  }
  const totals = { consumer: 0, brand: 0, pieces: 0, outfits: 0, wears: 0, hanger: 0 };
  for (const role of real.values()) if (role === "consumer" || role === "brand") totals[role]++;
  const acceptance = Object.fromEntries(ACCEPTANCE_KEYS.map((key) => [key, 0]));
  let firstDay = null;
  for (const item of items) {
    const sk = String(item.SK ?? "");
    if (item.PK === "STATS#ai-acceptance" && sk.startsWith("DAY#")) {
      for (const key of ACCEPTANCE_KEYS) acceptance[key] += Number(item[key] ?? 0) || 0;
      const day = sk.slice(4);
      if (!firstDay || day < firstDay) firstDay = day;
      continue;
    }
    if (!real.has(String(item.PK))) continue;
    if (sk.startsWith("GARMENT#")) { totals.pieces++; totals.wears += Math.max(0, Number(item.wearCount ?? 0) || 0); }
    else if (sk.startsWith("OUTFIT#")) totals.outfits++;
    else if (sk === "HANGER_CHAT") totals.hanger++;
  }
  return {
    asOf: today,
    countingSince: firstDay ?? countingSince,
    accounts: { consumer: small(totals.consumer), brand: small(totals.brand) },
    piecesSaved: small(totals.pieces),
    outfitsSaved: small(totals.outfits),
    wearsRecorded: small(totals.wears),
    hangerConversations: small(totals.hanger),
    aiAcceptance: acceptance.saved >= SMALL_COUNT ? acceptance : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--write")) throw new Error("The only option is --write.");
  const table = process.env.RACKED_TABLE_NAME;
  if (!table) throw new Error("Set RACKED_TABLE_NAME to the production table name.");
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, ScanCommand }] = await Promise.all([import("@aws-sdk/client-dynamodb"), import("@aws-sdk/lib-dynamodb")]);
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2" }));
  const names = { "#pk": "PK", "#sk": "SK", "#role": "role", "#class": "dataClassification", "#test": "testCohort", "#wear": "wearCount", ...Object.fromEntries(ACCEPTANCE_KEYS.map((key) => [`#${key}`, key])) };
  const items = [];
  let start;
  try {
    do {
      const page = await db.send(new ScanCommand({ TableName: table, ProjectionExpression: Object.keys(names).join(", "), ExpressionAttributeNames: names, ...(start ? { ExclusiveStartKey: start } : {}) }));
      items.push(...(page.Items ?? []));
      start = page.LastEvaluatedKey;
    } while (start);
  } finally {
    db.destroy();
  }
  const path = resolve(fileURLToPath(new URL("../data/pilot-usage.json", import.meta.url)));
  const previous = JSON.parse(readFileSync(path, "utf8"));
  const snapshot = summarizeUsage(items, new Date().toISOString().slice(0, 10), previous.countingSince);
  console.log(JSON.stringify(snapshot, null, 2));
  if (args.includes("--write")) {
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`Saved ${path}. Then regenerate the README block (see tests/real-use.test.ts) and open a pull request.`);
  } else {
    console.log("Dry run: nothing was written. Add --write to save data/pilot-usage.json.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // SDK errors can name AWS resources; print only the error's kind.
  main().catch((error) => { console.error(JSON.stringify({ error: error instanceof Error && /^(The only option|Set RACKED_TABLE_NAME)/.test(error.message) ? error.message : "snapshot-failed" })); process.exitCode = 1; });
}
