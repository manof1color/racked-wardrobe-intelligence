import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectReferences, deletionAllowed, isCandidate, PHOTO_AGE_MS, photoSummary, referenceIndex, sameObject } from "../scripts/lib/unreferenced-photos.mjs";
import { auditPhotos, listWardrobeObjects, parseOptions, tableReferences } from "../scripts/audit-unreferenced-photos.mjs";

const now = Date.parse("2026-10-27T12:00:00Z");
const key = "wardrobe/synthetic-owner-0001/piece.jpg";
const photo = (Key = key, age = 8) => ({ Key, Size: 1024, LastModified: new Date(now - age * 86400000), ETag: '"synthetic-etag"' });
const references = (value: unknown, keys = [key]) => collectReferences(value, referenceIndex(keys));

test("a kept crop referenced in a raw DynamoDB record is never a candidate", () => {
  assert.equal(isCandidate(photo(), references({ imageKey: { S: key } }), now), false);
});

test("one scan photo shared by two pieces remains referenced if either piece keeps it", () => {
  const scan = "wardrobe/synthetic-owner-0001/evidence/scan.jpg";
  for (const items of [[{ evidenceImageKey: scan }, { evidenceImageKey: scan }], [{ evidenceImageKey: scan }]]) {
    assert.equal(isCandidate(photo(scan), references(items, [scan]), now), false);
  }
});

test("an outfit board is protected without relying on garment field names", () => {
  assert.equal(isCandidate(photo(), references({ SK: "OUTFIT#synthetic", board: { image: key } }), now), false);
});

test("a Community post image is protected even when its wardrobe piece is gone", () => {
  assert.equal(isCandidate(photo(), references({ PK: "COMMUNITY", arbitraryNewImageField: key }), now), false);
});

test("deep nested lists, map attributes, string sets and string substrings all protect keys", () => {
  for (const value of [
    { futureField: { L: [{ M: { nested: { L: [{ S: `https://example.invalid/${key}?test=1` }] } } }] } },
    { futureField: { SS: [key] } },
    new Map([["photos", new Set([key])]]),
    { [key]: "attribute name also counts" },
    { url: encodeURIComponent(key) },
  ]) assert.ok(references(value).has(key));
  assert.ok(references(`${key}.backup`).has(key), "substring matches conservatively keep the object");
});

test("recent, exactly seven-day-old, invalid-date and future objects are not candidates", () => {
  for (const object of [photo(key, 1), photo(key, 7), photo(key, -1), { ...photo(), LastModified: "not-a-date" }, { ...photo(), LastModified: null }]) {
    assert.equal(isCandidate(object, new Set(), now), false);
  }
  assert.equal(isCandidate({ ...photo(), LastModified: new Date(now - PHOTO_AGE_MS - 1) }, new Set(), now), true);
});

test("only an old unreferenced wardrobe object is a candidate and summary contains counts/bytes only", () => {
  const objects = [photo(), photo("wardrobe/synthetic-owner-0001/kept.png"), photo("wardrobe/synthetic-owner-0002/old.png"), photo("wardrobe/synthetic-owner-0003/recent.png", 1)];
  const summary = photoSummary(objects, new Set([objects[1].Key]), now);
  assert.deepEqual(summary, { objectsListed: 4, totalBytes: 4096, referencedObjects: 1, referencedBytes: 1024, candidates: 2, candidateBytes: 2048, ownersWithCandidates: 2 });
  assert.ok(Object.values(summary).every(Number.isSafeInteger));
  assert.ok(!JSON.stringify(summary).includes("synthetic-owner"));
});

test("brand, temp, demo, directory markers and ambiguous wardrobe paths are never candidates", () => {
  for (const Key of ["brand/synthetic/product.png", "temp/wardrobe/synthetic/item.png", "demo/product.png", "wardrobe/", "wardrobe//item.png", "wardrobe/synthetic/", "wardrobe/synthetic/../brand.png"]) {
    assert.equal(isCandidate(photo(Key), new Set(), now), false, Key);
  }
});

test("deletion needs both exact opt-ins and cannot start an inventory if consent is missing", async () => {
  assert.equal(deletionAllowed(true, "yes"), true);
  for (const [flag, consent] of [[false, undefined], [true, undefined], [true, "true"], [true, "YES"], [false, "yes"]]) assert.equal(deletionAllowed(flag, consent), false);
  assert.deepEqual(parseOptions([], { ALLOW_RACKED_PHOTO_CLEANUP: "yes" }), { deleteRequested: false, help: false });
  assert.throws(() => parseOptions(["--delete"], {}), /delete-opt-in-required/);
  assert.throws(() => parseOptions(["--unknown"], {}), /invalid-options/);
  assert.throws(() => parseOptions(["--delete", "--delete"], { ALLOW_RACKED_PHOTO_CLEANUP: "yes" }), /invalid-options/);
  const refuseIO = async () => { throw new Error("must-not-contact-aws"); };
  await assert.rejects(auditPhotos({ list: refuseIO }, { table: "synthetic", bucket: "synthetic", deleteRequested: true, now }), /delete-opt-in-required/);
});

test("default audit paginates S3 and every unfiltered strongly-consistent table page without writing", async () => {
  const listInputs: Array<Record<string, unknown>> = [];
  const scanInputs: Array<Record<string, unknown>> = [];
  const second = "wardrobe/synthetic-owner-0002/kept.png";
  const result = await auditPhotos({
    list: async (input: Record<string, unknown>) => { listInputs.push(input); return input.ContinuationToken ? { Contents: [photo(second)], IsTruncated: false } : { Contents: [photo()], IsTruncated: true, NextContinuationToken: "page-2" }; },
    scan: async (input: Record<string, unknown>) => { scanInputs.push(input); return input.ExclusiveStartKey ? { Items: [{ nested: { L: [{ S: second }] } }] } : { Items: [], LastEvaluatedKey: { PK: { S: "synthetic-page" } } }; },
    head: async () => { throw new Error("dry-run-must-not-head"); },
    remove: async () => { throw new Error("dry-run-must-not-delete"); },
  }, { table: "synthetic-table", bucket: "synthetic-bucket", now });
  assert.equal(listInputs.length, 2);
  for (const input of listInputs) assert.equal(input.Prefix, "wardrobe/");
  assert.equal(listInputs[1].ContinuationToken, "page-2");
  assert.equal(scanInputs.length, 2);
  for (const input of scanInputs) {
    assert.equal(input.ConsistentRead, true);
    assert.equal(input.TableName, "synthetic-table");
    assert.ok(!("ProjectionExpression" in input || "FilterExpression" in input || "IndexName" in input));
  }
  assert.equal(result.referencedObjects, 1);
  assert.equal(result.candidates, 1);
  assert.equal(result.deletedObjects, 0);
});

test("cleanup re-scans the whole table immediately before each conditional delete", async () => {
  const second = "wardrobe/synthetic-owner-0002/second.jpg";
  const events: string[] = [];
  const objects = [photo(), photo(second)];
  const removed: Array<Record<string, unknown>> = [];
  const result = await auditPhotos({
    list: async () => ({ Contents: objects }),
    scan: async () => { events.push("scan"); return { Items: [] }; },
    head: async ({ Key }: { Key: string }) => { events.push("head"); const object = objects.find(object => object.Key === Key)!; return { ETag: object.ETag, ContentLength: object.Size, LastModified: object.LastModified }; },
    remove: async (input: Record<string, unknown>) => { events.push("delete"); removed.push(input); },
  }, { table: "synthetic", bucket: "synthetic", deleteRequested: true, cleanupConsent: "yes", now });
  assert.deepEqual(events, ["scan", "head", "scan", "delete", "head", "scan", "delete"]);
  assert.equal(result.deletedObjects, 2);
  assert.equal(result.deletedBytes, 2048);
  for (const input of removed) assert.equal(input.IfMatch, '"synthetic-etag"');
});

test("a newly referenced object is retained on the fresh check, including later table pages", async () => {
  let scans = 0;
  const result = await auditPhotos({
    list: async () => ({ Contents: [photo()] }),
    scan: async (input: Record<string, unknown>) => {
      scans++;
      if (scans === 1) return { Items: [] };
      return input.ExclusiveStartKey ? { Items: [{ arbitrary: { list: [key] } }] } : { Items: [], LastEvaluatedKey: { PK: { S: "next" } } };
    },
    head: async () => ({ ETag: photo().ETag, ContentLength: 1024, LastModified: photo().LastModified }),
    remove: async () => { throw new Error("must-retain-new-reference"); },
  }, { table: "synthetic", bucket: "synthetic", deleteRequested: true, cleanupConsent: "yes", now });
  assert.equal(scans, 3);
  assert.equal(result.retainedOnRecheck, 1);
  assert.equal(result.deletedObjects, 0);
});

test("changed metadata or missing ETag prevents deletion, not just changed image bytes", () => {
  const current = { ETag: photo().ETag, ContentLength: 1024, LastModified: photo().LastModified };
  assert.equal(sameObject(photo(), current), true);
  assert.equal(sameObject(photo(), { ...current, ETag: '"replacement"' }), false);
  assert.equal(sameObject(photo(), { ...current, ContentLength: 2048 }), false);
  assert.equal(sameObject(photo(), { ...current, LastModified: new Date(now) }), false);
  assert.equal(sameObject({ ...photo(), ETag: "" }, current), false);
});

test("incomplete pagination, wrong-prefix objects or failed table reads abort instead of implying unreferenced", async () => {
  await assert.rejects(listWardrobeObjects({ list: async () => ({ IsTruncated: true }) }, "synthetic"), /incomplete-object-list/);
  await assert.rejects(listWardrobeObjects({ list: async () => ({ Contents: [photo("brand/synthetic/photo.png")] }) }, "synthetic"), /unexpected-prefix/);
  await assert.rejects(tableReferences({ scan: async () => ({ LastEvaluatedKey: { PK: { S: "loop" } } }) }, "synthetic", [key]), /incomplete-table-scan/);
  await assert.rejects(tableReferences({ scan: async () => { throw new Error("denied"); } }, "synthetic", [key]), /denied/);
  assert.throws(() => photoSummary([{ ...photo(), Size: NaN }], new Set(), now), /invalid-object-size/);
});

test("reference matching handles shared prefixes, empty strings and cyclic maps without broadening candidates", () => {
  const longer = `${key}.backup`;
  const cycle: Record<string, unknown> = { arbitrary: [key, "", null, new Uint8Array([0])] };
  cycle.self = cycle;
  const found = references(cycle, [key, longer]);
  assert.ok(found.has(key));
  assert.ok(!found.has(longer));
  const both = references(longer, [key, longer]);
  assert.equal(both.size, 2);
});

test("CLI refusal never prints provider errors or touches AWS; source limits deletion to conditional single objects", () => {
  const script = fileURLToPath(new URL("../scripts/audit-unreferenced-photos.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--delete"], { encoding: "utf8", env: { NODE_ENV: "test" } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { error: "delete-opt-in-required" });
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /GetObjectCommand|DeleteObjectsCommand|console\.(?:log|error)\(error/);
  assert.match(source, /DeleteObjectCommand\(input\)/);
  assert.match(source, /IfMatch: object\.ETag/);
});
