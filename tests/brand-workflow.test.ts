import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandProductUpdate, IMMUTABLE_PRODUCT_FIELDS, matchBrandProduct } from "../lib/product-registry.ts";
import { enumerationBudgetState, ENUMERATION_WINDOW_MS, MAX_DISTINCT_PRODUCTS_PER_WINDOW, type AggregateQueryEvent } from "../lib/privacy.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function product(overrides: Partial<BrandProductRegistration> = {}): BrandProductRegistration {
  return {
    id: "product-1", ownerSubject: "brand-1", name: "Everyday Tee", brand: "Northstar Atelier", brandSlug: "northstar-atelier",
    aliases: ["Northstar Atelier"], sku: "NA-TEE-1", gtin: "05012345678900", category: "top", subtype: "t-shirt",
    color: "navy", price: 89, currency: "USD", availability: "available", labelText: "",
    views: { front: { view: "front", fileName: "f.jpg", contentType: "image/jpeg", size: 1 } },
    enrolledAt: "2026-09-18T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  } as BrandProductRegistration;
}

// ─── Correcting a product ──────────────────────────────────────────────────────

test("a brand can correct what a catalog has to keep current", () => {
  const patch = brandProductUpdate(product(), { name: "Everyday Tee (Organic)", price: "95", availability: "unavailable", color: " Indigo ", productUrl: "https://northstar.example/tee" });
  assert.deepEqual(patch, { name: "Everyday Tee (Organic)", price: 95, availability: "unavailable", color: "indigo", productUrl: "https://northstar.example/tee" });
  assert.deepEqual(brandProductUpdate(product(), { name: "Everyday Tee" }), {}, "an unchanged field is not written");
});

test("an emptied field is removed rather than stored empty", () => {
  assert.deepEqual(brandProductUpdate(product(), { price: "" }), { price: null, currency: null });
  assert.deepEqual(brandProductUpdate(product({ productUrl: "https://northstar.example/tee" }), { productUrl: "" }), { productUrl: null });
  assert.deepEqual(brandProductUpdate(product({ style: ["minimal"] }), { style: "" }), { style: null });
});

// The identity a consumer's label is matched against cannot move to a different product.
test("REGRESSION: brand, style code, barcode, and photos can never be edited", () => {
  const patch = brandProductUpdate(product(), { name: "Renamed", ...{ brand: "Adidas", sku: "AD-1", gtin: "0000000000000", ownerSubject: "brand-2", views: {} } } as never);
  assert.deepEqual(Object.keys(patch), ["name"]);
  for (const field of IMMUTABLE_PRODUCT_FIELDS) assert.equal(field in patch, false, `${field} must not be editable`);
  const editor = read("components/brand-product-editor.tsx");
  assert.doesNotMatch(editor, /field\("sku"\)|field\("gtin"\)|field\("brand"\)/, "the editor offers no identity field");
  assert.match(editor, /these identify the product and cannot change/);
});

test("an alias added later is checked the same way enrollment checks it", () => {
  assert.throws(() => brandProductUpdate(product(), { aliases: "adidas" }), /names another brand/);
  assert.deepEqual(brandProductUpdate(product(), { aliases: "Northstar" }), { aliases: ["Northstar Atelier", "Northstar"] });
  assert.throws(() => brandProductUpdate(product(), { aliases: "Ember Row" }, ["Ember Row"]), /names another brand/);
  const route = read("app/api/brand/products/[productId]/route.ts");
  assert.match(route, /edit\.aliases !== undefined \? await otherBrandNames/, "other brands' names are loaded for that check");
});

test("a bad edit is refused with a reason", () => {
  assert.throws(() => brandProductUpdate(product(), { name: "   " }), /needs a name/);
  assert.throws(() => brandProductUpdate(product(), { price: "-5" }), /between 0 and/);
  assert.throws(() => brandProductUpdate(product(), { price: "20", currency: "dollars" }), /three-letter code/);
  assert.throws(() => brandProductUpdate(product(), { availability: "maybe" }), /listed availability/);
  assert.throws(() => brandProductUpdate(product(), { category: "spaceship" }), /category/);
});

// ─── Retiring ──────────────────────────────────────────────────────────────────

test("retiring stops new links without touching what owners already have", () => {
  assert.deepEqual(brandProductUpdate(product(), { archived: true }), { archived: true });
  assert.deepEqual(brandProductUpdate(product({ archived: true }), { archived: false }), { archived: null }, "restoring removes the flag");
  assert.equal(matchBrandProduct([], "Northstar Atelier NA-TEE-1", [product({ archived: true })]), null, "a retired product answers no label");

  const store = read("lib/server/production-store.ts");
  assert.match(store, /product\.brandSlug===brandSlug&&!product\.archived/, "and leaves the public brand page");
  const editor = read("components/brand-product-editor.tsx");
  assert.match(editor, /Confirm retire/, "retiring takes a second tap");
  assert.match(editor, /Everyone who already owns it keeps their piece, and its recorded wear stays exactly as it is/);
});

test("editing is owner-scoped by key, rate limited, and brand-only", () => {
  const route = read("app/api/brand/products/[productId]/route.ts");
  assert.match(route, /session\.role !== "brand"/);
  assert.match(route, /RATE_LIMIT_RULES\.brandProductEdit/);
  assert.match(route, /status: 404/, "another brand's product is simply not found");
  const store = read("lib/server/production-store.ts");
  const update = store.slice(store.indexOf("export async function updateBrandProduct"), store.indexOf("export async function saveBrandProduct"));
  assert.match(update, /getOwnedBrandProduct\(ownerId,productId\)/);
  assert.match(update, /Key:\{PK:`USER\$\{"\$"\}|PK:`USER#\$\{ownerId\}`,SK:`PRODUCT#\$\{productId\}`/, "the owner is part of the key, not a filter");
  assert.match(update, /ConditionExpression:"attribute_exists\(PK\) AND attribute_exists\(SK\)"/);
});

// ─── The enumeration budget, said out loud ─────────────────────────────────────

test("a brand is told how much of the enumeration budget is left", () => {
  const now = 1_000_000;
  const log: AggregateQueryEvent[] = [
    { subject: "brand-1", productId: "a", at: now - 60_000 },
    { subject: "brand-1", productId: "b", at: now - 30_000 },
    { subject: "brand-1", productId: "a", at: now - 10_000 },
    { subject: "brand-1", productId: "old", at: now - ENUMERATION_WINDOW_MS - 1 },
    { subject: "brand-2", productId: "c", at: now },
  ];
  const state = enumerationBudgetState(log, "brand-1", now);
  assert.equal(state.used, 2, "revisiting a product does not spend the budget again");
  assert.equal(state.limit, MAX_DISTINCT_PRODUCTS_PER_WINDOW);
  assert.equal(state.remaining, MAX_DISTINCT_PRODUCTS_PER_WINDOW - 2);
  assert.equal(state.resetsInSeconds, Math.ceil((ENUMERATION_WINDOW_MS - 60_000) / 1000));
  assert.deepEqual(enumerationBudgetState([], "brand-1", now), { used: 0, limit: MAX_DISTINCT_PRODUCTS_PER_WINDOW, remaining: MAX_DISTINCT_PRODUCTS_PER_WINDOW, resetsInSeconds: 0 });

  const dashboard = read("components/brand-dashboard.tsx");
  assert.match(dashboard, /This limit protects owners from being identified by comparison across products/);
  assert.doesNotMatch(dashboard, /budget\.used/, "the note says what is left, not what was looked at");
});

// ─── Finding a product, and pointing customers at the catalog ──────────────────

test("the catalog can be searched, and retired products are out of the way", () => {
  const dashboard = read("components/brand-dashboard.tsx");
  assert.match(dashboard, /function matchesQuery/);
  assert.match(dashboard, /Search by name, style code, or category/);
  assert.match(dashboard, /Show \{retiredCount\} retired/);
  assert.match(dashboard, /products\.filter\(item=>!item\.archived\)\.length\} live SKU/);
  assert.match(dashboard, /const arrived=next\.find\(item=>!known\.has\(item\.id\)\);if\(arrived&&current\.length\)setProductId\(arrived\.id\)/, "a newly enrolled product is the one being looked at");
});

test("a brand is given its public page to share, and no claim about what sharing does", () => {
  const dashboard = read("components/brand-dashboard.tsx");
  const share = dashboard.slice(dashboard.indexOf("brand-share"), dashboard.indexOf("</div>", dashboard.indexOf("brand-share-link")));
  assert.match(share, /Tell customers where to link/);
  assert.match(share, /\/brands\/\{product\.brandSlug\}/);
  assert.match(share, /Copy link/);
  for (const claim of ["sales", "revenue", "conversion", "purchase intent", "more customers", "grow"]) {
    assert.ok(!share.toLowerCase().includes(claim), `the share block must not claim ${claim}`);
  }
});
