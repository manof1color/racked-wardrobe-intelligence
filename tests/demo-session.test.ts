import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_ACCOUNT_PREFIX, DEMO_AI_ALLOWANCE, DEMO_COPIED_RECORDS, DEMO_RECORD_LIFETIME_MS, DEMO_SESSION_MS, DEMO_SOURCE_ACCOUNTS, demoCopy, demoExpiry, demoKindOf, demoProfile, isDemoAccountId, isDemoBrandAccount, newDemoAccountId } from "../lib/demo-session.ts";
import { ownedObjectKey } from "../lib/deletion-plan.ts";
import { createSessionToken, verifySessionToken } from "../lib/session.ts";
import { chargeAccountAllowance } from "../lib/ai-budget.ts";
import { AI_DAILY_ALLOWANCE } from "../lib/abuse-limits.ts";
import { guardRequest } from "../lib/request-guard.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The demo wardrobe is copied from the seeded judge wardrobe, so the copy is checked against the
// seed itself, in dry-run mode: no AWS, no password.
process.env.RACKED_SEED_DRY_RUN = "yes";
const { buildJudgeSeed, JUDGE_SEED_IDS } = await import("../scripts/seed-judge-accounts.mjs");
const { written } = await buildJudgeSeed();
const seeded = written.items as Array<Record<string, unknown>>;
const judgePartition = seeded.filter((item) => item.PK === `USER#${JUDGE_SEED_IDS.consumer.id}`);

const NOW = Date.parse("2026-11-17T15:00:00.000Z");
const DEMO_ID = newDemoAccountId("0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90");
const copies = judgePartition.map((record) => demoCopy(record, DEMO_ID, NOW)).filter((record): record is Record<string, unknown> => record !== null);
const copiesOf = (prefix: string) => copies.filter((record) => String(record.SK).startsWith(prefix));

test("a demo account id is recognisable, and no real or seeded id is mistaken for one", () => {
  assert.equal(isDemoAccountId(DEMO_ID), true);
  assert.ok(DEMO_ID.startsWith(DEMO_ACCOUNT_PREFIX));
  // Real accounts are bare UUIDs; the seeded cohort is demo-consumer-NN; the judges are judge-*.
  for (const id of ["0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90", "demo-consumer-01", "judge-consumer-account", DEMO_ACCOUNT_PREFIX, "", null, 42]) {
    assert.equal(isDemoAccountId(id), false, String(id));
  }
  assert.match(DEMO_ID, /^[A-Za-z0-9-]{8,128}$/, "the id fits the account-id shape deletion checks");
});

test("the demos start from the seeded judge accounts", () => {
  assert.equal(DEMO_SOURCE_ACCOUNTS.consumer, JUDGE_SEED_IDS.consumer.id);
  assert.equal(DEMO_SOURCE_ACCOUNTS.brand, JUDGE_SEED_IDS.brand.id);
  assert.equal(demoKindOf("consumer"), "consumer");
  assert.equal(demoKindOf("brand"), "brand");
  for (const value of ["admin", "", undefined, null, 1]) assert.equal(demoKindOf(value), null);
});

test("a demo wardrobe copies the seeded pieces, outfits and inspiration, and nothing else", () => {
  const seededGarments = judgePartition.filter((item) => String(item.SK).startsWith("GARMENT#"));
  assert.equal(copiesOf("GARMENT#").length, seededGarments.length);
  assert.ok(copiesOf("GARMENT#").length >= 12, "the lived-in wardrobe, not an empty one");
  assert.equal(copiesOf("OUTFIT#").length, judgePartition.filter((item) => String(item.SK).startsWith("OUTFIT#")).length);
  assert.equal(copiesOf("INSPIRATION#").length, 1);
  assert.equal(copies.length, copiesOf("GARMENT#").length + copiesOf("OUTFIT#").length + copiesOf("INSPIRATION#").length);
  assert.equal(demoCopy({ PK: "USER#x", SK: "PROFILE", passwordHash: "secret" }, DEMO_ID, NOW), null, "never the seeded account record");
  assert.equal(demoCopy({ PK: "USER#x", SK: "POINTS", total: 9 }, DEMO_ID, NOW), null);
  assert.deepEqual([...DEMO_COPIED_RECORDS], ["GARMENT#", "OUTFIT#", "INSPIRATION#"]);
  // Every outfit still points at pieces the copy holds.
  const garmentIds = new Set(copiesOf("GARMENT#").map((garment) => garment.id));
  for (const outfit of copiesOf("OUTFIT#")) for (const id of outfit.itemIds as string[]) assert.ok(garmentIds.has(id), `${outfit.name} → ${id}`);
});

test("a copied piece never joins a brand's owner index, but a verified one still shows as verified", () => {
  for (const record of copies) {
    assert.equal(record.PK, `USER#${DEMO_ID}`);
    for (const key of Object.keys(record)) assert.doesNotMatch(key, /^GSI/, `${record.SK} kept ${key}`);
    assert.equal(record.dataClassification, "DEMO");
    assert.equal(record.testCohort, true);
    assert.equal(record.demoSession, true);
    assert.equal(record.ttl, demoExpiry(NOW));
  }
  const verified = copiesOf("GARMENT#").find((garment) => garment.identityStatus === "verified");
  assert.ok(verified, "the seeded wardrobe has a verified piece");
  assert.equal(verified.registryProductId, JUDGE_SEED_IDS.products[0].id);
  // A product id that lived only in the index is kept on the piece.
  const indexOnly = demoCopy({ PK: "USER#x", SK: "GARMENT#g", GSI1PK: "PRODUCT#p-1", GSI1SK: "OWNER#x" }, DEMO_ID, NOW);
  assert.equal(indexOnly?.registryProductId, "p-1");
  assert.equal(indexOnly?.GSI1PK, undefined);
  assert.equal(demoCopy({ PK: "USER#x", SK: "GARMENT#g" }, "judge-consumer-account", NOW), null, "only ever into a demo account");
});

test("shared photos are safe: a demo wardrobe can never delete the seeded wardrobe's images", () => {
  for (const garment of copiesOf("GARMENT#")) {
    assert.ok(String(garment.imageKey).startsWith(`wardrobe/${JUDGE_SEED_IDS.consumer.id}/`));
    assert.equal(ownedObjectKey(garment.imageKey, DEMO_ID), null);
  }
});

test("the demo account cannot be signed into with a password, and expires after its session", () => {
  const profile = demoProfile(DEMO_ID, NOW);
  assert.equal(profile.PK, `USER#${DEMO_ID}`);
  assert.equal(profile.SK, "PROFILE");
  assert.equal("GSI1PK" in profile, false, "no email index, so no password sign-in or reset can find it");
  assert.equal(profile.passwordHash, "");
  assert.equal(profile.role, "consumer");
  assert.equal(profile.dataClassification, "DEMO");
  assert.equal(profile.demoSession, true);
  assert.equal(profile.ttl, Math.ceil((NOW + DEMO_RECORD_LIFETIME_MS) / 1000));
  assert.ok(DEMO_RECORD_LIFETIME_MS > DEMO_SESSION_MS, "nothing disappears while the session is still open");
  assert.equal(DEMO_SESSION_MS, 24 * 60 * 60 * 1000);
});

test("only the seeded, synthetic demo brand opens from the brand demo", () => {
  const brand = seeded.find((item) => item.PK === `USER#${JUDGE_SEED_IDS.brand.id}` && item.SK === "PROFILE");
  assert.equal(isDemoBrandAccount(brand as Record<string, unknown>), true);
  assert.equal(isDemoBrandAccount({ ...brand, dataClassification: "REGULAR" }), false, "a real brand never");
  assert.equal(isDemoBrandAccount({ ...brand, testCohort: undefined }), false);
  assert.equal(isDemoBrandAccount({ ...brand, id: "judge-fresh-brand-account" }), false);
  assert.equal(isDemoBrandAccount({ ...brand, role: "consumer" }), false);
  assert.equal(isDemoBrandAccount(null), false);
});

test("a demo session is signed, and its kind must match its role", async () => {
  const secret = "s".repeat(40);
  const expiresAt = NOW + DEMO_SESSION_MS;
  const consumer = await verifySessionToken(await createSessionToken({ subject: DEMO_ID, role: "consumer", expiresAt, demo: "consumer" }, secret), secret, NOW);
  assert.equal(consumer?.demo, "consumer");
  const brand = await verifySessionToken(await createSessionToken({ subject: "judge-brand-account", role: "brand", expiresAt, demo: "brand" }, secret), secret, NOW);
  assert.equal(brand?.demo, "brand");
  assert.equal(await verifySessionToken(await createSessionToken({ subject: DEMO_ID, role: "consumer", expiresAt, demo: "brand" }, secret), secret, NOW), null);
  const ordinary = await verifySessionToken(await createSessionToken({ subject: "judge-brand-account", role: "brand", expiresAt }, secret), secret, NOW);
  assert.equal(ordinary?.demo, undefined, "a password sign-in to the demo brand is not a demo session");
});

test("a demo wardrobe gets a smaller AI allowance than a real account", async () => {
  const counter = (count: number) => async () => ({ count, resetAt: NOW + 1000 });
  assert.equal((await chargeAccountAllowance(counter(DEMO_AI_ALLOWANCE.scan), "scan", DEMO_ID, NOW)).allowed, true);
  const over = await chargeAccountAllowance(counter(DEMO_AI_ALLOWANCE.scan + 1), "scan", DEMO_ID, NOW);
  assert.equal(over.allowed, false);
  assert.ok(!over.allowed && over.message.includes(String(DEMO_AI_ALLOWANCE.scan)));
  assert.equal((await chargeAccountAllowance(counter(DEMO_AI_ALLOWANCE.hanger + 1), "hanger", DEMO_ID, NOW)).allowed, false);
  assert.equal((await chargeAccountAllowance(counter(DEMO_AI_ALLOWANCE.scan + 1), "scan", "0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90", NOW)).allowed, true);
  assert.ok(DEMO_AI_ALLOWANCE.scan < AI_DAILY_ALLOWANCE.scan && DEMO_AI_ALLOWANCE.hanger < AI_DAILY_ALLOWANCE.hanger);
});

test("the demo sign-in is limited, signed, and only ever from Racked itself", () => {
  const route = read("app/api/auth/demo/route.ts");
  assert.match(route, /consumeRateLimit\(`demo:\$\{client\}`,RATE_LIMIT_RULES\.demoSession\)/);
  assert.match(route, /claimAddressRequest\("demo",client\)/);
  assert.match(route, /kind==="consumer"\?await claimDemoWardrobe\(\)/, "the site-wide ceiling counts new wardrobes");
  assert.match(route, /createSessionToken\(\{subject,role:kind,sessionVersion,expiresAt:Date\.now\(\)\+DEMO_SESSION_MS,demo:kind\}/);
  assert.match(route, /isDemoBrandAccount\(account\)/);
  assert.doesNotMatch(route, /authenticateAccount|checkPassword|knownDeviceCookie|recordAccountActivity/, "no password, and no trace in the shared brand's activity log");
  const decision = guardRequest({ method: "POST", pathname: "/api/auth/demo", headers: new Headers({ origin: "https://evil.example", "content-length": "20" }), environment: { NODE_ENV: "production" } });
  assert.equal(decision.allowed, false, "another site cannot sign a visitor into the demo");
});

test("demo sessions are refused everything that could change sign-in, publish, or edit the brand", () => {
  for (const path of ["app/api/brand/looks/route.ts", "app/api/brand/products/route.ts", "app/api/brand/products/[productId]/route.ts", "app/api/brand/products/describe/route.ts"]) {
    assert.match(read(path), /brandAccess\(\{ ?write: ?true ?\}\)/, path);
  }
  for (const path of ["app/api/brand/metrics/route.ts", "app/api/brand/community-metrics/route.ts", "app/api/agents/brand/route.ts"]) {
    assert.doesNotMatch(read(path), /write/, `${path} only reads`);
  }
  assert.match(read("lib/server/brand-access.ts"), /if \(write && session\.demo\) return \{ ok: false/);
  const settings: Array<[string, number]> = [["app/api/account/route.ts", 2], ["app/api/account/sessions/route.ts", 1], ["app/api/account/two-step/route.ts", 1], ["app/api/account/two-step/setup/route.ts", 1], ["app/api/account/two-step/confirm/route.ts", 1], ["app/api/account/two-step/recovery-codes/route.ts", 1]];
  for (const [path, count] of settings) assert.equal(read(path).match(/if ?\(session\.demo\) ?return NextResponse\.json\(\{ ?error: ?DEMO_SETTINGS_MESSAGE ?\}/g)?.length, count, path);
  assert.match(read("app/api/community/route.ts"), /if\(session\.demo\)return NextResponse\.json\(\{error:DEMO_PUBLISH_MESSAGE\}/);
  assert.match(read("app/api/community/[postId]/recreate/route.ts"), /if\(!session\.demo\)await recordPrivacySafeCommunityEvent/);
});

test("a demo wardrobe never reaches a brand's numbers", () => {
  const store = read("lib/server/production-store.ts");
  assert.match(store, /const ownerIndex=registryProductId&&!isDemoAccountId\(ownerId\);/);
  assert.match(store, /GSI1PK:ownerIndex\?`PRODUCT#\$\{registryProductId\}`:undefined/);
  assert.match(store, /\.filter\(key=>!isDemoAccountId\(key\.slice\("USER#"\.length\)\)\)/);
  // The copy is written before its account record, so a session never meets a half-made wardrobe.
  const create = store.slice(store.indexOf("export async function createDemoWardrobe"));
  assert.ok(create.indexOf("copies.map(Item=>") < create.indexOf("Item:demoProfile(id,now)"));
});

test("the sign-in screen offers both demos, and a demo workspace says it is one", () => {
  const panel = read("components/login-panel.tsx");
  assert.match(panel, /fetch\("\/api\/auth\/demo"/);
  assert.match(panel, /tryDemo\("consumer"\)\}>\{demoBusy\?"Opening…":"Try the demo →"\}/);
  assert.match(panel, /\{demoError&&<div className="form-error" role="alert">\{demoError\}<\/div>\}/, "a demo error shows beside the demo button");
  assert.match(panel, /tryDemo\("brand"\)/);
  assert.match(read("app/consumer/page.tsx"), /session\.demo&&<DemoNotice kind="consumer"\/>/);
  assert.match(read("app/brand/page.tsx"), /session\.demo&&<DemoNotice kind="brand"\/>/);
  assert.match(read("app/globals.css"), /\.demo-entry\{/);
  assert.match(read("app/globals.css"), /\.demo-notice\{/);
});
