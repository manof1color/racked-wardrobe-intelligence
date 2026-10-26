/**
 * Runtime validation at the request boundary, and the one way a failure is answered. A TypeScript
 * cast checks nothing at runtime; these readers do, and a refusal is the only message a person sees.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { failureResponse, logFailure, RequestRefused } from "../lib/api-errors.ts";
import { onlyFields, readBoolean, readId, readIdList, readJsonObject, readText } from "../lib/request-input.ts";
import { GarmentEditRefused } from "../lib/garment-edit.ts";
import { UploadValidationError } from "../lib/garment-analysis.ts";

const post = (body: string) => new Request("https://racked.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body });
const refusal = (work: () => unknown) => { try { work(); } catch (error) { return error; } return null; };

test("a body must be a JSON object, read under the cap", async () => {
  assert.deepEqual(await readJsonObject(post('{"itemIds":["a"]}')), { itemIds: ["a"] });
  for (const body of ["[1,2]", '"text"', "null", "not json", ""]) {
    await assert.rejects(readJsonObject(post(body)), (error: unknown) => error instanceof RequestRefused && error.status === 400, body);
  }
  await assert.rejects(readJsonObject(post(JSON.stringify({ name: "x".repeat(70_000) }))), (error: unknown) => error instanceof RequestRefused && error.status === 413);
});

test("a field that names an owner, a role, or a verification state is refused, not ignored", () => {
  for (const field of ["ownerId", "accountId", "role", "verified", "registryProductId"]) {
    const error = refusal(() => onlyFields({ itemIds: ["a"], [field]: "x" }, ["itemIds"]));
    assert.ok(error instanceof RequestRefused && error.message.includes(field), field);
  }
  assert.equal(refusal(() => onlyFields({ itemIds: ["a"] }, ["itemIds", "outfitId"])), null);
});

test("IDs are Racked's own shapes, and a list is checked whole before any item is used", () => {
  assert.equal(readId(" 9a87e76c-ed6a-4d31-bcd8-475604db10b9 ", "outfit"), "9a87e76c-ed6a-4d31-bcd8-475604db10b9");
  assert.equal(readId("registry-px-1", "product"), "registry-px-1");
  for (const bad of ["", "../USER#x", "a b", "x".repeat(129), 7, null, { $ne: null }, ["a"]]) assert.ok(refusal(() => readId(bad, "piece")) instanceof RequestRefused, JSON.stringify(bad));
  assert.deepEqual(readIdList(["a", "b", "a"], { label: "pieces", min: 1, max: 10 }), ["a", "b"], "duplicates collapse");
  for (const bad of ["a", [], Array.from({ length: 11 }, (_, index) => `p${index}`), Array(500).fill("a"), ["a", 2], ["a", "../b"]]) {
    assert.ok(refusal(() => readIdList(bad, { label: "pieces", min: 1, max: 10 })) instanceof RequestRefused, JSON.stringify(bad).slice(0, 40));
  }
});

test("text and booleans are checked for type and length", () => {
  assert.equal(readText("  Harness look  ", { label: "a title", max: 80, min: 3 }), "Harness look");
  assert.equal(readText(undefined, { label: "a name", max: 80, optional: true }), "");
  for (const bad of [42, "ab", "x".repeat(81), null]) assert.ok(refusal(() => readText(bad, { label: "a title", max: 80, min: 3 })) instanceof RequestRefused, String(bad));
  assert.equal(readBoolean(false, "brandDataSharing"), false);
  for (const bad of ["true", 1, null, undefined]) assert.ok(refusal(() => readBoolean(bad, "brandDataSharing")) instanceof RequestRefused, String(bad));
});

test("a refusal's words reach the person; anything else is generic, with a reference", async () => {
  const refused = failureResponse(new RequestRefused("Choose 1–10 wardrobe pieces."), "Outfit save failed", "Could not save.");
  assert.equal(refused.status, 400);
  assert.deepEqual(await refused.json(), { error: "Choose 1–10 wardrobe pieces." });
  assert.equal(failureResponse(new UploadValidationError("Photos must be JPG, PNG, or WebP.", 413), "x", "y").status, 413, "upload refusals are refusals");
  assert.equal(failureResponse(new GarmentEditRefused("That piece is verified.", 409), "x", "y").status, 409, "and so are edit refusals");

  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const leak = Object.assign(new Error("User: arn:aws:sts::123456789012:assumed-role/racked-compute is not authorized to perform dynamodb:Query on resource arn:aws:dynamodb:us-east-2:123456789012:table/racked-prod"), { name: "AccessDeniedException", $metadata: { httpStatusCode: 400 } });
    const response = failureResponse(leak, "Outfit save failed", "The outfit could not be saved. Try again.");
    const body = await response.json() as { error: string; reference: string };
    assert.equal(response.status, 500);
    assert.equal(body.error, "The outfit could not be saved. Try again.");
    assert.match(body.reference, /^[0-9a-f]{8}$/);
    assert.deepEqual(logged.at(-1), ["Outfit save failed", { reference: body.reference, name: "AccessDeniedException", status: 400 }], "the log has the reference, name, and status — never the message");
    logFailure("Odd failure", "a thrown string with a@example.test");
    assert.deepEqual((logged.at(-1)![1] as { name: string }).name, "UnknownError");
    assert.doesNotMatch(JSON.stringify(logged), /arn:aws|123456789012|a@example\.test/);
  } finally {
    console.error = original;
  }
});

function routes(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? routes(path) : entry === "route.ts" ? [path] : [];
  });
}

test("REGRESSION: no API route returns an arbitrary error's message or logs a raw error object", () => {
  const files = routes(new URL("../app/api", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  assert.ok(files.length > 25);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /error instanceof Error\s*\?\s*error\.message/, `${file} returns any error's message`);
    assert.doesNotMatch(source, /console\.(error|warn)\([^)]*,\s*(error|reason|err)\s*\)/, `${file} logs a raw error object`);
  }
});
