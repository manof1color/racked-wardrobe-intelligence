import test from "node:test";
import assert from "node:assert/strict";
import { buildPhotoPlan, normalizePlannedCategory, PLANNED_CATEGORIES } from "../lib/photo-plan.ts";
import { analyzeThreeViewSet } from "../lib/garment-analysis.ts";
import { seedBrandProducts } from "../lib/product-registry.ts";
import type { UploadDescriptor } from "../lib/platform-types.ts";

test("footwear gets a sole request instead of a generic back view", () => {
  const plan = buildPhotoPlan("sneaker", { source: "ai", confidence: 88, aiReasoning: "Laces and midsole visible." });
  assert.equal(plan.category, "shoe");
  assert.equal(plan.requests.length, 2);
  assert.match(plan.requests[0].title, /sole/i);
  assert.match(plan.requests[1].title, /tongue|insole/i);
  assert.match(plan.reasoning, /footwear/i);
  assert.match(plan.reasoning, /Laces and midsole visible/);
});

test("tops keep the standard back-and-label set; jewelry asks for hallmark evidence", () => {
  const top = buildPhotoPlan("t-shirt");
  assert.equal(top.category, "top");
  assert.match(top.requests[0].title, /back/i);
  assert.match(top.requests[1].title, /label/i);
  const jewelry = buildPhotoPlan("necklace");
  assert.equal(jewelry.category, "jewelry");
  assert.match(jewelry.requests[0].title, /hallmark|clasp/i);
});

test("an unclassifiable photo falls back to the standard set with honest reasoning", () => {
  const plan = buildPhotoPlan("mystery object", { source: "fallback" });
  assert.equal(plan.category, "unknown");
  assert.equal(plan.source, "fallback");
  assert.equal(plan.confidence, 0);
  assert.match(plan.reasoning, /not confident/i);
  assert.match(plan.requests[0].title, /back/i);
});

test("the user can override the category and the plan reflects it", () => {
  const overridden = buildPhotoPlan("shoe", { source: "user-override" });
  assert.equal(overridden.source, "user-override");
  assert.match(overridden.requests[0].instruction, /sole/i);
  for (const category of PLANNED_CATEGORIES) {
    assert.equal(normalizePlannedCategory(category), category, `every selectable category must normalize to itself (${category})`);
  }
});

test("REGRESSION: the photo plan carries no identity or verification fields", () => {
  for (const category of PLANNED_CATEGORIES) {
    const plan = buildPhotoPlan(category, { source: "ai", confidence: 90 });
    assert.deepEqual(Object.keys(plan).sort(), ["category", "confidence", "reasoning", "requests", "source"], `${category} plan must expose only plan fields`);
    for (const request of plan.requests) {
      assert.deepEqual(Object.keys(request).sort(), ["instruction", "reason", "slot", "title"], `${category} request must expose only photo-request fields`);
    }
  }
});

test("REGRESSION: brand verification requires the same registry evidence regardless of any photo plan", () => {
  const parts: UploadDescriptor[] = [
    { view: "front", fileName: "user-front.jpg", contentType: "image/jpeg", size: 1000 },
    { view: "back", fileName: "user-back.jpg", contentType: "image/jpeg", size: 1000 },
    { view: "label", fileName: "user-label.jpg", contentType: "image/jpeg", size: 1000 },
  ];
  // Brand name alone (what an adaptive flow or AI could supply) must NOT verify.
  const brandOnly = analyzeThreeViewSet(parts, { registry: seedBrandProducts, labelText: "Northstar Atelier" });
  assert.equal(brandOnly.label.matched, false);
  assert.equal(brandOnly.label.registryProductId, null);
  // The exact same evidence bar as before: brand PLUS enrolled SKU verifies.
  const brandPlusSku = analyzeThreeViewSet(parts, { registry: seedBrandProducts, labelText: "Northstar Atelier NA-OW-1042" });
  assert.equal(brandPlusSku.label.matched, true);
  assert.equal(brandPlusSku.label.matchMethod, "brand-sku");
});
