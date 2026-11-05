import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandRows, DEFAULT_TABLE, DEMO_ACCOUNT_PREFIX as SCRIPT_DEMO_PREFIX, parseCommand, PROTECTED_ACCOUNTS, statusOf, statusUpdate } from "../scripts/brand-approval.mjs";
import { alertRecipients, brandSignupAlert, MAX_ALERT_RECIPIENTS } from "../lib/brand-signup-alert.ts";
import { brandStatusOf } from "../lib/brand-approval.ts";
import { DEMO_ACCOUNT_PREFIX, SHARED_DEMO_ACCOUNTS } from "../lib/demo-session.ts";

// The owner's approval commands and the new-brand alert (owner decision, 2026-11-04).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ID = "0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90";

test("the commands read status exactly as the app does", () => {
  for (const brandStatus of [undefined, "approved", "pending", "revoked", "something-else"]) {
    assert.equal(statusOf({ brandStatus }), brandStatusOf({ role: "brand", brandStatus }), String(brandStatus));
  }
});

test("approve and revoke need a real account id, and never touch a demo or shared judge brand", () => {
  assert.deepEqual(parseCommand(["pending"]), { action: "pending" });
  assert.deepEqual(parseCommand(["list"]), { action: "list" });
  assert.deepEqual(parseCommand(["approve", ID]), { action: "approve", id: ID, yes: false });
  assert.deepEqual(parseCommand(["revoke", ID, "--yes"]), { action: "revoke", id: ID, yes: true });
  for (const argv of [[], ["delete", ID], ["approve"], ["approve", "--yes"], ["approve", "x"], ["approve", "USER#abc; drop"], ["approve", `${DEMO_ACCOUNT_PREFIX}brand-${ID}`], ...PROTECTED_ACCOUNTS.map((id) => ["revoke", id])]) {
    assert.ok("error" in parseCommand(argv), argv.join(" "));
  }
  assert.equal(SCRIPT_DEMO_PREFIX, DEMO_ACCOUNT_PREFIX);
  assert.deepEqual(PROTECTED_ACCOUNTS, Object.entries(SHARED_DEMO_ACCOUNTS).filter(([, choice]) => choice.endsWith("brand")).map(([id]) => id), "the shared judge brands, from lib/demo-session.ts");
});

test("the one write is that account's status, and only if it is a brand account", () => {
  const update = statusUpdate(DEFAULT_TABLE, ID, "approved", new Date("2026-11-04T12:00:00Z"));
  assert.equal(DEFAULT_TABLE, "racked-production");
  assert.deepEqual(update.Key, { PK: `USER#${ID}`, SK: "PROFILE" });
  assert.equal(update.ConditionExpression, "attribute_exists(PK) AND #role = :brand");
  assert.equal(update.UpdateExpression, "SET brandStatus = :status, brandStatusChangedAt = :at");
  assert.deepEqual(update.ExpressionAttributeValues, { ":status": "approved", ":brand": "brand", ":at": "2026-11-04T12:00:00.000Z" });
  const script = read("scripts/brand-approval.mjs");
  assert.equal(script.match(/new UpdateCommand\(/g)?.length, 1, "nothing else is ever written");
  assert.doesNotMatch(script, /DeleteCommand|PutCommand|BatchWrite/);
  assert.ok(script.indexOf('prompt.question(`Type "${command.action}"') < script.indexOf("new UpdateCommand("), "it asks before it writes");
});

test("the pending list shows brands oldest first and leaves out consumers and demo brands", () => {
  const rows = brandRows([
    { id: "b2", role: "brand", brandStatus: "pending", brandName: "Later", email: "b@later.example", createdAt: "2026-11-03T00:00:00Z" },
    { id: "b1", role: "brand", brandStatus: "pending", brandName: "Earlier", email: "a@earlier.example", createdAt: "2026-11-01T00:00:00Z" },
    { id: "b3", role: "brand", brandName: "Pilot", createdAt: "2026-10-01T00:00:00Z" },
    { id: `${DEMO_ACCOUNT_PREFIX}brand-x`, role: "brand", brandStatus: "approved", createdAt: "2026-11-02T00:00:00Z" },
    { id: "c1", role: "consumer", createdAt: "2026-11-02T00:00:00Z" },
  ], "pending");
  assert.deepEqual(rows.map((row: { id: string }) => row.id), ["b1", "b2"]);
  assert.deepEqual(brandRows([{ id: "b3", role: "brand", createdAt: "2026-10-01" }]).map((row: { status: string }) => row.status), ["approved"], "a brand from before approval counts as approved");
});

test("the alert goes only to the owner's own addresses, at most three", () => {
  assert.deepEqual(alertRecipients(undefined), []);
  assert.deepEqual(alertRecipients(" owner@example.com , not-an-address, second@example.com "), ["owner@example.com", "second@example.com"]);
  assert.equal(alertRecipients("a@x.io,b@x.io,c@x.io,d@x.io,e@x.io").length, MAX_ALERT_RECIPIENTS);
  assert.deepEqual(alertRecipients("evil@x.io\nBcc: everyone@x.io"), [], "no header tricks");
});

test("the alert names the brand and the approve command, on single lines, with nothing secret", () => {
  const alert = brandSignupAlert({ accountId: ID, brandName: "Acme\r\nBcc: x@evil.example\tGoods", email: "founder@acme.example", createdAt: "2026-11-04T12:00:00.000Z" });
  assert.doesNotMatch(alert.subject, /[\r\n]/);
  assert.match(alert.subject, /Acme Bcc: x@evil\.example Goods$/);
  assert.match(alert.body, new RegExp(`pnpm brands:approve ${ID}`));
  assert.match(alert.body, /Registered with: founder@acme\.example/);
  assert.doesNotMatch(alert.body, /password|https?:\/\//i);
  assert.ok(brandSignupAlert({ accountId: ID, brandName: "x".repeat(500), email: "a@b.co", createdAt: "" }).subject.length < 140);
});

test("registration emails the owner for a new brand only, and an unsent alert never fails it", () => {
  const route = read("app/api/auth/register/route.ts");
  assert.match(route, /if\(account\.role==="brand"\)await notifyOwnerOfBrandSignup\(\{accountId:account\.id,brandName:account\.brandName\?\?"",email:account\.email,createdAt:account\.createdAt\}\);/);
  assert.ok(route.indexOf("notifyOwnerOfBrandSignup(") > route.indexOf("await createAccount("), "only once the account exists");
  const sender = read("lib/server/brand-signup-email.ts");
  assert.match(sender, /if\(!to\.length\|\|!from\)return false;/, "off unless configured");
  assert.match(sender, /catch\(error\)\{\n {4}console\.error\("Brand sign-up alert not sent",\{name:error instanceof Error\?error\.name:"UnknownError"\}\);\n {4}return false;/, "a failure is logged by name only and swallowed");
  assert.match(sender, /abortSignal:AbortSignal\.timeout\(SES_SEND_TIMEOUT_MS\)/, "and cannot hold the registration open");
  const env = read("scripts/write-amplify-env.mjs");
  assert.match(env, /"RACKED_BRAND_ALERT_TO",\n {2}"RACKED_BRAND_ALERT_FROM",/, "the settings reach the runtime on Amplify");
  const pkg = JSON.parse(read("package.json"));
  for (const action of ["pending", "list", "approve", "revoke"]) assert.equal(pkg.scripts[`brands:${action}`], `node scripts/brand-approval.mjs ${action}`);
});
