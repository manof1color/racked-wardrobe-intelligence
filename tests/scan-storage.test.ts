/**
 * Scan photos nobody keeps are deleted without anything having to run: they wait under `temp/`,
 * which the bucket's lifecycle rule empties, and only a kept piece is copied out. Also the brand
 * sharing wording, which has to say that turning sharing on includes wear recorded before it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RequestRefused } from "../lib/api-errors.ts";
import { keepScanImages, keptScanImage, PENDING_SCAN_PREFIX, SCAN_EXPIRED_MESSAGE } from "../lib/scan-storage.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const OWNER = "7f1c2a9e-0000-4000-8000-000000000001";
const OTHER = "7f1c2a9e-0000-4000-8000-000000000002";
const PIECE = "0b5e7d1c-1111-4222-8333-444455556666";

test("a pending scan photo is kept at the same path without temp/", () => {
  assert.deepEqual(keptScanImage(`temp/wardrobe/${OWNER}/${PIECE}.png`, OWNER), { key: `wardrobe/${OWNER}/${PIECE}.png`, pendingKey: `temp/wardrobe/${OWNER}/${PIECE}.png` });
  assert.deepEqual(keptScanImage(`temp/wardrobe/${OWNER}/evidence/${PIECE}.jpg`, OWNER), { key: `wardrobe/${OWNER}/evidence/${PIECE}.jpg`, pendingKey: `temp/wardrobe/${OWNER}/evidence/${PIECE}.jpg` });
  assert.deepEqual(keptScanImage(`wardrobe/${OWNER}/${PIECE}.png`, OWNER), { key: `wardrobe/${OWNER}/${PIECE}.png`, pendingKey: null }, "a scan from before this change is already kept");
});

test("only this account's own scan photos can be kept", () => {
  for (const key of [
    `temp/wardrobe/${OTHER}/${PIECE}.png`,
    `wardrobe/${OTHER}/${PIECE}.png`,
    `temp/brand/${OWNER}/${PIECE}.png`,
    `brand/${OWNER}/${PIECE}.png`,
    `temp/wardrobe/${OWNER}/../${OTHER}/${PIECE}.png`,
    `wardrobe/${OWNER}/../${OTHER}/${PIECE}.png`,
    `temp/wardrobe/${OWNER}/boards/${PIECE}.png`,
    `temp/wardrobe/${OWNER}/${PIECE}.html`,
    `temp/${OWNER}/${PIECE}.png`,
    undefined,
    7,
  ]) assert.equal(keptScanImage(key, OWNER), null, String(key));
  assert.equal(keptScanImage(`temp/wardrobe//${PIECE}.png`, ""), null, "an empty account ID matches nothing");
});

test("keeping copies each pending photo once, and skips photos already kept", async () => {
  const copies: Array<[string, string]> = [];
  const copy = async (from: string, to: string) => { copies.push([from, to]); };
  const crop = keptScanImage(`temp/wardrobe/${OWNER}/${PIECE}.png`, OWNER);
  const evidence = keptScanImage(`temp/wardrobe/${OWNER}/evidence/${PIECE}.jpg`, OWNER);
  await keepScanImages(copy, [crop, evidence, evidence, keptScanImage(`wardrobe/${OWNER}/old.png`, OWNER), null]);
  assert.deepEqual(copies.sort(), [
    [`temp/wardrobe/${OWNER}/${PIECE}.png`, `wardrobe/${OWNER}/${PIECE}.png`],
    [`temp/wardrobe/${OWNER}/evidence/${PIECE}.jpg`, `wardrobe/${OWNER}/evidence/${PIECE}.jpg`],
  ]);
});

test("a photo that already expired is a refusal the person can act on; any other fault is not", async () => {
  const crop = keptScanImage(`temp/wardrobe/${OWNER}/${PIECE}.png`, OWNER);
  const missing = async () => { throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" }); };
  await assert.rejects(keepScanImages(missing, [crop]), (error: unknown) => error instanceof RequestRefused && error.status === 409 && error.message === SCAN_EXPIRED_MESSAGE);
  const denied = async () => { throw Object.assign(new Error("arn:aws:iam::123:role/x is not authorized"), { name: "AccessDenied" }); };
  await assert.rejects(keepScanImages(denied, [crop]), (error: unknown) => !(error instanceof RequestRefused) && (error as Error).name === "AccessDenied", "logged with a reference, never shown");
});

test("every scan photo is written under temp/, and the bucket rule deletes temp/ after a day", () => {
  const route = read("app/api/garments/detect/route.ts");
  assert.doesNotMatch(route, /putPrivateImage\(/, "the scan never stores a photo where kept photos live");
  assert.equal(route.match(/putScanImage\(session\.subject,/g)?.length, 2, "the full photo and each crop");
  const store = read("lib/server/production-store.ts");
  assert.match(store, /\$\{pending\?PENDING_SCAN_PREFIX:""\}\$\{kind\}\/\$\{ownerId\}\//);
  const template = read("infra/template.yaml");
  const rule = template.slice(template.indexOf("- Id: DeleteTemporaryUploads"), template.indexOf("OwnershipControls:"));
  assert.match(rule, /Status: Enabled/);
  assert.match(rule, /ExpirationInDays: 1/);
  assert.match(rule, new RegExp(`Prefix: ${PENDING_SCAN_PREFIX}\\s`), "the rule's prefix is the one scans are written under");
  assert.match(template, /- s3:GetObject\s+- s3:PutObject\s+- s3:DeleteObject\s+Resource: !Sub "\$\{UploadBucket\.Arn\}\/\*"/, "the runtime role may write under temp/ and copy out of it");
});

test("REGRESSION: a kept piece's record never points at a photo that is about to expire", () => {
  const store = read("lib/server/production-store.ts");
  const save = store.slice(store.indexOf("export async function addWardrobeItem"), store.indexOf("export async function", store.indexOf("export async function addWardrobeItem") + 10));
  assert.match(save, /const image=keptScanImage\(analysis\.processedImage\.key,ownerId\);\s*if\(!image\|\|!verifyGarmentConfirmation\(ownerId,analysis\)\)/, "the signed key is checked before anything is copied");
  assert.match(save, /imageKey:image\.key,evidenceImageKey/);
  assert.doesNotMatch(save, /imageKey:analysis\.processedImage\.key/);
  assert.ok(save.indexOf("await keepScanImages(copyPrivateImage,[image,evidence]);") >= 0, "both photos are copied");
  assert.ok(save.indexOf("await keepScanImages(") < save.indexOf("new PutCommand("), "before the record is written");
});

test("the sharing switch says it includes wear recorded before it was turned on", () => {
  const banner = read("components/consumer-dashboard.tsx");
  assert.match(banner, /including wear you recorded before turning it on/);
  assert.match(banner, /Turn it off and your wear stops counting from then on, though figures a brand has already seen can&rsquo;t be taken back/);
  assert.doesNotMatch(banner, /may contribute/, "the old wording left the earlier wear out");
  const privacy = read("app/privacy/page.tsx");
  assert.match(privacy, /turning it on includes wear you recorded earlier/);
  assert.match(privacy, /Photos from a scan that you don&rsquo;t keep are deleted automatically within two days/);
});
