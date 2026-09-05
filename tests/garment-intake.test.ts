import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchBrandProduct } from "../lib/product-registry.ts";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";
import type { BrandProductRegistration, UploadDescriptor } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const intake = read("components/garment-intake.tsx");
const dashboard = read("components/consumer-dashboard.tsx");
const verifyRoute = read("app/api/garments/verify/route.ts");

const enrolled: BrandProductRegistration = {
  id: "product-1", ownerSubject: "brand-1", name: "Rotation Tee", brand: "Racked Test Atelier",
  brandSlug: "racked-test-atelier", aliases: ["Racked Test Atelier"], sku: "RTA-TEE-001",
  gtin: "05012345678900", category: "top", labelText: "Racked Test Atelier RTA-TEE-001",
  views: {} as BrandProductRegistration["views"], enrolledAt: new Date().toISOString(), source: "brand-enrolled",
};

const noImages: UploadDescriptor[] = [];

// The boundary the whole feature is built around. Merging the two intake modes must not
// create a cheaper route to verified identity than the one that already existed.
test("REGRESSION: a brand name alone never verifies a product", () => {
  for (const text of ["Racked Test Atelier", "racked test atelier", "Rotation Tee", "Racked Test Atelier Rotation Tee"]) {
    assert.equal(matchBrandProduct(noImages, text, [enrolled]), null, `"${text}" must not verify`);
  }
});

test("verification requires a barcode number, or a brand together with its style code", () => {
  const byGtin = matchBrandProduct(noImages, "05012345678900", [enrolled]);
  assert.equal(byGtin?.method, "gtin");
  assert.equal(byGtin?.product.id, "product-1");

  const bySku = matchBrandProduct(noImages, "Racked Test Atelier RTA-TEE-001", [enrolled]);
  assert.equal(bySku?.method, "brand-sku");

  // A style code with no brand beside it is not evidence of whose product it is.
  assert.equal(matchBrandProduct(noImages, "RTA-TEE-001", [enrolled]), null);
});

test("a garment matching nothing in the registry stays an ordinary wardrobe piece", () => {
  assert.equal(matchBrandProduct(noImages, "M&S 12345 cotton", [enrolled]), null);
  // And the route says so in words a person can act on, without implying fault.
  assert.match(verifyRoute, /No enrolled product matched this label/);
  assert.match(intake, /it simply stays your own garment, with no brand connection/);
});

test("the verify route is consumer-only, rate limited, and writes nothing", () => {
  assert.match(verifyRoute, /session\.role !== "consumer"/);
  assert.match(verifyRoute, /RATE_LIMIT_RULES\.garmentVerify/);
  assert.ok(RATE_LIMIT_RULES.garmentVerify.limit > 0);
  for (const write of ["putPrivateImage", "saveGarment", "PutCommand", "recordWear"]) {
    assert.ok(!verifyRoute.includes(write), `the label check must not ${write}`);
  }
});

test("the route cannot reach a hash-based match, so text evidence stays text evidence", () => {
  // It accepts no image, so it passes no upload descriptors — label-image-hash and
  // catalog-image-set can never fire here even though matchBrandProduct supports them.
  assert.match(verifyRoute, /const parts: UploadDescriptor\[\] = \[\];/);
});

// REGRESSION: the reason the two modes were merged. Only the three-photo flow consulted
// the registry, so a genuine brand product photographed the quick way could never be
// linked — and the person had to guess which mode to pick before photographing anything.
test("REGRESSION: intake is one flow, with brand linking as a per-piece upgrade", () => {
  assert.match(dashboard, /<GarmentIntake onConfirmed=/);
  assert.doesNotMatch(dashboard, /scan-mode-switch/, "the upfront mode choice must be gone");
  assert.doesNotMatch(dashboard, /addMode/, "no intake mode state should remain");
  assert.doesNotMatch(dashboard, /ThreeViewUploader|LookScanUploader/, "both old entry points are replaced");
  assert.match(intake, /Is this a brand product\?/);
  assert.match(intake, /Optional/);
});

test("a verified match fills the brand and SKU from the registry, not from typing", () => {
  assert.match(intake, /overrides: \{ \.\.\.current\.overrides, brand: data\.product!\.brand, sku: data\.product!\.sku \}/);
});

test("every piece shows whether it is brand-linked or simply the person's own", () => {
  assert.match(intake, /BRAND PRODUCT/);
  assert.match(intake, /YOUR GARMENT/);
  assert.match(intake, /NEEDS YOUR LABEL/);
  const css = read("app/globals.css");
  for (const tone of ["verified", "manual", "plain"]) {
    assert.ok(css.includes(`.intake-card.selected.${tone}`), `the ${tone} state needs a visual treatment`);
  }
});

test("brand sharing is still described as separate from linking a product", () => {
  assert.match(intake, /only if you turn on brand data sharing in Settings/);
  assert.match(verifyRoute, /only if you separately enable brand data sharing/);
});
