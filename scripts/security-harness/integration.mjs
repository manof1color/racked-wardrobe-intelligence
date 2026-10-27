// Integration checks against a local production build (next start) backed by local DynamoDB.
// Synthetic accounts and products only; nothing here can reach AWS (every AWS endpoint is local).
// See docs/security-verification.md. Run from the repository root:
//   HARNESS_SESSION_SECRET=<the server's SESSION_SECRET> node scripts/security-harness/integration.mjs
import { createHmac, randomBytes, randomInt, scryptSync } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const SECRET = process.env.HARNESS_SESSION_SECRET, TABLE = process.env.HARNESS_TABLE ?? "racked-harness";
if (!SECRET) throw new Error("Set HARNESS_SESSION_SECRET to the local server's SESSION_SECRET.");
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-2", endpoint: "http://127.0.0.1:4568", credentials: { accessKeyId: "harness-local", secretAccessKey: "harness-local" } }));
const BASE = process.env.HARNESS_BASE_URL ?? "http://localhost:3100", ORIGIN = BASE;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("The harness only runs against a local server.");
const run = randomBytes(6).toString("hex").slice(0, 6);
// Every simulated client gets an address of its own each run, so a rerun never meets the last run's per-client counters.
const net = 1 + randomInt(250);
const address = (host) => `198.18.${net}.${host}`;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A browser: its own cookies and its own client address, as CloudFront would append it. */
function browser(address) {
  const jar = new Map();
  return {
    jar,
    async request(method, route, body) {
      const cookies = [...jar.values()].filter((cookie) => route.startsWith(cookie.path)).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      const response = await fetch(`${BASE}${route}`, { method, headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": address, ...(cookies ? { cookie: cookies } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const header of response.headers.getSetCookie()) {
        const [pair, ...attributes] = header.split(";").map((part) => part.trim());
        const [name, ...value] = pair.split("=");
        const cookiePath = attributes.find((attribute) => attribute.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
        if (/max-age=0/i.test(header) || value.join("=") === "") jar.delete(name); else jar.set(name, { name, value: value.join("="), path: cookiePath });
      }
      const text = await response.text();
      let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: response.status, json, text };
    },
  };
}

const formToken = () => { const issuedAt = String(Date.now()); return `${issuedAt}.${createHmac("sha256", SECRET).update(`racked-form:${issuedAt}`).digest("base64url")}`; };
const accountId = async (email) => {
  const found = await db.send(new QueryCommand({ TableName: TABLE, IndexName: "GSI1", KeyConditionExpression: "GSI1PK = :pk", ExpressionAttributeValues: { ":pk": `EMAIL#${email}` } }));
  return String(found.Items?.[0]?.PK ?? "").replace(/^USER#/, "");
};
const securityKey = (value) => createHmac("sha256", SECRET).update(`racked-security:${value}`).digest("base64url").slice(0, 32);
const PASSWORD = `Harness-${run}-Pass1`;

// ── Accounts ────────────────────────────────────────────────────────────────
const a = browser(address(10)), b = browser(address(11)), x = browser(address(12)), y = browser(address(13));
const emails = { a: `harness-a-${run}@example.test`, b: `harness-b-${run}@example.test`, x: `harness-x-${run}@example.test`, y: `harness-y-${run}@example.test` };
const tokens = { a: formToken(), b: formToken(), x: formToken(), y: formToken() };
await sleep(2_700);
const registered = await Promise.all([
  a.request("POST", "/api/auth/register", { email: emails.a, password: PASSWORD, role: "consumer", displayName: "Harness A", consent: true, formToken: tokens.a, website: "" }),
  b.request("POST", "/api/auth/register", { email: emails.b, password: PASSWORD, role: "consumer", displayName: "Harness B", consent: true, formToken: tokens.b, website: "" }),
  x.request("POST", "/api/auth/register", { email: emails.x, password: PASSWORD, role: "brand", displayName: "Harness X", brandName: `Harness Brand X ${run}`, formToken: tokens.x, website: "" }),
  y.request("POST", "/api/auth/register", { email: emails.y, password: PASSWORD, role: "brand", displayName: "Harness Y", brandName: `Harness Brand Y ${run}`, formToken: tokens.y, website: "" }),
]);
check("four synthetic accounts register through the real bot trap", registered.every((response) => response.status === 201), registered.map((response) => response.status).join(","));
check("registration marks the browser as a known device", a.jar.has("racked_known_device") && a.jar.get("racked_known_device").path === "/api/auth");
const ids = { a: await accountId(emails.a), b: await accountId(emails.b), x: await accountId(emails.x), y: await accountId(emails.y) };
const adminRole = await browser(address(14)).request("POST", "/api/auth/register", { email: `harness-admin-${run}@example.test`, password: PASSWORD, role: "admin", displayName: "Admin", consent: true, formToken: formToken(), website: "" });
check("an unsupported role is refused at sign-up", adminRole.status === 400, String(adminRole.status));

// ── Seed synthetic wardrobe and catalog records directly ────────────────────
const put = (item) => db.send(new PutCommand({ TableName: TABLE, Item: item }));
const garment = (owner, id, extra = {}) => put({ PK: `USER#${owner}`, SK: `GARMENT#${id}`, id, name: `Harness ${id}`, category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", style: ["casual"], season: "all-season", wearCount: 0, source: "ai-confirmed", art: "photo", createdAt: new Date().toISOString(), GSI1SK: `OWNER#${owner}`, ...extra });
const product = (owner, id, brand) => put({ PK: `USER#${owner}`, SK: `PRODUCT#${id}`, GSI1PK: "BRAND_PRODUCTS", GSI1SK: `${brand.toLowerCase().replace(/\W+/g, "-")}#${id.toUpperCase()}`, id, ownerSubject: owner, name: `Harness ${id}`, brand, brandSlug: brand.toLowerCase().replace(/\W+/g, "-"), aliases: [], sku: id.toUpperCase(), category: "top", subtype: "t-shirt", color: "navy", parts: [], createdAt: new Date().toISOString() });
const PX = `registry-px-${run}`;
await product(ids.x, PX, `Harness Brand X ${run}`);
for (let index = 0; index < 12; index++) await product(ids.y, `registry-py${index}-${run}`, `Harness Brand Y ${run}`);
await garment(ids.a, "ga1", { GSI1PK: `PRODUCT#${PX}` });
await garment(ids.a, "ga2");
await garment(ids.a, "ga3");
for (let index = 0; index < 20; index++) await garment(ids.a, `ga-extra-${index}`, { GSI1PK: `PRODUCT#${PX}`, wearCount: 0 });
await garment(ids.b, "gb1", { GSI1PK: `PRODUCT#${PX}` });
await garment(ids.b, "gb2");
// 24 consenting owners and 6 who never opted in, all with the brand's product. Two consenting owners
// wear it six or more times: a group small enough to single out.
const cohortCounts = [...Array(8).fill(0), ...Array(8).fill(1), ...Array(6).fill(3), 9, 12];
for (let index = 0; index < 24; index++) {
  const owner = `harness-cohort-${run}-${index}`;
  await put({ PK: `USER#${owner}`, SK: "PROFILE", id: owner, role: "consumer", brandDataSharing: true });
  await garment(owner, `gc${index}`, { GSI1PK: `PRODUCT#${PX}`, wearCount: cohortCounts[index] });
  if (cohortCounts[index]) await put({ PK: `PRODUCT#${PX}`, SK: `WEAR#2026-10-20T0${index % 10}:13:47.512Z#${index}`, occurredAt: `2026-10-20T0${index % 10}:13:47.512Z`, ownerPK: `USER#${owner}`, garmentId: `gc${index}`, eventType: "confirmed-wear" });
}
for (let index = 0; index < 6; index++) {
  const owner = `harness-private-${run}-${index}`;
  await put({ PK: `USER#${owner}`, SK: "PROFILE", id: owner, role: "consumer", brandDataSharing: false });
  await garment(owner, `gn${index}`, { GSI1PK: `PRODUCT#${PX}`, wearCount: 40 });
}

// ── Sign-in lockout protection ──────────────────────────────────────────────
const attacker = browser(address(66));
const wrong = [];
for (let attempt = 0; attempt < 9; attempt++) wrong.push((await attacker.request("POST", "/api/auth/login", { email: emails.a, password: "Wrong-password-1" })).status);
check("eight wrong passwords are refused, the ninth pauses the email address", wrong.slice(0, 8).every((status) => status === 401) && wrong[8] === 429, wrong.join(","));
const newDevice = await browser(address(20)).request("POST", "/api/auth/login", { email: emails.a, password: PASSWORD });
check("without a known-device cookie the owner would be paused too (the lockout being prevented)", newDevice.status === 429, String(newDevice.status));
const ownerLogin = await a.request("POST", "/api/auth/login", { email: emails.a, password: PASSWORD });
check("REGRESSION: the owner's known device signs in through the attacker's pause", ownerLogin.status === 200, String(ownerLogin.status));
const spoofStatuses = [];
for (let attempt = 0; attempt < 12; attempt++) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": `10.9.${attempt}.1, ${address(77)}` }, body: JSON.stringify({ email: `nobody-${run}-${attempt}@example.test`, password: "Wrong-password-1" }) });
  spoofStatuses.push(response.status);
}
check("REGRESSION: rotating made-up X-Forwarded-For addresses does not reset the per-client limit", spoofStatuses.filter((status) => status === 429).length >= 2, spoofStatuses.join(","));

// ── A copied known-device cookie has a failure budget of its own ────────────
const stolen = x.jar.get("racked_known_device");
const copyStatuses = [];
for (let attempt = 0; attempt < 10; attempt++) {
  const thief = browser(address(100 + attempt));
  thief.jar.set("racked_known_device", stolen);
  copyStatuses.push((await thief.request("POST", "/api/auth/login", { email: emails.x, password: "Wrong-password-1" })).status);
}
check("REGRESSION: a copied known-device cookie used from ten addresses is paused after eight wrong passwords", copyStatuses.slice(0, 8).every((status) => status === 401) && copyStatuses.slice(8).every((status) => status === 429), copyStatuses.join(","));

// ── Passwords: an old-cost hash signs in and is upgraded; timing reveals nothing ──
const legacyAccount = async (label) => {
  const id = `harness-legacy-${label}-${run}`, email = `${id}@example.test`, salt = randomBytes(18).toString("base64url");
  await put({ PK: `USER#${id}`, SK: "PROFILE", GSI1PK: `EMAIL#${email}`, GSI1SK: "ACCOUNT", id, email, role: "consumer", displayName: "Harness legacy", brandName: null, brandSlug: null, passwordHash: scryptSync(PASSWORD, salt, 64).toString("base64url"), passwordSalt: salt, createdAt: new Date().toISOString(), sessionVersion: 0 });
  return { id, email };
};
const legacy = await legacyAccount("upgrade");
const legacyBefore = (await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${legacy.id}`, SK: "PROFILE" } }))).Item;
const legacyLogin = await browser(address(130)).request("POST", "/api/auth/login", { email: legacy.email, password: PASSWORD });
const legacyAfter = (await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${legacy.id}`, SK: "PROFILE" } }))).Item;
const againLogin = await browser(address(131)).request("POST", "/api/auth/login", { email: legacy.email, password: PASSWORD });
const legacyWrong = await browser(address(132)).request("POST", "/api/auth/login", { email: legacy.email, password: "Wrong-password-1" });
check("REGRESSION: an account hashed at the old scrypt cost signs in and is re-hashed at N = 2^17 with a new salt", legacyLogin.status === 200 && legacyBefore.passwordScheme === undefined && legacyAfter.passwordScheme === "scrypt-n17" && legacyAfter.passwordSalt !== legacyBefore.passwordSalt && legacyAfter.passwordHash !== legacyBefore.passwordHash && legacyAfter.sessionVersion === 0 && againLogin.status === 200 && legacyWrong.status === 401, `${legacyLogin.status},${againLogin.status},${legacyWrong.status}`);
const registeredRecord = (await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${ids.b}`, SK: "PROFILE" } }))).Item;
check("a new account is hashed at the current cost with an 18-byte salt", registeredRecord.passwordScheme === "scrypt-n17" && Buffer.from(registeredRecord.passwordSalt, "base64url").length === 18);
const slowLegacy = await legacyAccount("timing");
const timed = async (email, host) => { const started = performance.now(); await browser(address(host)).request("POST", "/api/auth/login", { email, password: "Wrong-password-1" }); return performance.now() - started; };
const median = (values) => values.sort((left, right) => left - right)[Math.floor(values.length / 2)];
const timings = { unknown: [], legacy: [], current: [] };
for (let round = 0; round < 5; round++) {
  timings.unknown.push(await timed(`nobody-timing-${run}-${round}@example.test`, 140 + round));
  timings.legacy.push(await timed(slowLegacy.email, 150 + round));
  timings.current.push(await timed(emails.y, 160 + round));
}
const medians = Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, Math.round(median(values))]));
check("sign-in takes the same time for an unknown email, an old hash, and a new hash", Math.max(...Object.values(medians)) / Math.min(...Object.values(medians)) < 1.35, JSON.stringify(medians) + " ms (median of 5)");

// ── Activity is the owner's alone; signing out other devices keeps this one ──
const activityA = await a.request("GET", "/api/account/activity");
const activityB = await b.request("GET", "/api/account/activity");
const typesA = (activityA.json?.activity ?? []).map((entry) => entry.type);
check("the owner sees failed attempts on their email and their sign-ins", typesA.filter((type) => /fail/.test(type)).length >= 8 && typesA.some((type) => type === "sign-in"), typesA.slice(0, 12).join(","));
check("another account's activity log shows none of them", !(activityB.json?.activity ?? []).some((entry) => /fail/.test(entry.type)) && JSON.stringify(activityB.json).indexOf(emails.a) < 0);
check("activity entries carry a device label and no IP address", !/198\.51|203\.0|\b\d{1,3}(\.\d{1,3}){3}\b/.test(JSON.stringify(activityA.json?.activity ?? [])));
const second = browser(address(21));
second.jar.set("racked_known_device", a.jar.get("racked_known_device"));
const secondLogin = await second.request("POST", "/api/auth/login", { email: emails.a, password: PASSWORD });
const ended = await a.request("DELETE", "/api/account/sessions");
const secondAfter = await second.request("GET", "/api/consumer/wardrobe");
const firstAfter = await a.request("GET", "/api/consumer/wardrobe");
check("signing out other devices ends the other session and keeps this one", secondLogin.status === 200 && ended.status === 200 && secondAfter.status === 403 && firstAfter.status === 200, [secondLogin.status, ended.status, secondAfter.status, firstAfter.status].join(","));

// ── Outfits: ownership, validation, and no silent wear ──────────────────────
const saved = await a.request("POST", "/api/consumer/outfits", { name: "Harness look", itemIds: ["ga1", "ga2"] });
const outfitId = saved.json?.outfit?.id;
check("an outfit of the person's own pieces saves", saved.status === 201 && Boolean(outfitId), String(saved.status));
const mixed = await a.request("POST", "/api/consumer/outfits", { itemIds: ["ga1", "gb1"] });
check("an outfit naming another account's piece is refused", mixed.status === 400, String(mixed.status));
const privileged = await a.request("POST", "/api/consumer/outfits", { itemIds: ["ga1"], ownerId: ids.b });
check("an ownerId in the body is refused, not obeyed", privileged.status === 400 && /does not accept/.test(privileged.json?.error ?? ""), privileged.json?.error);
const flood = await a.request("POST", "/api/consumer/outfits", { itemIds: Array.from({ length: 40 }, (_, index) => `ga${index}`) });
const wrongType = await a.request("POST", "/api/consumer/outfits", { itemIds: "ga1" });
const badId = await a.request("POST", "/api/consumer/outfits", { itemIds: ["../../USER#x"] });
check("oversized lists, wrong types, and malformed IDs are refused", [flood.status, wrongType.status, badId.status].every((status) => status === 400), [flood.status, wrongType.status, badId.status].join(","));
const bPatch = await b.request("PATCH", "/api/consumer/outfits", { outfitId, itemIds: ["gb1"] });
const bDelete = await b.request("DELETE", "/api/consumer/outfits", { outfitId });
check("another consumer cannot edit or delete the outfit", bPatch.status === 404 && bDelete.status === 404, `${bPatch.status},${bDelete.status}`);
const wardrobeAfterSave = await a.request("GET", "/api/consumer/wardrobe");
const countOf = (response, id) => response.json?.items?.find((item) => item.id === id)?.wearCount;
check("saving an outfit records no wear", countOf(wardrobeAfterSave, "ga1") === 0 && countOf(wardrobeAfterSave, "ga2") === 0);

// ── Wear recording: exactly once, all or nothing, owner only ────────────────
const wearEvents = async () => (await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `PRODUCT#${PX}`, ":sk": "WEAR#" } }))).Items.filter((event) => event.ownerPK === `USER#${ids.a}`).length;
const first = await a.request("POST", "/api/wears", { itemIds: ["ga1", "ga2"], outfitId, requestId: "harness-request-1" });
check("a wear records once on every piece and the outfit", first.status === 201 && first.json?.counts?.ga1 === 1 && first.json?.counts?.ga2 === 1 && first.json?.outfitWears === 1, JSON.stringify(first.json));
const retry = await a.request("POST", "/api/wears", { itemIds: ["ga1", "ga2"], outfitId, requestId: "harness-request-1" });
const doubleTap = await a.request("POST", "/api/wears", { itemIds: ["ga2", "ga1"], outfitId, requestId: "harness-request-2" });
check("REGRESSION: a retried request and a double tap change nothing", retry.status === 200 && retry.json?.duplicate === true && doubleTap.status === 200 && doubleTap.json?.duplicate === true, `${retry.status}/${retry.json?.duplicate}, ${doubleTap.status}/${doubleTap.json?.duplicate}`);
const partial = await a.request("POST", "/api/wears", { itemIds: ["ga3", "gb1"], requestId: "harness-request-3" });
const afterPartial = await a.request("GET", "/api/consumer/wardrobe");
check("REGRESSION: a wear naming another account's piece is refused whole — nothing is counted", partial.status === 404 && countOf(afterPartial, "ga3") === 0, `${partial.status}, ga3=${countOf(afterPartial, "ga3")}`);
const ownerField = await a.request("POST", "/api/wears", { itemId: "ga3", ownerId: ids.b });
check("a privileged field on a wear is refused", ownerField.status === 400, String(ownerField.status));
const bOnA = await b.request("POST", "/api/wears", { itemIds: ["ga1"] });
const bOnAOutfit = await b.request("POST", "/api/wears", { itemIds: ["gb1"], outfitId });
check("another consumer cannot record a wear on A's piece or outfit", bOnA.status === 404 && bOnAOutfit.status === 404, `${bOnA.status},${bOnAOutfit.status}`);
const afterAll = await a.request("GET", "/api/consumer/wardrobe");
check("final counts match one recorded wear", countOf(afterAll, "ga1") === 1 && countOf(afterAll, "ga2") === 1 && afterAll.json?.outfits?.find((outfit) => outfit.id === outfitId)?.wears === 1);
check("exactly one wear event reached the brand product's index", (await wearEvents()) === 1, String(await wearEvents()));

// ── Consent input, roles, and brand isolation ───────────────────────────────
const consentString = await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: "yes" });
const consentExtra = await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: true, accountId: ids.b });
check("consent accepts only a boolean, and nothing else", consentString.status === 400 && consentExtra.status === 400, `${consentString.status},${consentExtra.status}`);
const consumerOnBrand = await a.request("POST", "/api/brand/metrics", { productId: PX });
const brandOnWears = await x.request("POST", "/api/wears", { itemIds: ["ga1"] });
check("roles hold in both directions", consumerOnBrand.status === 403 && brandOnWears.status === 403, `${consumerOnBrand.status},${brandOnWears.status}`);
const xOnY = await x.request("POST", "/api/brand/metrics", { productId: `registry-py0-${run}` });
const xLookOnY = await x.request("POST", "/api/brand/looks", { title: "Harness look", caption: "Harness caption", productIds: [`registry-py0-${run}`] });
check("Brand X cannot read Brand Y's analytics or put Y's product in a Look", xOnY.status === 404 && xLookOnY.status >= 400 && xLookOnY.status < 500, `${xOnY.status},${xLookOnY.status}`);

// ── The cohort threshold, distinct owners, consent, and small cells ─────────
const before = await x.request("POST", "/api/brand/metrics", { productId: PX });
check("24 consenting owners stay suppressed, the count withheld too", before.status === 200 && before.json?.metrics?.suppressed === true && before.json?.metrics?.segmentSize === 0, JSON.stringify({ suppressed: before.json?.metrics?.suppressed, size: before.json?.metrics?.segmentSize }));
const consentRecords = async () => ((await db.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)", ExpressionAttributeValues: { ":pk": `USER#${ids.a}`, ":sk": "CONSENT#" } }))).Items ?? []);
const neverAsked = await a.request("GET", "/api/consumer/consent");
const offWhileOff = await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: false });
check("turning sharing off when it was never on writes no record", neverAsked.json?.brandDataSharing === false && neverAsked.json?.terms === null && offWhileOff.status === 200 && (await consentRecords()).length === 0, JSON.stringify(neverAsked.json));
await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: true });
const onAgain = await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: true });
const afterOn = await consentRecords();
const sharingNow = await a.request("GET", "/api/consumer/consent");
check("turning sharing on records it once, with the wording shown", onAgain.status === 200 && afterOn.length === 1 && afterOn[0].sharing === true && afterOn[0].terms === "2026-10-27" && afterOn[0].ttl === undefined && sharingNow.json?.brandDataSharing === true && sharingNow.json?.terms === "2026-10-27" && sharingNow.json?.currentTerms === "2026-10-27", JSON.stringify({ records: afterOn.length, terms: sharingNow.json?.terms }));
const released = await x.request("POST", "/api/brand/metrics", { productId: PX });
const metrics = released.json?.metrics ?? {};
check("A opting in makes 25 distinct owners: released, and A's 21 linked garments count once", metrics.suppressed === false && metrics.segmentSize === 25, `size=${metrics.segmentSize}`);
check("owners who never opted in are excluded (their 240 wears are absent)", metrics.actualWears === cohortCounts.reduce((sum, count) => sum + count, 0) + 1, `actualWears=${metrics.actualWears}`);
check("CONSENT HISTORY: A's wear recorded before opting in is counted once A opts in", metrics.actualWears === cohortCounts.reduce((sum, count) => sum + count, 0) + 1);
check("the latest wear is released as a day, not an instant", typeof metrics.lastWearAt === "string" && metrics.lastWearAt.endsWith("T12:00:00.000Z"), metrics.lastWearAt);
check("a group of two heavy wearers is withheld", metrics.highFrequencyOwners === null && (metrics.withheld ?? []).includes("highFrequencyOwners"), JSON.stringify(metrics.withheld));
check("no owner ID, email, or garment reaches the brand", !/USER#|harness-cohort|harness-private|@example\.test|"gc\d|"gn\d/.test(released.text));
await a.request("PATCH", "/api/consumer/consent", { brandDataSharing: false });
const withdrawn = await x.request("POST", "/api/brand/metrics", { productId: PX });
check("withdrawing consent drops the cohort below the threshold at once", withdrawn.json?.metrics?.suppressed === true, String(withdrawn.json?.metrics?.suppressed));
const afterOff = (await consentRecords()).sort((left, right) => String(left.at).localeCompare(String(right.at)));
const sharingTypes = ((await a.request("GET", "/api/account/activity")).json?.activity ?? []).map((entry) => entry.type).filter((type) => type.startsWith("brand-sharing"));
check("the withdrawal is a second record; the owner sees each change once in their activity", afterOff.length === 2 && afterOff[1].sharing === false && sharingTypes.filter((type) => type === "brand-sharing-on").length === 1 && sharingTypes.filter((type) => type === "brand-sharing-off").length === 1, JSON.stringify({ records: afterOff.map((record) => record.sharing), sharingTypes }));

// ── Concurrent enumeration ──────────────────────────────────────────────────
const burst = await Promise.all(Array.from({ length: 12 }, (_, index) => y.request("POST", "/api/brand/metrics", { productId: `registry-py${index}-${run}` })));
const statuses = burst.map((response) => response.status);
check("REGRESSION: twelve products opened at once release at most six", statuses.filter((status) => status === 200).length <= 6 && statuses.filter((status) => status === 429).length >= 6, statuses.join(","));

// ── AI budget: every model call is metered, and the ceiling stops the agent ─
const replies = [];
for (let turn = 0; turn < 3; turn++) replies.push(await a.request("POST", "/api/agents/consumer", { message: "What should I wear to dinner tonight?" }));
const reasons = replies.map((response) => response.json?.reply?.degradedReason ?? `status ${response.status}`);
check("Hanger keeps answering from the wardrobe while the model is unavailable", replies.every((response) => response.status === 200), reasons.join(" | "));
check("the site ceiling (3 model calls here) stops further calls and says why", reasons.at(-1) === "the AI is paused to protect the service", reasons.at(-1));
const day = Math.floor(Date.now() / 86_400_000) * 86_400_000;
const siteCalls = await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `LIMIT#${securityKey("ai:site-calls")}`, SK: `WINDOW#${day}` } }));
const accountRequests = await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `LIMIT#${securityKey(`ai:hanger:${ids.a}`)}`, SK: `WINDOW#${day}` } }));
check("the site counter counts model calls, the account counter counts messages", Number(siteCalls.Item?.count) >= 4 && Number(accountRequests.Item?.count) === 3, `site calls attempted=${siteCalls.Item?.count}, account messages=${accountRequests.Item?.count}`);

// ── Two-step sign-in (brand accounts) ───────────────────────────────────────
// The harness computes codes the way an authenticator app does (RFC 6238), from the key setup shows.
const base32Decode = (text) => { let bits = 0, value = 0; const out = []; for (const char of text) { value = ((value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char)) & 0xffff; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const stepNow = () => Math.floor(Date.now() / 30_000);
const codeAt = (key, step) => { const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(step)); const digest = createHmac("sha1", key).update(message).digest(); return String((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0"); };
const wrongCode = (key) => { const valid = [-1, 0, 1].map((offset) => codeAt(key, stepNow() + offset)); let guess = 0; while (valid.includes(String(guess).padStart(6, "0"))) guess++; return String(guess).padStart(6, "0"); };
// A code is accepted once, so each new one waits for the next 30-second step.
let usedStep = -1;
const freshCode = async (key) => { while (stepNow() <= usedStep) await sleep(1_000); usedStep = stepNow(); return codeAt(key, usedStep); };
const signInAs = async (email, host) => { const device = browser(address(host)); const response = await device.request("POST", "/api/auth/login", { email, password: PASSWORD }); return { device, response }; };
const emailT = `harness-t-${run}@example.test`, t = browser(address(40)), tokenT = formToken();
await sleep(2_700);
const registeredT = await t.request("POST", "/api/auth/register", { email: emailT, password: PASSWORD, role: "brand", displayName: "Harness T", brandName: `Harness Brand T ${run}`, formToken: tokenT, website: "" });
const idT = await accountId(emailT);
const { device: earlier } = await signInAs(emailT, 41);
const consumerSetup = await a.request("POST", "/api/account/two-step/setup", { currentPassword: PASSWORD });
const wrongPasswordSetup = await t.request("POST", "/api/account/two-step/setup", { currentPassword: "Wrong-password-1" });
check("two-step setup is for brand accounts, and needs the password", registeredT.status === 201 && consumerSetup.status === 403 && wrongPasswordSetup.status === 401, `${registeredT.status},${consumerSetup.status},${wrongPasswordSetup.status}`);
const setup = await t.request("POST", "/api/account/two-step/setup", { currentPassword: PASSWORD });
const key = base32Decode(setup.json?.secret ?? "");
const confirmWrong = await t.request("POST", "/api/account/two-step/confirm", { code: wrongCode(key) });
const confirmed = await t.request("POST", "/api/account/two-step/confirm", { code: await freshCode(key) });
const recovery = confirmed.json?.recoveryCodes ?? [];
check("a wrong first code is refused; the right one turns it on with ten recovery codes", setup.status === 200 && setup.json?.uri?.startsWith("otpauth://totp/Racked:") && confirmWrong.status === 400 && confirmed.status === 200 && recovery.length === 10, `${setup.status},${confirmWrong.status},${confirmed.status},${recovery.length}`);
const profileT = (await db.send(new GetCommand({ TableName: TABLE, Key: { PK: `USER#${idT}`, SK: "PROFILE" } }))).Item ?? {};
const storedT = JSON.stringify(profileT, (_, value) => value instanceof Set ? [...value] : value);
check("the table holds the secret sealed and recovery codes only as hashes", String(profileT.twoStepSecret).startsWith("v1.") && !storedT.includes(setup.json?.secret) && recovery.every((code) => !storedT.includes(code) && !storedT.includes(code.replaceAll("-", ""))) && profileT.twoStepPendingSecret === undefined && profileT.twoStepRecovery?.size === 10);
const earlierAfter = await earlier.request("GET", "/api/account"), tAfter = await t.request("GET", "/api/account");
check("turning it on signs every other device out, and keeps this one", earlierAfter.status === 401 && tAfter.status === 200, `${earlierAfter.status},${tAfter.status}`);
const { device: pending, response: passwordOnly } = await signInAs(emailT, 42);
const pendingAccount = await pending.request("GET", "/api/account");
check("the right password alone gets a five-minute challenge, not a session", passwordOnly.status === 200 && passwordOnly.json?.twoStep === true && !pending.jar.has("racked_session") && pending.jar.get("racked_two_step")?.path === "/api/auth/two-step" && pendingAccount.status === 401, JSON.stringify(passwordOnly.json));
const wrongAtSignIn = await pending.request("POST", "/api/auth/two-step", { code: wrongCode(key) });
const sawWrong = ((await t.request("GET", "/api/account/activity")).json?.activity ?? []).some((entry) => entry.type === "two-step-failed");
check("a wrong code is refused, and the owner sees that someone has their password", wrongAtSignIn.status === 401 && sawWrong, `${wrongAtSignIn.status},${sawWrong}`);
const goodCode = await freshCode(key);
const signedIn = await pending.request("POST", "/api/auth/two-step", { code: goodCode });
const inside = await pending.request("GET", "/api/account");
const { device: replayer } = await signInAs(emailT, 43);
const replay = await replayer.request("POST", "/api/auth/two-step", { code: goodCode });
check("the right code signs in; the same code cannot sign in again", signedIn.status === 200 && signedIn.json?.destination === "/brand" && inside.status === 200 && !pending.jar.has("racked_two_step") && replay.status === 401 && !replayer.jar.has("racked_session"), `${signedIn.status},${inside.status},${replay.status}`);
const { device: recovering } = await signInAs(emailT, 44);
const withRecovery = await recovering.request("POST", "/api/auth/two-step", { recoveryCode: recovery[0].toUpperCase() });
const { device: again } = await signInAs(emailT, 45);
const reused = await again.request("POST", "/api/auth/two-step", { recoveryCode: recovery[0] });
check("a recovery code signs in once, and only once", withRecovery.status === 200 && withRecovery.json?.recoveryCodesLeft === 9 && reused.status === 401, `${withRecovery.status},${withRecovery.json?.recoveryCodesLeft},${reused.status}`);
const limited = await again.request("POST", "/api/auth/two-step", { recoveryCode: recovery[1] });
check("a sixth code in fifteen minutes waits, even a right one", limited.status === 429, String(limited.status));
await db.send(new DeleteCommand({ TableName: TABLE, Key: { PK: `LIMIT#${securityKey(`two-step-attempts:${idT}`)}`, SK: `WINDOW#${Math.floor(Date.now() / 900_000) * 900_000}` } }));
const replaced = await t.request("POST", "/api/account/two-step/recovery-codes", { code: await freshCode(key) });
const offWithOld = await t.request("DELETE", "/api/account/two-step", { currentPassword: PASSWORD, recoveryCode: recovery[1] });
check("new recovery codes replace every unused old one", replaced.status === 200 && replaced.json?.recoveryCodes?.length === 10 && offWithOld.status === 401, `${replaced.status},${offWithOld.status}`);
const offWrongPassword = await t.request("DELETE", "/api/account/two-step", { currentPassword: "Wrong-password-1", recoveryCode: replaced.json?.recoveryCodes?.[0] });
const turnedOff = await t.request("DELETE", "/api/account/two-step", { currentPassword: PASSWORD, recoveryCode: replaced.json?.recoveryCodes?.[0] });
const { device: plain, response: plainLogin } = await signInAs(emailT, 46);
const twoStepTypes = new Set(((await t.request("GET", "/api/account/activity")).json?.activity ?? []).map((entry) => entry.type));
check("turning it off needs the password and a code; then the password alone signs in", offWrongPassword.status === 401 && turnedOff.status === 200 && plainLogin.json?.destination === "/brand" && plain.jar.has("racked_session") && ["two-step-on", "recovery-code-used", "recovery-codes-replaced", "two-step-off"].every((type) => twoStepTypes.has(type)), `${offWrongPassword.status},${turnedOff.status},${JSON.stringify(plainLogin.json)}`);

// ── Errors say nothing about the server ─────────────────────────────────────
const malformed = await a.request("POST", "/api/consumer/outfits", { itemIds: [{ $ne: null }] });
check("a malformed body gets a plain refusal", malformed.status === 400 && !/TypeError|stack|at \w+ \(/.test(malformed.text), malformed.json?.error);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; failed: ${failed.map((result) => result.name).join(" | ")}` : ""}`);
console.log(JSON.stringify({ accounts: { a: ids.a, b: ids.b }, outfitId, run }));
process.exit(failed.length ? 1 : 0);
