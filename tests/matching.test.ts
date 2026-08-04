import test from "node:test";
import assert from "node:assert/strict";
import { catalog, wardrobe } from "../lib/demo-data.ts";
import { rankProducts, scoreProduct } from "../lib/matching.ts";

test("hybrid score stores seven inspectable components with normalized weights", () => {
  const result = scoreProduct(catalog[0], wardrobe);
  assert.equal(result.components.length, 7);
  assert.equal(result.components.reduce((sum, component) => sum + component.weight, 0), 1);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.confidence, "high");
  assert.equal(result.fallback, true);
});

test("explanations are limited to grounded product and score facts", () => {
  const result = scoreProduct(catalog[0], wardrobe);
  assert.equal(result.reasons.length, 3);
  assert.ok(result.reasons.every((reason) => !/will buy|sales lift|income|gender|age/i.test(reason)));
});

test("ranking is deterministic and descending", () => {
  const first = rankProducts(catalog, wardrobe);
  const second = rankProducts(catalog, wardrobe);
  assert.deepEqual(first.map((entry) => entry.product.id), second.map((entry) => entry.product.id));
  assert.ok(first.every((entry,index) => index === 0 || first[index-1].result.score >= entry.result.score));
});
