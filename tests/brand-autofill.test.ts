import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGarmentImages } from "../lib/garment-analysis.ts";
import { seedBrandProducts } from "../lib/product-registry.ts";
import type { UploadDescriptor } from "../lib/platform-types.ts";

const parts: UploadDescriptor[] = [
  { view: "front", fileName: "capture-front.jpg", contentType: "image/jpeg", size: 1024 },
  { view: "back", fileName: "capture-back.jpg", contentType: "image/jpeg", size: 1024 },
  { view: "label", fileName: "capture-label.jpg", contentType: "image/jpeg", size: 1024 },
];
const images = parts.map((part) => ({ view: part.view, contentType: "image/jpeg" as const, base64: "aW4tbWVtb3J5" }));

function providerReturning(payload: object) {
  return async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(payload) }] }), { status: 200 });
}

const garment = { name: "Boxy chore jacket", category: "outerwear", color: "ecru", style: ["workwear"], construction: ["patch pockets"], material: "cotton" };

test("an AI-read brand name autofills the editable label as a suggestion, never verified", async () => {
  const result = await analyzeGarmentImages(parts, images, {
    registry: [], provider: "anthropic", apiKey: "test-key",
    fetchImpl: providerReturning({ confidence: 84, visibleLabelText: "MADE IN PORTUGAL 100% COTTON", brandText: "Atelier Marais", garment }),
  });
  assert.equal(result.label.brand, "Atelier Marais");
  assert.equal(result.label.suggested, true);
  assert.equal(result.label.matched, false);
  assert.equal(result.label.matchMethod, "ai-label-text");
  assert.equal(result.label.registryProductId, null);
  assert.match(result.warnings[0], /not a verified product link/i);
});

test("REGRESSION: AI-detected brand text alone can never produce verified status, even when that brand is enrolled in the registry", async () => {
  // "Northstar Atelier" IS an enrolled registry brand — but the AI only read the brand
  // name, with no SKU/GTIN evidence. Verification must not happen.
  const result = await analyzeGarmentImages(parts, images, {
    registry: seedBrandProducts, provider: "anthropic", apiKey: "test-key",
    fetchImpl: providerReturning({ confidence: 90, visibleLabelText: "100% WOOL", brandText: "Northstar Atelier", garment }),
  });
  assert.equal(result.label.matched, false);
  assert.equal(result.label.registryProductId, null);
  assert.equal(result.label.matchMethod, "ai-label-text");
  assert.equal(result.label.brand, "Northstar Atelier");
  // And the same brand WITH its enrolled SKU still verifies — the evidence bar is unchanged.
  const withSku = await analyzeGarmentImages(parts, images, {
    registry: seedBrandProducts, provider: "anthropic", apiKey: "test-key",
    fetchImpl: providerReturning({ confidence: 90, visibleLabelText: "NORTHSTAR ATELIER NA-OW-1042", brandText: "Northstar Atelier", garment }),
  });
  assert.equal(withSku.label.matched, true);
  assert.equal(withSku.label.matchMethod, "brand-sku");
  assert.equal(withSku.label.registryProductId,"registry-na-ow-1042");
  assert.equal(withSku.label.brand,"Northstar Atelier");
});

test("placeholder or unreadable brand text is discarded instead of autofilled", async () => {
  const result = await analyzeGarmentImages(parts, images, {
    registry: [], provider: "anthropic", apiKey: "test-key",
    fetchImpl: providerReturning({ confidence: 70, visibleLabelText: "", brandText: "unknown", garment }),
  });
  assert.equal(result.label.matchMethod, "none");
  assert.notEqual(result.label.brand, "unknown");
  assert.equal(result.label.matched, false);
});

test("the major-brand allowlist suggestion still takes precedence over raw AI brand text", async () => {
  const result = await analyzeGarmentImages(parts, images, {
    registry: [], provider: "anthropic", apiKey: "test-key",
    fetchImpl: providerReturning({ confidence: 88, visibleLabelText: "FILA 100% COTTON", brandText: "Fila Sport Apparel", garment }),
  });
  assert.equal(result.label.brand, "Fila");
  assert.equal(result.label.matchMethod, "major-brand-suggestion");
  assert.equal(result.label.matched, false);
});
