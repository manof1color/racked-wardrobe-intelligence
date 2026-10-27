/**
 * Brand sharing keeps a record: every time a person turns it on or off, when, and which version of
 * the words beside the switch they were shown. The record is written with the setting or not at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { BRAND_SHARING_TERMS, BRAND_SHARING_TERMS_HISTORY, brandSharingChange, brandSharingTermsOf, brandSharingUnchanged } from "../lib/brand-sharing-consent.ts";
import { accountDeletionInventory } from "../lib/deletion-plan.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const OWNER = "7f1c2a9e-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 9, 27, 9, 30);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// A record names a version; the version has to keep meaning the words it named. These hashes are of
// the texts exactly as shown on the live site before and after #173.
test("every wording is pinned to its version: changing the words means adding a version", () => {
  assert.deepEqual(BRAND_SHARING_TERMS_HISTORY.map((terms) => [terms.version, sha256(terms.text)]), [
    ["before-2026-10-27", "c6a80062c5bf5664f4c22af8aa92197989ab7cc40ad59ac649f5acc0356071a0"],
    ["2026-10-27", "d51732fde1c91a03d8c4b76f7e0f572a47a19b105f361d8fd5237c5ce6dcc2fe"],
  ]);
  assert.equal(new Set(BRAND_SHARING_TERMS_HISTORY.map((terms) => terms.version)).size, BRAND_SHARING_TERMS_HISTORY.length);
  assert.equal(BRAND_SHARING_TERMS, BRAND_SHARING_TERMS_HISTORY.at(-1), "the newest version is the one on screen");
});

test("the switch shows the current wording, which says earlier wear is included", () => {
  assert.match(BRAND_SHARING_TERMS.text, /including wear you recorded before turning it on/);
  assert.match(BRAND_SHARING_TERMS.text, /figures a brand has already seen can’t be taken back/);
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /<strong>Anonymous brand insights<\/strong><p>\{BRAND_SHARING_TERMS\.text\}<\/p>/, "rendered from the versioned text, never retyped");
});

test("a choice made before versions were kept reads as the earlier wording", () => {
  assert.equal(brandSharingTermsOf(undefined), "before-2026-10-27");
  assert.equal(brandSharingTermsOf("2026-10-27"), "2026-10-27");
  assert.equal(brandSharingTermsOf("2099-01-01"), "before-2026-10-27", "an unknown version is never read as the newest");
});

test("turning sharing on is one write: the setting and a permanent record, both or neither", () => {
  const [update, record] = brandSharingChange("racked", OWNER, true, NOW, "r1");
  assert.deepEqual(update.Update?.Key, { PK: `USER#${OWNER}`, SK: "PROFILE" });
  assert.equal(update.Update?.ConditionExpression, "attribute_exists(PK) AND (attribute_not_exists(brandDataSharing) OR brandDataSharing = :was)", "an account never asked counts as off");
  assert.deepEqual(update.Update?.ExpressionAttributeValues, { ":sharing": true, ":was": false, ":at": "2026-10-27T09:30:00.000Z", ":terms": "2026-10-27" });
  assert.deepEqual(record.Put?.Item, { PK: `USER#${OWNER}`, SK: "CONSENT#2026-10-27T09:30:00.000Z#r1", type: "brand-data-sharing", sharing: true, at: "2026-10-27T09:30:00.000Z", terms: "2026-10-27" });
  assert.ok(!("ttl" in (record.Put?.Item ?? {})), "kept until the account is deleted, unlike the 90-day activity log");
  assert.equal(record.Put?.ConditionExpression, "attribute_not_exists(PK)", "a record is never overwritten");
});

test("turning it off applies only to an account that has it on", () => {
  const [update, record] = brandSharingChange("racked", OWNER, false, NOW, "r2");
  assert.equal(update.Update?.ConditionExpression, "attribute_exists(PK) AND brandDataSharing = :was");
  assert.equal(update.Update?.ExpressionAttributeValues[":was"], true);
  assert.equal(record.Put?.Item.sharing, false);
});

test("asking for the state an account is already in writes nothing; any other failure is an error", () => {
  const cancelled = (...codes: string[]) => Object.assign(new Error("Transaction cancelled"), { name: "TransactionCanceledException", CancellationReasons: codes.map((Code) => ({ Code })) });
  assert.equal(brandSharingUnchanged(cancelled("ConditionalCheckFailed", "None")), true);
  assert.equal(brandSharingUnchanged(cancelled("None", "ConditionalCheckFailed")), false, "a record collision is not 'already in that state'");
  assert.equal(brandSharingUnchanged(cancelled("ThrottlingError", "None")), false);
  assert.equal(brandSharingUnchanged(Object.assign(new Error("x"), { name: "ProvisionedThroughputExceededException" })), false);
  assert.equal(brandSharingUnchanged(null), false);
});

test("the store, the route, and the activity log use that write", () => {
  const store = read("lib/server/production-store.ts");
  assert.match(store, /new TransactWriteCommand\(\{TransactItems:brandSharingChange\(requireTable\(\),ownerId,value,now,crypto\.randomUUID\(\)\)\}\)/);
  assert.doesNotMatch(store, /SET brandDataSharing/, "no second way to change the setting without a record");
  const route = read("app/api/consumer/consent/route.ts");
  assert.match(route, /if\(result\.changed\)await recordAccountActivity\(session\.subject,result\.brandDataSharing\?"brand-sharing-on":"brand-sharing-off"/);
  assert.match(route, /currentTerms:BRAND_SHARING_TERMS\.version/);
});

test("deleting the account deletes its consent records with everything else", () => {
  const inventory = accountDeletionInventory(OWNER, [
    { PK: `USER#${OWNER}`, SK: "PROFILE" },
    { PK: `USER#${OWNER}`, SK: "CONSENT#2026-10-27T09:30:00.000Z#r1", sharing: true },
  ]);
  assert.deepEqual(inventory.recordKeys, [{ PK: `USER#${OWNER}`, SK: "CONSENT#2026-10-27T09:30:00.000Z#r1" }, { PK: `USER#${OWNER}`, SK: "PROFILE" }]);
});
