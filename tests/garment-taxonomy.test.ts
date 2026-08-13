import test from "node:test";
import assert from "node:assert/strict";
import { GARMENT_TAXONOMY, cleanHypothesis, normalizeGarmentClassification, subtypeForCategory } from "../lib/garment-taxonomy.ts";

test("controlled taxonomy retains useful garment subtypes across every broad category", () => {
  assert.equal(subtypeForCategory("top", "hoodie"), "hoodie");
  assert.equal(subtypeForCategory("outerwear", "bomber jacket"), "bomber-jacket");
  assert.equal(subtypeForCategory("shoe", "loafers"), "loafers");
  assert.ok(Object.values(GARMENT_TAXONOMY).every((subtypes) => subtypes.length > 0));
});

test("unknown or incompatible subtype text falls back inside its broad category", () => {
  assert.deepEqual(normalizeGarmentClassification("top", "loafer"), { category: "top", subtype: "other-top" });
  assert.deepEqual(normalizeGarmentClassification("mystery", "mystery"), { category: "unknown", subtype: "other-garment" });
});

test("first-photo hypotheses are bounded and contain descriptive fields only", () => {
  const hypothesis = cleanHypothesis({
    category: "outerwear", subtype: "bomber jacket", confidence: 200, reasoning: "Visible ribbed cuffs.",
    alternatives: [{ category: "top", subtype: "sweatshirt", confidence: 36, reason: "Rear is not visible." }],
    brand: "must not survive", verified: true,
  });
  assert.deepEqual(hypothesis, {
    category: "outerwear", subtype: "bomber-jacket", confidence: 95, reasoning: "Visible ribbed cuffs.",
    alternatives: [{ category: "top", subtype: "sweatshirt", confidence: 36, reason: "Rear is not visible." }],
  });
  assert.equal("brand" in (hypothesis as unknown as Record<string, unknown>), false);
  assert.equal("verified" in (hypothesis as unknown as Record<string, unknown>), false);
});
