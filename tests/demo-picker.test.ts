import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_BRAND_PRODUCT_LIMIT, DEMO_CHOICES, DEMO_SESSION_MS, demoBrandProfile, demoProfile, demoRoleOf, demoSessionKey, isDemoAccountId, isSharedDemoAccountId, newDemoAccountId, SHARED_DEMO_ACCOUNTS } from "../lib/demo-session.ts";
import { brandStatusOf } from "../lib/brand-approval.ts";
import { sessionForAccount } from "../lib/session.ts";
import { chargeAccountAllowance, chargeSiteModelCall } from "../lib/ai-budget.ts";
import { DEMO_SITE_CALL_SHARE, demoSiteCallLimit } from "../lib/abuse-limits.ts";

// The four-button demo (owner decision, 2026-11-03) and the demo half of the 2026-11-02 security
// review: the AI share demos may use, Brand Hanger counted per visitor, and the shared judge
// accounts that nobody may change.

// Line endings are normalised, so the checks read the same on Windows and in CI.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
process.env.RACKED_SEED_DRY_RUN = "yes";
const { JUDGE_SEED_IDS } = await import("../scripts/seed-judge-accounts.mjs");
const NOW = Date.parse("2026-11-17T15:00:00.000Z");
const store = read("lib/server/production-store.ts");
const section = (source: string, start: string) => source.slice(source.indexOf(start), source.indexOf("\n}\n", source.indexOf(start)) + 2);

test("the sign-in screen offers the four judge accounts, named as the README names them", () => {
  const readme = read("README.md");
  assert.deepEqual(DEMO_CHOICES.map((entry) => entry.label), ["Judge Consumer", "New Consumer", "Judge Brand", "New Brand"]);
  for (const { label } of DEMO_CHOICES) assert.match(readme, new RegExp(`^\\| ${label} \\|`, "m"), `${label} is a row of the README's judge table`);
  assert.deepEqual(DEMO_CHOICES.map((entry) => [entry.choice, entry.role]), [["judge-consumer", "consumer"], ["new-consumer", "consumer"], ["judge-brand", "brand"], ["new-brand", "brand"]]);
  for (const entry of DEMO_CHOICES) assert.equal(demoRoleOf(entry.choice), entry.role);
});

test("each seeded judge account opens its own demo, and nothing else is mistaken for one", () => {
  assert.deepEqual(SHARED_DEMO_ACCOUNTS, {
    [JUDGE_SEED_IDS.consumer.id]: "judge-consumer",
    [JUDGE_SEED_IDS.freshConsumer.id]: "new-consumer",
    [JUDGE_SEED_IDS.brand.id]: "judge-brand",
    [JUDGE_SEED_IDS.freshBrand.id]: "new-brand",
  });
  for (const id of Object.keys(SHARED_DEMO_ACCOUNTS)) assert.equal(isSharedDemoAccountId(id), true, id);
  for (const id of [newDemoAccountId("0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90"), "0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90", "demo-consumer-01", "toString", "__proto__", "", null]) {
    assert.equal(isSharedDemoAccountId(id), false, String(id));
  }
});

test("a seeded judge account is only ever open as a demo, so an old full session to one is refused", () => {
  const account = { role: "brand" as const, sessionVersion: 0 };
  const base = { subject: JUDGE_SEED_IDS.brand.id, role: "brand" as const, expiresAt: NOW + DEMO_SESSION_MS, sessionVersion: 0 };
  assert.equal(sessionForAccount(base, account), null, "a password session from before this change no longer works");
  assert.ok(sessionForAccount({ ...base, demo: "brand" }, account), "the demo session does");
  const consumer = { role: "consumer" as const, sessionVersion: 0 };
  assert.equal(sessionForAccount({ subject: JUDGE_SEED_IDS.consumer.id, role: "consumer", expiresAt: NOW + 1, sessionVersion: 0 }, consumer), null);
  assert.ok(sessionForAccount({ subject: "0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90", role: "consumer", expiresAt: NOW + 1, sessionVersion: 0 }, consumer), "a real account is untouched");
});

test("a password sign-in to a judge account opens the same demo as its button, before any session or log", () => {
  const login = read("app/api/auth/login/route.ts");
  const demoAt = login.indexOf("if(demo){");
  assert.ok(demoAt > login.indexOf("const account=await authenticateAccount(email,password);"), "only after the password is right");
  for (const later of ["twoStepEnabled(account)", "createSessionToken({subject:account.id", "recordAccountActivity(account.id", "knownDeviceCookie(email"]) {
    assert.ok(demoAt < login.indexOf(later), `the demo is opened before ${later}`);
  }
  assert.match(login, /const demo=Object\.hasOwn\(SHARED_DEMO_ACCOUNTS,account\.id\)\?SHARED_DEMO_ACCOUNTS\[account\.id\]:null;/);
  assert.match(login.slice(demoAt, demoAt + 400), /await claimDemoSession\(\)[\s\S]*return await openDemo\(demo,secret\);/, "it counts toward the site's demo ceiling too");
  const route = read("app/api/auth/demo/route.ts");
  assert.match(route, /const choice=demoChoiceOf\(body\?\.kind\);/);
  const entry = read("lib/server/demo-entry.ts");
  assert.match(entry, /if\(choice==="judge-consumer"\)subject=await createDemoWardrobe\(\);/);
  assert.match(entry, /else if\(choice==="new-consumer"\)subject=await createDemoWardrobe\(Date\.now\(\),\{empty:true\}\);/);
  assert.match(entry, /else if\(choice==="new-brand"\)subject=await createDemoBrand\(\);/);
});

test("the store refuses to change or delete a shared judge account, whatever route asks", () => {
  assert.match(store, /function refuseSharedDemoAccount\(accountId:string\)\{if\(isSharedDemoAccountId\(accountId\)\)throw new RequestRefused\(SHARED_DEMO_ACCOUNT_MESSAGE,403\);\}/);
  for (const name of ["updateOwnAccount(ownerId", "endOtherSessions(accountId", "deleteOwnConsumerAccount(ownerId", "beginTwoStepSetup(accountId"]) {
    const start = store.indexOf(`export async function ${name}`);
    assert.ok(start > 0, name);
    assert.match(store.slice(start, start + 260), /\n {2}refuseSharedDemoAccount\((ownerId|accountId)\);/, `${name} refuses first`);
  }
});

test("New Consumer is an empty private wardrobe; New Brand a private, approved, empty brand", () => {
  const brandId = newDemoAccountId("brand-0b5f3a54-8d1e-4c62-9a7e-2f4d6b8c1e90");
  const profile = demoBrandProfile(brandId, NOW);
  assert.equal(isDemoAccountId(brandId), true);
  assert.equal(profile.role, "brand");
  assert.equal(brandStatusOf(profile), "approved", "it can enrol straight away");
  assert.equal(profile.productCount, 0);
  assert.equal(profile.passwordHash, "", "nobody can sign in to it with a password");
  assert.equal("GSI1PK" in profile, false, "no email index, so no sign-in by email");
  assert.equal(profile.dataClassification, "DEMO");
  assert.equal(profile.ttl, demoProfile(brandId, NOW).ttl, "it expires with the other demos");
  assert.match(profile.brandSlug, /^new-demo-brand-[a-f0-9-]{8}$/);
  const create = section(store, "export async function createDemoWardrobe");
  assert.ok(create.indexOf("if(!empty){") < create.indexOf("copies.map(Item=>"), "New Consumer copies nothing");
  assert.match(section(store, "export async function createDemoBrand"), /Item:demoBrandProfile\(id,now\),ConditionExpression:"attribute_not_exists\(PK\)"/);
  assert.doesNotMatch(section(store, "export async function createDemoBrand"), /BRANDNAME#/, "it claims no brand name a real brand could want");
});

test("a New Brand product never joins the registry, so it never answers a real person's label or a public page", () => {
  // The registry is the GSI1 BRAND_PRODUCTS index: matching, search, public pages and Community
  // product cards all read it. Exactly one place writes those keys, and it leaves demos out.
  assert.equal(store.match(/GSI1PK:"BRAND_PRODUCTS"/g)?.length, 1);
  const index = section(store, "function registryIndex");
  assert.match(index, /return isDemoAccountId\(ownerId\)\?\{dataClassification:"DEMO",testCohort:true,demoSession:true,ttl:/);
  assert.match(section(store, "export async function saveBrandProduct"), /\.\.\.registryIndex\(ownerId,product\)/);
  assert.match(section(store, "export async function updateBrandProduct"), /\.\.\.registryIndex\(ownerId,existing\)/, "an edit cannot put it in either");
  assert.match(store, /export function brandProductLimit\(ownerId:string\)\{return isDemoAccountId\(ownerId\)\?DEMO_BRAND_PRODUCT_LIMIT:BRAND_PRODUCT_LIMIT;\}/);
  assert.equal(DEMO_BRAND_PRODUCT_LIMIT, 5);
  const enroll = read("app/api/brand/products/route.ts");
  assert.match(enroll, /brandProductCount\(access\.account\)>=brandProductLimit\(session\.subject\)/);
  assert.match(enroll, /putBrandImage\(session\.subject,image\.bytes,image\.contentType\)/);
  assert.match(section(store, "export async function putBrandImage"), /if\(!isDemoAccountId\(ownerId\)\)return putPrivateImage\(ownerId,"brand",bytes,contentType\);/, "a real brand's photos are stored as before");
  assert.match(section(store, "export async function putBrandImage"), /putPrivateImage\(ownerId,"brand",bytes,contentType,undefined,true\)/, "a demo's wait under temp/, which the bucket empties");
  const looks = section(store, "export async function saveBrandLook");
  assert.match(looks, /if\(demo&&input\.published\)throw new RequestRefused\(DEMO_LOOK_PUBLISH_MESSAGE,403\);/, "a demo brand never publishes to Community");
  assert.ok(looks.indexOf("DEMO_LOOK_PUBLISH_MESSAGE") < looks.indexOf("PutCommand"), "refused before anything is written");
});

test("only the shared demo brand is read-only; New Brand may write its own catalog", () => {
  assert.match(read("lib/server/brand-access.ts"), /if \(write && session\.demo && !isDemoAccountId\(session\.subject\)\) return \{ ok: false/);
  assert.equal(isDemoAccountId(JUDGE_SEED_IDS.brand.id), false, "Judge Brand stays read-only");
});

test("demos may use only their share of the day's AI, so real accounts keep the rest", async () => {
  const ceiling = 300;
  assert.equal(DEMO_SITE_CALL_SHARE, 0.8);
  assert.equal(demoSiteCallLimit(ceiling), 240);
  assert.equal(demoSiteCallLimit(1), 1);
  const counts = new Map<string, number>();
  const counter = async (name: string) => { counts.set(name, (counts.get(name) ?? 0) + 1); return { count: counts.get(name)!, resetAt: NOW + 1000 }; };
  let demoAllowed = 0;
  for (let call = 0; call < 1_000; call += 1) if (await chargeSiteModelCall(counter, NOW, ceiling, true)) demoAllowed += 1;
  assert.equal(demoAllowed, 240, "demos stop at their share however many are opened");
  assert.equal(counts.get("ai:site-calls"), 240, "a refused demo call spends nothing from the shared ceiling");
  let realAllowed = 0;
  for (let call = 0; call < 100; call += 1) if (await chargeSiteModelCall(counter, NOW, ceiling)) realAllowed += 1;
  assert.equal(realAllowed, 60, "real accounts still get the remaining 20%");
  assert.equal(await chargeSiteModelCall(counter, NOW, ceiling), false, "and the ceiling still holds for them");
  // Every model call is charged with the session's own spender.
  for (const path of ["app/api/agents/consumer/route.ts", "app/api/garments/detect/route.ts", "app/api/brand/products/describe/route.ts", "app/api/agents/brand/route.ts"]) {
    assert.doesNotMatch(read(path), /spendSiteModelCall/, `${path} uses siteModelCallFor`);
    assert.match(read(path), /siteModelCallFor\(session!?\)/, path);
  }
  assert.match(read("lib/server/abuse-guard.ts"), /export function siteModelCallFor\(session: \{ demo\?: unknown \}\) \{\n {2}const demo = Boolean\(session\.demo\);/);
});

test("Brand Hanger is counted per visitor on the shared demo brand, so one judge cannot use up the next one's", async () => {
  const route = read("app/api/agents/brand/route.ts");
  assert.match(route, /const spender = session\.demo \? demoSessionKey\(session\) : session\.subject;/);
  assert.match(route, /consumeRateLimit\(`brand-agent:\$\{spender\}`/);
  assert.match(route, /spendAiAllowance\("brand-hanger", spender\)/);
  const expiresAt = NOW + DEMO_SESSION_MS;
  const first = demoSessionKey({ demo: "brand", sid: "11111111-1111-4111-8111-111111111111", expiresAt });
  const second = demoSessionKey({ demo: "brand", sid: "22222222-2222-4222-8222-222222222222", expiresAt });
  const counts = new Map<string, number>();
  const counter = async (key: string) => { counts.set(key, (counts.get(key) ?? 0) + 1); return { count: counts.get(key)!, resetAt: NOW + 1000 }; };
  let firstAllowed = 0;
  for (let question = 0; question < 60; question += 1) if ((await chargeAccountAllowance(counter, "brand-hanger", first, NOW)).allowed) firstAllowed += 1;
  assert.equal(firstAllowed, 30, "a demo visitor gets the demo allowance, not the shared account's 60");
  assert.equal((await chargeAccountAllowance(counter, "brand-hanger", second, NOW)).allowed, true, "the next judge's is untouched");
  assert.equal((await chargeAccountAllowance(counter, "brand-hanger", JUDGE_SEED_IDS.brand.id, NOW)).allowed, true);
});

test("every demo counts toward the site's hourly demo ceiling, brand demos included", () => {
  assert.match(read("app/api/auth/demo/route.ts"), /const bySite=byAddress\.allowed\?await claimDemoSession\(\):byAddress;/);
  assert.match(read("lib/abuse-limits.ts"), /demoSessionsSiteWide: \{ limit: 120, windowMs: 60 \* 60 \* 1000 \}/);
});

test("a New Brand demo says it is private, and the shared one that it is read-only", () => {
  const notice = read("components/demo-notice.tsx");
  assert.match(notice, /export function DemoNotice\(\{ kind, own = false \}/);
  assert.match(notice, /Enrol up to \$\{DEMO_BRAND_PRODUCT_LIMIT\} products/);
  assert.match(notice, /read-only so everyone sees the same one/);
  assert.match(read("app/globals.css"), /\.demo-choices\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(read("app/globals.css"), /@media\(max-width:480px\)\{\.demo-choices\{grid-template-columns:1fr\}\}/, "one column on a phone");
});
