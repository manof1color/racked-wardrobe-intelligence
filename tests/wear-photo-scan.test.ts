import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { parseLookGarmentDetections, type DetectedLookGarment } from "../lib/look-garment-detection.ts";
import { consumeRateLimit, RATE_LIMIT_RULES, resetRateLimits } from "../lib/rate-limit.ts";
import type { WardrobeItem } from "../lib/types.ts";
import { handleWearPhotoScan, type WearPhotoScanDependencies, type WearPhotoSession } from "../lib/wear-photo-scan.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const closet: WardrobeItem[] = [
  { id: "own-jeans", name: "Light Wash Straight Jeans", category: "bottom", subtype: "jeans", color: "light wash blue", pattern: "solid", material: "denim", style: [], season: "all-season", wearCount: 4, lastWornDays: 3, source: "ai-confirmed", art: "denim" },
  { id: "own-tee", name: "White Tee", category: "top", subtype: "t-shirt", color: "white", pattern: "solid", material: "cotton", style: [], season: "all-season", wearCount: 9, lastWornDays: 1, source: "ai-confirmed", art: "ivory" },
];

function detections(): DetectedLookGarment[] {
  return parseLookGarmentDetections({ garments: [
    { name: "light wash jeans", category: "Bottoms", subtype: "jeans", color: "Light blue", pattern: "Solid", material: "Denim", confidence: 84, bounds: { x: 0.2, y: 0.5, width: 0.5, height: 0.45 } },
    { name: "white crew neck t-shirt", category: "Top", subtype: "T-shirt", color: "White", pattern: "None", material: "Cotton", confidence: 88, bounds: { x: 0.2, y: 0.1, width: 0.5, height: 0.4 } },
  ] }, { width: 800, height: 1200 });
}

const photo = await sharp({ create: { width: 64, height: 96, channels: 3, background: { r: 40, g: 70, b: 120 } } }).jpeg().toBuffer();

function upload(bytes: Buffer = photo, type = "image/jpeg", extra: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("photo", new File([new Uint8Array(bytes)], "outfit.jpg", { type }));
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request("http://127.0.0.1/api/wears/photo", { method: "POST", body: form, headers });
}

interface Calls { closet: string[]; allowance: string[]; siteCalls: number; detect: number; logs: Array<{ message: string; fields: Record<string, string> }> }

function harness(overrides: Partial<WearPhotoScanDependencies> = {}, session: WearPhotoSession | null = { subject: "consumer-a", role: "consumer" }) {
  const calls: Calls = { closet: [], allowance: [], siteCalls: 0, detect: 0, logs: [] };
  const dependencies: WearPhotoScanDependencies = {
    getSession: async () => session,
    consumeRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
    listCloset: async ownerId => { calls.closet.push(ownerId); return ownerId === "consumer-a" ? closet : [{ ...closet[0], id: "someone-elses-jeans" }]; },
    spendAllowance: async ownerId => { calls.allowance.push(ownerId); return { allowed: true }; },
    spendSiteModelCall: async () => { calls.siteCalls++; return true; },
    detect: async () => { calls.detect++; return detections(); },
    aiConfigured: () => true,
    log: (message, fields) => { calls.logs.push({ message, fields }); },
    ...overrides,
  };
  return { calls, run: (request: Request = upload()) => handleWearPhotoScan(request, dependencies) };
}

test("signed out is refused before anything is read or spent", async () => {
  const { calls, run } = harness({}, null);
  const response = await run();
  assert.equal(response.status, 401);
  assert.deepEqual([calls.closet.length, calls.allowance.length, calls.detect], [0, 0, 0]);
});

test("a brand account is refused", async () => {
  const { calls, run } = harness({}, { subject: "brand-a", role: "brand" });
  assert.equal((await run()).status, 403);
  assert.deepEqual([calls.closet.length, calls.detect], [0, 0]);
});

test("an oversized photo is refused, by its declared length and by what actually arrives", async () => {
  const declared = harness();
  assert.equal((await declared.run(upload(photo, "image/jpeg", {}, { "content-length": String(7_000_000) }))).status, 413);
  const streamed = harness();
  const response = await streamed.run(upload(Buffer.alloc(6_500_000, 1)));
  assert.equal(response.status, 413);
  assert.equal(streamed.calls.detect + declared.calls.detect, 0);
});

test("a file that is not a photo is refused", async () => {
  const { calls, run } = harness();
  assert.equal((await run(upload(Buffer.from("not an image"), "text/plain"))).status, 400);
  assert.equal(calls.detect, 0);
});

test("the per-account rate limit is respected, shared with closet scans", async () => {
  resetRateLimits();
  const { calls, run } = harness({ consumeRateLimit: key => consumeRateLimit(key, RATE_LIMIT_RULES.lookDetect), listCloset: async () => [] });
  for (let index = 0; index < RATE_LIMIT_RULES.lookDetect.limit; index++) assert.equal((await run()).status, 200);
  const refused = await run();
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get("retry-after")) > 0);
  // A closet scan from the same account draws on the same bucket.
  assert.equal(consumeRateLimit("look-detect:consumer-a", RATE_LIMIT_RULES.lookDetect).allowed, false);
  assert.equal(calls.detect, 0);
  resetRateLimits();
});

test("the account's daily scan allowance is respected, and the screen can still offer picking by hand", async () => {
  const { calls, run } = harness({ spendAllowance: async () => ({ allowed: false, scope: "account", retryAfterSeconds: 3600, message: "You've used today's 40 scans. More open at midnight UTC." }) });
  const response = await run();
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.outcome, "ai-unavailable");
  assert.match(body.message, /by hand/);
  assert.equal(calls.detect, 0);
});

test("the site's AI ceiling is respected: no model call, an honest fallback", async () => {
  const { calls, run } = harness({ spendSiteModelCall: async () => { calls.siteCalls++; return false; } });
  const response = await run();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.outcome, "ai-unavailable");
  assert.deepEqual(body.suggestions, []);
  assert.equal(calls.siteCalls, 1);
  assert.equal(calls.detect, 0, "the detector is never called once the ceiling refuses");
});

test("a detector timeout or failure offers picking by hand, and logs only the error's name", async () => {
  const failure = Object.assign(new Error("Request to model failed: <image bytes and prompt quoted here>"), { name: "TimeoutError" });
  const { calls, run } = harness({ detect: async () => { throw failure; } });
  const body = await (await run()).json();
  assert.equal(body.outcome, "ai-unavailable");
  assert.match(body.message, /by hand/);
  assert.deepEqual(calls.logs, [{ message: "Wear photo recognition unavailable", fields: { name: "TimeoutError" } }]);
});

test("nothing found in the photo is said plainly", async () => {
  const { run } = harness({ detect: async () => [] });
  const body = await (await run()).json();
  assert.equal(body.outcome, "nothing-found");
  assert.deepEqual(body.suggestions, []);
});

test("an empty closet spends no scan and no model call", async () => {
  const { calls, run } = harness({ listCloset: async ownerId => { calls.closet.push(ownerId); return []; } });
  const body = await (await run()).json();
  assert.equal(body.outcome, "empty-closet");
  assert.deepEqual([calls.allowance.length, calls.siteCalls, calls.detect], [0, 0, 0]);
});

test("AI not configured: no spend, picking by hand is offered", async () => {
  const { calls, run } = harness({ aiConfigured: () => false });
  const body = await (await run()).json();
  assert.equal(body.outcome, "ai-unavailable");
  assert.equal(calls.allowance.length, 0);
});

test("suggestions come only from the session's own closet, whatever the browser sends", async () => {
  const { calls, run } = harness();
  const response = await run(upload(photo, "image/jpeg", { ownerId: "consumer-b", subject: "consumer-b", itemIds: "someone-elses-jeans" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(calls.closet, ["consumer-a"], "the closet is read for the session, never for an ID in the request");
  assert.deepEqual(calls.allowance, ["consumer-a"]);
  assert.equal(body.outcome, "suggestions");
  assert.equal(body.photoKept, false);
  const named = body.suggestions.flatMap((entry: { candidates: Array<{ itemId: string }> }) => entry.candidates.map(candidate => candidate.itemId));
  assert.ok(named.length > 0 && named.every((id: string) => ["own-jeans", "own-tee"].includes(id)));
  assert.deepEqual(body.suggestions.map((entry: { preselectedItemId: string | null }) => entry.preselectedItemId), ["own-jeans", "own-tee"]);
  // The answer holds no image: no data URL, no base64 of the photo, no storage key or link.
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /data:image|base64|temp\/|wardrobe\/|https?:/);
  assert.ok(!text.includes(photo.toString("base64").slice(0, 40)));
});

test("the route stores nothing and records nothing: no storage call, no wear write", () => {
  const route = read("app/api/wears/photo/route.ts");
  const handler = read("lib/wear-photo-scan.ts");
  for (const source of [route, handler]) {
    assert.doesNotMatch(source, /putScanImage|putPrivateImage|putBrandImage|PutObject|client-s3|recordRealWear|saveOutfit|addWardrobeItem|fetch\(/);
  }
  // The only store function the route reaches is the session's own closet listing.
  assert.match(route, /import \{ listWardrobe \} from "@\/lib\/server\/production-store";/);
  assert.match(route, /listCloset:ownerId=>listWardrobe\(ownerId\)/);
  assert.match(route, /consumeRateLimit\(key,RATE_LIMIT_RULES\.lookDetect\)/);
  assert.match(route, /spendAiAllowance\("scan",ownerId\)/);
  assert.match(route, /siteModelCallFor\(session\)/);
  // The handler logs names and stages only, never the image or the detector's words.
  for (const call of handler.match(/log\([^;]*\);/g) ?? []) assert.doesNotMatch(call, /prepared|base64|file|detections|pieces/);
});

test("the privacy page and docs say what happens to the photo, matching the code above", () => {
  const privacy = read("app/privacy/page.tsx");
  assert.match(privacy, /Log with a photo/);
  assert.match(privacy, /sends the photo to Amazon Bedrock/);
  assert.match(privacy, /Racked does not save that photo/);
  assert.match(privacy, /Nothing is recorded until you confirm/);
  assert.match(read("docs/privacy-and-ethics.md"), /there is no `putScanImage` call/);
  assert.match(read("docs/backend-api.md"), /`POST \/api\/wears\/photo` \| Consumer \|/);
});
