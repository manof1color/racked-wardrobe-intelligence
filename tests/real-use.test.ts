/**
 * Real-use evidence (work order W3): how often people keep the AI's proposal for a scanned piece
 * unchanged, counted at save time as daily totals with no identifiers, and published in the README
 * only from the owner's snapshot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptanceIncrement, acceptanceOutcome, renderRealUse, type PilotUsage } from "../lib/ai-acceptance.ts";
import { summarizeUsage } from "../scripts/pilot-usage-snapshot.mjs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const proposal = { garment: { name: "White Sneakers", category: "shoe", subtype: "sneakers" } };

test("a piece saved as proposed counts as unchanged; each edit is counted by field", () => {
  assert.deepEqual(acceptanceOutcome(proposal, { name: "white sneakers ", category: "shoe", subtype: "sneakers" }), { needsLabel: false, edited: { category: false, subtype: false, name: false }, unchanged: true }, "case and spacing are not edits");
  assert.equal(acceptanceOutcome(proposal, { name: "White Sneakers", category: "shoe", subtype: "high-top-sneakers" }).edited.subtype, true);
  assert.equal(acceptanceOutcome(proposal, { name: "White Sneakers", category: "top", subtype: "t-shirt" }).edited.category, true);
  assert.equal(acceptanceOutcome(proposal, { name: "My Jordans", category: "shoe", subtype: "sneakers" }).edited.name, true);
  assert.equal(acceptanceOutcome({ garment: { ...proposal.garment, subtype: "other-shoes" } }, { name: "White Sneakers", category: "shoe", subtype: "other-shoes", customType: "Jordan 3 Retro" }).edited.subtype, true, "a typed type replaces the proposed one");
  const edited = acceptanceOutcome(proposal, { name: "My Jordans", category: "shoe", subtype: "sneakers" });
  assert.equal(edited.unchanged, false);
});

test("a needs-your-label card is read from the signed category, not the unsigned fallback flag", () => {
  const unread = { garment: { name: "Unrecognized piece", category: "unknown", subtype: "other-garment" } };
  const outcome = acceptanceOutcome(unread, { name: "Navy Blazer", category: "outerwear", subtype: "blazer" });
  assert.equal(outcome.needsLabel, true);
  assert.equal(outcome.unchanged, false);
  assert.doesNotMatch(read("lib/ai-acceptance.ts"), /proposal\.fallback/, "the browser can change fallback; the signed garment it cannot");
});

test("the counters are whole numbers and nothing else", () => {
  const counts = acceptanceIncrement(acceptanceOutcome(proposal, { name: "White Sneakers", category: "shoe", subtype: "sneakers" }));
  assert.deepEqual(counts, { saved: 1, unchanged: 1, needsLabel: 0, categoryEdited: 0, subtypeEdited: 0, nameEdited: 0 });
  const store = read("lib/server/production-store.ts");
  const record = store.slice(store.indexOf("async function recordAiAcceptance"), store.indexOf("export async function", store.indexOf("async function recordAiAcceptance")));
  assert.match(record, /Key:\{PK:"STATS#ai-acceptance",SK:`DAY#\$\{day\}`\}/, "one aggregate item per day");
  assert.match(record, /UpdateExpression:`ADD \$\{counts\.map/, "added atomically");
  assert.doesNotMatch(record.slice(record.indexOf("new UpdateCommand")), /ownerId|imageKey|garment|name:|email|ttl/, "no account, photo, garment or name is written");
  assert.match(record, /account\.dataClassification==="DEMO"\|\|\(account as \{testCohort\?:unknown\}\)\.testCohort===true\)return;/, "demo and test-cohort accounts are not counted");
});

test("only a saved piece with a valid confirmation token is counted, and counting never fails a save", () => {
  const store = read("lib/server/production-store.ts");
  const save = store.slice(store.indexOf("export async function addWardrobeItem"), store.indexOf("async function recordAiAcceptance"));
  assert.ok(save.indexOf("verifyGarmentConfirmation(ownerId,analysis)") < save.indexOf("recordAiAcceptance("), "after the token is verified");
  assert.ok(save.indexOf("new PutCommand(") < save.indexOf("recordAiAcceptance("), "after the piece is stored");
  assert.match(save, /recordAiAcceptance\(ownerId,acceptanceOutcome\(analysis,\{name,category:classification\.category,subtype:classification\.subtype,customType\}\)\)\.catch\(/);
});

test("the owner's snapshot leaves out demo accounts and never publishes a count under 5", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, index) => ({ PK: `USER#real-${index}`, SK: "PROFILE", role: "consumer", dataClassification: "REGULAR" })),
    { PK: "USER#brand-1", SK: "PROFILE", role: "brand" },
    { PK: "USER#demo", SK: "PROFILE", role: "consumer", dataClassification: "DEMO" },
    { PK: "USER#cohort", SK: "PROFILE", role: "consumer", testCohort: true },
    ...Array.from({ length: 7 }, (_, index) => ({ PK: `USER#real-${index % 6}`, SK: `GARMENT#g${index}`, wearCount: 2 })),
    ...Array.from({ length: 9 }, (_, index) => ({ PK: "USER#demo", SK: `GARMENT#d${index}`, wearCount: 50 })),
    { PK: "USER#real-0", SK: "OUTFIT#o1" },
    { PK: "USER#real-0", SK: "HANGER_CHAT" },
    { PK: "STATS#ai-acceptance", SK: "DAY#2026-10-30", saved: 4, unchanged: 3, needsLabel: 0, categoryEdited: 0, subtypeEdited: 1, nameEdited: 1 },
    { PK: "STATS#ai-acceptance", SK: "DAY#2026-10-29", saved: 6, unchanged: 4, needsLabel: 1, categoryEdited: 1, subtypeEdited: 1, nameEdited: 0 },
  ];
  const snapshot = summarizeUsage(items, "2026-11-03", "2026-10-28");
  assert.deepEqual(snapshot.accounts, { consumer: 6, brand: "fewer than 5" }, "demo and cohort accounts are not real use");
  assert.equal(snapshot.piecesSaved, 7);
  assert.equal(snapshot.wearsRecorded, 14, "the demo account's 450 wears are absent");
  assert.equal(snapshot.outfitsSaved, "fewer than 5");
  assert.equal(snapshot.hangerConversations, "fewer than 5");
  assert.deepEqual(snapshot.aiAcceptance, { saved: 10, unchanged: 7, needsLabel: 1, categoryEdited: 1, subtypeEdited: 2, nameEdited: 1 });
  assert.equal(snapshot.countingSince, "2026-10-29", "counting starts on the first day with a count");
  assert.equal(summarizeUsage(items.filter((item) => item.SK !== "DAY#2026-10-29"), "2026-11-03", "2026-10-28").aiAcceptance, null, "under 5 saved pieces, no rates are published");
});

test("the snapshot script reads AWS and writes only a local file, and only when asked", () => {
  const script = read("scripts/pilot-usage-snapshot.mjs");
  assert.doesNotMatch(script, /PutCommand|UpdateCommand|DeleteCommand|BatchWrite|TransactWrite/, "nothing in AWS changes");
  assert.match(script, /if \(args\.includes\("--write"\)\) \{\s*writeFileSync\(path,/, "the data file is written only with --write");
  assert.match(script, /Dry run: nothing was written/);
  assert.match(read("package.json"), /"usage:snapshot": "node scripts\/pilot-usage-snapshot\.mjs"/);
});

test("the README's real-use block is generated from the data file", () => {
  const usage = JSON.parse(read("data/pilot-usage.json")) as PilotUsage;
  const readme = read("README.md").replace(/\r\n/g, "\n");
  const start = readme.indexOf("<!-- real-use:start");
  const end = readme.indexOf("<!-- real-use:end -->") + "<!-- real-use:end -->".length;
  assert.ok(start > 0 && end > start, "the block is in the README");
  assert.equal(readme.slice(start, end), renderRealUse(usage));
});

test("the block says only what the data supports", () => {
  const empty: PilotUsage = { asOf: null, countingSince: "2026-10-28", accounts: { consumer: null, brand: null }, piecesSaved: null, outfitsSaved: null, wearsRecorded: null, hangerConversations: null, aiAcceptance: null };
  assert.match(renderRealUse(empty), /Real use: not measured yet/);
  assert.doesNotMatch(renderRealUse(empty), /\d+%/, "no rate before any data");
  const measured: PilotUsage = { ...empty, asOf: "2026-11-10", accounts: { consumer: 12, brand: "fewer than 5" }, piecesSaved: 140, outfitsSaved: 31, wearsRecorded: 88, hangerConversations: 9, aiAcceptance: { saved: 140, unchanged: 98, needsLabel: 4, categoryEdited: 7, subtypeEdited: 28, nameEdited: 19 } };
  const text = renderRealUse(measured);
  assert.match(text, /\| Brand accounts \| fewer than 5 \|/);
  assert.match(text, /Across 140 scanned pieces people kept since 2026-10-28, \*\*70% were saved exactly as the AI proposed\*\*/);
  assert.match(text, /the type on 20%/);
  assert.match(renderRealUse({ ...measured, aiAcceptance: null }), /Fewer than 5 scanned pieces have been saved/);
});

test("the privacy page says these counts exist and what they hold", () => {
  assert.match(read("app/privacy/page.tsx"), /Racked counts each day how many scanned pieces people kept exactly as suggested and how many they changed\. These are totals only: no account, photo, garment or name is attached, and demo accounts are not counted\./);
});
