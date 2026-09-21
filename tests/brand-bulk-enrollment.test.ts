import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftBlockers, draftReady, duplicateSkusInBatch, enrollmentSummary, MAX_ENROLL_DRAFTS, planEnrollmentBatch } from "../lib/brand-enrollment-batch.ts";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const panel = read("components/brand-product-enrollment.tsx");

test("a batch of photos becomes a bounded set of drafts", () => {
  const photos = Array.from({ length: 10 }, (_, index) => `photo-${index + 1}`);
  const plan = planEnrollmentBatch(photos);
  assert.equal(plan.accepted.length, MAX_ENROLL_DRAFTS);
  assert.equal(plan.skipped, 10 - MAX_ENROLL_DRAFTS);
  assert.ok(RATE_LIMIT_RULES.brandProductDescribe.limit >= MAX_ENROLL_DRAFTS, "a full batch can be read without being refused");
});

// Recognition proposes what a product looks like. What identifies it is the brand's alone.
test("REGRESSION: a draft cannot be enrolled without the style code only the brand knows", () => {
  assert.deepEqual(draftBlockers({ name: "", sku: "", category: "" }), ["a name", "a style code", "a category"]);
  assert.deepEqual(draftBlockers({ name: "Tee", sku: "", category: "top" }), ["a style code"]);
  assert.equal(draftReady({ name: "Tee", sku: "NA-1", category: "top" }), true);
  assert.equal(draftReady({ name: "Tee", sku: "   ", category: "top" }), false);
  // The photo reader fills appearance only; it never writes a SKU or a GTIN into a draft.
  const reader = panel.slice(panel.indexOf("async function readPhotos"), panel.indexOf("async function enrolAll"));
  assert.match(reader, /name:current\.form\.name\|\|suggestion\.name/);
  assert.doesNotMatch(reader, /sku:/);
  assert.doesNotMatch(reader, /gtin:/);
});

test("two drafts cannot carry one style code", () => {
  assert.deepEqual(duplicateSkusInBatch([{ sku: "NA-1" }, { sku: "na-1" }, { sku: "NA-2" }]), ["NA-1"]);
  assert.deepEqual(duplicateSkusInBatch([{ sku: "NA-1" }, { sku: "" }, { sku: "" }]), [], "empty drafts are not duplicates");
  assert.match(panel, /if\(duplicates\.length\)\{setError/, "caught before the registry has to refuse it");
});

test("a batch that half-worked says so, and keeps what failed on screen", () => {
  assert.equal(enrollmentSummary({ total: 3, enrolled: 3, failed: 0 }), "3 of 3 products enrolled.");
  assert.match(enrollmentSummary({ total: 3, enrolled: 2, failed: 1 }), /2 of 3 products enrolled\. 1 still needs attention below — nothing was stored for it\./);
  assert.match(enrollmentSummary({ total: 2, enrolled: 0, failed: 2 }), /^No products were enrolled\./);
  assert.match(enrollmentSummary({ total: 6, enrolled: 6, failed: 0, skippedPhotos: 2 }), /2 photos were left for a second batch/);

  const enrol = panel.slice(panel.indexOf("async function enrolAll"), panel.indexOf("const field="));
  assert.match(enrol, /for\(const \[index,draft\] of queue\.entries\(\)\)/, "one product per request");
  assert.match(enrol, /state:"failed",note:reason instanceof Error\?reason\.message/, "a refusal is shown on the draft that caused it");
  assert.match(enrol, /setDrafts\(current=>current\.filter\(draft=>draft\.state!=="enrolled"\)\)/, "what enrolled leaves, what failed stays");
});

test("the panel takes several photos and describes each one on its own", () => {
  assert.match(panel, /<PhotoSourcePicker label=\{drafts\.length\?"Choose different photos":"Add product photos"\} multiple onFiles=\{chooseFiles\}/);
  assert.match(panel, /Reading photo \$\{index\+1\} of \$\{batch\.length\}/);
  assert.match(panel, /up to \{MAX_ENROLL_DRAFTS\} at once/);
});

test("a bulk enrolment lands in the catalog, not inside one product", () => {
  const dashboard = read("components/brand-dashboard.tsx");
  assert.match(dashboard, /if\(arrivals\.length===1\)\{const arrived=arrivals\[0\]/);
  assert.match(dashboard, /else setView\("catalog"\);/);
  assert.match(dashboard, /setJustEnrolled\(ids=>\[\.\.\.ids,\.\.\.arrivals\.map\(item=>item\.id\)\]\)/, "and none of them spends enumeration budget");
});
