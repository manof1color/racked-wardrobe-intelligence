import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  conflictingAlias,
  createBrandProductRegistration,
  gtinKey,
  isReservedBrandName,
  isValidGtin,
  matchBrandProduct,
  registryIdentityConflict,
  slugifyBrand,
} from "../lib/product-registry.ts";
import { wardrobeItemToOutfitPiece } from "../lib/outfit-contracts.ts";
import type { BrandProductRegistration, GarmentView, UploadDescriptor } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const parts: UploadDescriptor[] = (["front", "back", "label"] as GarmentView[]).map((view) => ({ view, fileName: `${view}.jpg`, contentType: "image/jpeg", size: 1200 }));

function product(overrides: Partial<BrandProductRegistration> = {}): BrandProductRegistration {
  return {
    id: "product-1", ownerSubject: "brand-1", name: "Archive Shirt", brand: "Example Brand", brandSlug: "example-brand",
    aliases: ["Example Brand"], sku: "EX-100", gtin: "05012345678900", category: "top", labelText: "",
    views: {} as BrandProductRegistration["views"], enrolledAt: "2026-09-18T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  };
}

// ─── Label evidence ────────────────────────────────────────────────────────────

test("a barcode matches however the label prints it", () => {
  const enrolled = [product()];
  assert.equal(matchBrandProduct([], "5012345678900", enrolled)?.method, "gtin", "EAN-13 on the label, GTIN-14 in the registry");
  assert.equal(matchBrandProduct([], "barcode 5 012345 678900", enrolled)?.method, "gtin", "printed in groups");
  assert.equal(gtinKey("036000291452"), "00036000291452", "a UPC-A is the same code as its 14-digit form");
  assert.equal(gtinKey("12345"), null);
});

// REGRESSION: matching was a substring test, so a barcode inside a longer number, or a style code
// that was the start of a different one, verified a product it was not.
test("REGRESSION: a code only matches as a whole code, never inside a longer one", () => {
  const enrolled = [product()];
  assert.equal(matchBrandProduct([], "9905012345678900", enrolled), null, "a GTIN inside a longer number");
  assert.equal(matchBrandProduct([], "Example Brand EX-1001", enrolled), null, "EX-1001 is not EX-100");
  assert.equal(matchBrandProduct([], "Example Brand XEX-100", enrolled), null);
  assert.equal(matchBrandProduct([], "EXAMPLE BRAND ex 100", enrolled)?.method, "brand-sku", "separators may differ");
  assert.equal(matchBrandProduct([], "examplebrand ex100", enrolled)?.method, "brand-sku");
});

test("a retired product answers no label", () => {
  assert.equal(matchBrandProduct([], "Example Brand EX-100", [product({ archived: true })]), null);
});

test("barcodes are checked at enrollment, so a typo cannot silently never match", () => {
  assert.equal(isValidGtin("05012345678900"), true);
  assert.equal(isValidGtin("5012345678900"), true);
  assert.equal(isValidGtin("05012345678901"), false);
  assert.throws(
    () => createBrandProductRegistration({ ownerSubject: "brand-1", name: "Shirt", brand: "Example Brand", aliases: [], sku: "EX-1", gtin: "05012345678901", category: "top", labelText: "EX-1", parts }),
    /check digit/,
  );
});

// ─── Brand identity ────────────────────────────────────────────────────────────

test("well-known brand names are reserved, however they are dressed up", () => {
  for (const name of ["Nike", "NIKE Official", "Nike, Inc.", "adidas", "Levi's", "Patagonia Store"]) {
    assert.equal(isReservedBrandName(name), true, name);
  }
  for (const name of ["Northstar Atelier", "Jordan Smith Tailoring", "Filament Studio", "Racked Test Atelier"]) {
    assert.equal(isReservedBrandName(name), false, name);
  }
});

// REGRESSION: aliases were free text, so any account could add another brand's name to its own
// product and have that brand's labels verify as its product.
test("REGRESSION: a product's aliases cannot claim another brand", () => {
  assert.equal(conflictingAlias(["Northstar", "NSA"], "Northstar Atelier"), null, "spellings of your own name are fine");
  assert.equal(conflictingAlias(["Adidas Originals"], "Northstar Atelier"), "Adidas Originals");
  assert.equal(conflictingAlias(["Ember Row Studio"], "Northstar Atelier", ["Ember Row"]), "Ember Row Studio", "another Racked brand's name is protected too");
  assert.equal(conflictingAlias(["Filament"], "Filament Studio"), null, "a name that merely contains a short brand word is not a claim");
  assert.throws(
    () => createBrandProductRegistration({ ownerSubject: "brand-1", name: "Runner", brand: "Northstar Atelier", aliases: ["adidas"], sku: "NA-1", category: "shoe", labelText: "NA-1", parts }),
    /names another brand/,
  );
});

// REGRESSION: nothing stopped a second record answering the same barcode or style code, and the
// first-listed record won every match.
test("REGRESSION: one barcode and one brand style code map to one product", () => {
  const registry = [product()];
  assert.match(registryIdentityConflict(product({ id: "product-2", brandSlug: "other-brand", sku: "OB-1", gtin: "5012345678900" }), registry)!, /GTIN is already enrolled/);
  assert.match(registryIdentityConflict(product({ id: "product-2", gtin: null, sku: "ex 100" }), registry)!, /already enrolled for this brand/);
  assert.equal(registryIdentityConflict(product({ id: "product-2", gtin: null, brandSlug: "other-brand" }), registry), null, "the same style code at a different brand is a different product");
  assert.equal(registryIdentityConflict(product({ id: "product-2", gtin: null }), [product({ archived: true })]), null, "a retired record frees its identity");
});

test("brand names produce one slug everywhere, accents included", () => {
  assert.equal(slugifyBrand("Café Noir"), "cafe-noir");
  const store = read("lib/server/production-store.ts");
  assert.match(store, /function slugify\(value:string\) \{ return slugifyBrand\(value\); \}/);
});

// REGRESSION: published looks slugged brand names with their own rule, which dropped accented
// letters, so a look with a verified "Café Noir" piece never appeared on /brands/cafe-noir.
test("REGRESSION: a published verified piece carries the registry's brand slug", () => {
  const item = { id: "item-1", name: "Wool coat", category: "outerwear", subtype: "overcoat", color: "black", style: [], season: "all-season", wearCount: 0, lastWornDays: 999, source: "ai-confirmed", art: "photo", brand: "Café Noir", sku: "CN-1", registryProductId: "product-9", identityStatus: "verified" } as unknown as WardrobeItem;
  const piece = wardrobeItemToOutfitPiece(item);
  assert.equal(piece.resolution.state, "EXACT_VERIFIED_PRODUCT");
  assert.equal(piece.resolution.brandSlug, slugifyBrand("Café Noir"));
  assert.equal(piece.resolution.brandSlug, "cafe-noir");
});

test("a brand name is held by one account, reserved before the account exists", () => {
  const store = read("lib/server/production-store.ts");
  const create = store.slice(store.indexOf("export async function createAccount"), store.indexOf("async function reserveBrandName"));
  assert.ok(create.indexOf("reserveBrandName(") < create.indexOf('SK:"PROFILE"'), "the name is reserved before the profile is written");
  assert.match(create, /BRANDNAME#\$\{account\.brandSlug\}/, "a failed account write releases the name it reserved");
  const reserve = store.slice(store.indexOf("async function reserveBrandName"));
  assert.match(reserve, /isReservedBrandName\(brandName\)/);
  assert.match(reserve, /PK:`BRANDNAME#\$\{brandSlug\}`,SK:"CLAIM"[^}]*\},ConditionExpression:"attribute_not_exists\(PK\)"/);
  assert.match(reserve, /begins_with\(GSI1SK, :slug\)/, "accounts from before reservations keep their name through their products");
});

test("enrollment checks everything before a photo is stored", () => {
  const route = read("app/api/brand/products/route.ts");
  assert.ok(route.indexOf("registryIdentityConflict(") < route.indexOf("putPrivateImage("), "no orphaned uploads from a rejected enrollment");
  assert.match(route, /otherBrandNames:others/);
  assert.match(route, /status:409/);
});

// ─── The verified link itself ──────────────────────────────────────────────────

// REGRESSION: a label check that matched showed "linked" in the browser, then the piece was saved
// from the original scan — which had matched nothing — so no verified link was ever stored and
// the brand never received that owner.
test("REGRESSION: a matched label is saved as a verified link, re-checked on the server", () => {
  const intake = read("components/garment-intake.tsx");
  assert.match(intake, /labelText: piece\.link\.status === "verified" \? piece\.labelText : null/);
  const store = read("lib/server/production-store.ts");
  const add = store.slice(store.indexOf("export async function addWardrobeItem"), store.indexOf("export async function recordRealWear"));
  assert.match(add, /const registry=[^;]*await listRegistryProducts\(\)/);
  assert.match(add, /matchBrandProduct\(\[\],labelEvidence,registry\)/, "the evidence is matched again, not trusted");
  assert.match(add, /const catalogProduct=registryMatch\?\.product\?\?selectedProduct;/, "a label match wins over a catalog pick");
  assert.match(add, /catalogProduct\?catalogProduct\.brand:/, "the registry's brand is authoritative once matched");
  assert.match(add, /GSI1PK:registryProductId\?`PRODUCT#\$\{registryProductId\}`:undefined/, "and the brand index uses the checked link");
  assert.doesNotMatch(add, /overrides\?\.verified|overrides\?\.registryProductId/, "the browser cannot name a product to link");
});

// ─── Scale and privacy ─────────────────────────────────────────────────────────

// REGRESSION: one Query stops at 1 MB with no error, so a large registry or a product with many
// owners was silently cut short.
test("REGRESSION: registry and wear queries read every page", () => {
  const store = read("lib/server/production-store.ts");
  const registry = store.slice(store.indexOf("export async function listRegistryProducts"), store.indexOf("export async function getRegistryProductById"));
  assert.match(registry, /queryEveryPage\(\{IndexName:"GSI1"/);
  const metrics = store.slice(store.indexOf("export async function getRealProductMetrics"), store.indexOf("// ─── Hanger conversation memory"));
  assert.equal((metrics.match(/queryEveryPage\(/g) ?? []).length, 2);
  assert.doesNotMatch(metrics, /new QueryCommand\(\{TableName:requireTable\(\),IndexName:"GSI1"/);
});

test("below the threshold even the owner count is withheld", () => {
  const store = read("lib/server/production-store.ts");
  assert.match(store, /if\(segmentSize<minimumCohortSize\)return \{[^}]*segmentSize:0,suppressed:true/);
  const dashboard = read("components/brand-dashboard.tsx");
  const suppressedBranch = dashboard.slice(dashboard.indexOf("metrics?.suppressed?"), dashboard.indexOf(":metrics&&<>"));
  assert.doesNotMatch(suppressedBranch, /metrics\.segmentSize/);
  assert.match(suppressedBranch, /Fewer than \{metrics\.minimumCohortSize\} qualifying owners/);
});
