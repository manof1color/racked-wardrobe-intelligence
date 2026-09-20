import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogAppearance, MAX_CATALOG_CANDIDATES, rankCatalogCandidates, readCatalogPieceDescription, searchCatalog } from "../lib/catalog-match.ts";
import { costPerWearLine } from "../lib/cost-per-wear.ts";
import { wardrobeItemToOutfitPiece } from "../lib/outfit-contracts.ts";
import { describeProductFromDetections } from "../lib/product-description.ts";
import { createBrandProductRegistration } from "../lib/product-registry.ts";
import type { DetectedLookGarment } from "../lib/look-garment-detection.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function product(id: string, overrides: Partial<BrandProductRegistration>): BrandProductRegistration {
  return {
    id, ownerSubject: "brand-1", name: "Product", brand: "Northstar Atelier", brandSlug: "northstar-atelier",
    aliases: ["Northstar Atelier", "Northstar"], sku: `NA-${id}`, gtin: null, category: "top", labelText: "",
    views: { front: { view: "front", fileName: "front.jpg", contentType: "image/jpeg", size: 1, storageKey: "brand/1/front.jpg" } },
    enrolledAt: "2026-09-18T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  } as BrandProductRegistration;
}

const registry = [
  product("TEE", { name: "Everyday Tee", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton" }),
  product("HOOD", { name: "Cream Fleece Hoodie", subtype: "hoodie", color: "cream" }),
  product("CHINO", { name: "Navy Chinos", category: "bottom", subtype: "chinos", color: "navy" }),
  product("POCKET", { name: "Navy Pocket Tee", brand: "Ember Row", brandSlug: "ember-row", aliases: ["Ember Row"], subtype: "t-shirt", color: "navy" }),
  product("OLD", { name: "Retired Navy Tee", subtype: "t-shirt", color: "navy", archived: true }),
];

// ─── Recognition ───────────────────────────────────────────────────────────────

test("a product's type and colour are read from its name when the brand left them blank", () => {
  const tote = catalogAppearance(product("TOTE", { name: "Merlot Day Tote", category: "bag" }));
  assert.equal(tote.subtype, "tote");
  assert.equal(tote.color, "merlot");
  const unnamed = catalogAppearance(product("X", { name: "Signature Piece" }));
  assert.equal(unnamed.subtype, undefined, "no type is invented when the name names none");
});

test("a scanned piece is recognised as the brand product it looks like", () => {
  const candidates = rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton", brandText: "Northstar" }, registry);
  assert.equal(candidates[0].registryProductId, "TEE");
  assert.equal(candidates[0].brandEvidence, true);
  assert.ok(candidates[0].reasons.includes("Northstar Atelier was read on this piece"));
  assert.ok(candidates[0].reasons.some((reason) => reason.startsWith("Same type")));
  assert.ok(candidates.length <= MAX_CATALOG_CANDIDATES);
  const ids = candidates.map((candidate) => candidate.registryProductId);
  assert.ok(!ids.includes("HOOD"), "a hoodie is never offered as someone's t-shirt");
  assert.ok(!ids.includes("CHINO"), "nor a pair of chinos");
  assert.ok(!ids.includes("OLD"), "nor a retired product");
});

test("without a brand name on the piece, only a close look-alike is offered", () => {
  const close = rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "navy" }, registry).map((candidate) => candidate.registryProductId);
  assert.ok(close.includes("POCKET") && close.includes("TEE"), "same type and colour clears the bar");
  assert.deepEqual(rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "red" }, registry), [], "a red tee is not these navy tees");
  assert.deepEqual(rankCatalogCandidates({ category: "unknown", brandText: "Northstar" }, registry), [], "an unrecognised piece is matched to nothing");
});

test("a suggestion carries only what the brand's public page already shows", () => {
  const [candidate] = rankCatalogCandidates({ category: "top", subtype: "t-shirt", color: "navy", brandText: "Northstar" }, registry);
  const allowed = new Set(["registryProductId", "name", "brand", "brandSlug", "sku", "category", "subtype", "color", "price", "currency", "imageUrl", "score", "brandEvidence", "reasons"]);
  assert.deepEqual(Object.keys(candidate).filter((key) => !allowed.has(key)), [], "no owner, storage key, or label text");
});

// ─── Search ────────────────────────────────────────────────────────────────────

test("a person can find the product by brand, name, or style code", () => {
  assert.deepEqual(searchCatalog("northstar", registry, { category: "top" }).map((result) => result.registryProductId).sort(), ["HOOD", "TEE"]);
  assert.deepEqual(searchCatalog("northstar hood", registry).map((result) => result.registryProductId), ["HOOD"], "every word narrows");
  assert.deepEqual(searchCatalog("NA-CHINO", registry).map((result) => result.registryProductId), ["CHINO"]);
  assert.deepEqual(searchCatalog("ember tee", registry).map((result) => result.registryProductId), ["POCKET"]);
  assert.deepEqual(searchCatalog("retired", registry), [], "a retired product is not listed");
  assert.deepEqual(searchCatalog("n", registry), [], "one letter is not a search");
});

test("a piece description from the browser is read defensively", () => {
  assert.equal(readCatalogPieceDescription(null), null);
  assert.equal(readCatalogPieceDescription({ subtype: "t-shirt" }), null, "a category is required");
  const read = readCatalogPieceDescription({ category: "top", style: ["minimal", 7, "x".repeat(100)], brandText: "y".repeat(500) })!;
  assert.deepEqual(read.style, ["minimal", "x".repeat(30)]);
  assert.equal(read.brandText?.length, 100);
});

// ─── The link a search or suggestion creates ───────────────────────────────────

// The boundary this feature must not cross: a product found by how it looks, or by a search, is the
// owner's own statement. It is never verified identity and never enters a brand's wear aggregates.
test("REGRESSION: a catalog pick is never verified identity and never reaches brand aggregates", () => {
  const store = read("lib/server/production-store.ts");
  const add = store.slice(store.indexOf("export async function addWardrobeItem"), store.indexOf("export async function recordRealWear"));
  assert.match(add, /const registryProductId=registryMatch\?registryMatch\.product\.id:analysis\.label\.matched\?analysis\.label\.registryProductId:null;/, "only label evidence produces a registry link");
  assert.match(add, /identityStatus=registryProductId\?"verified":selectedProduct\?"owner-selected":/);
  assert.match(add, /GSI1PK:registryProductId\?`PRODUCT#\$\{registryProductId\}`:undefined/, "the brand's owner index is keyed by verified links only");
  assert.match(add, /registry\.find\(product=>product\.id===selectedId&&!product\.archived\)/, "a pick must name a live catalog product");

  const picked = { id: "item-1", name: "My tee", category: "top", subtype: "t-shirt", color: "navy", style: [], season: "all-season", wearCount: 0, lastWornDays: 999, source: "ai-confirmed", art: "photo", brand: "Northstar Atelier", sku: "NA-TEE", identityStatus: "owner-selected", selectedProductId: "TEE" } as unknown as WardrobeItem;
  assert.equal(wardrobeItemToOutfitPiece(picked).resolution.state, "GENERIC_UNVERIFIED", "a published pick is never presented as the exact product");
  const recreate = read("lib/recreate-look.ts");
  assert.match(recreate, /item\.identityStatus==="verified"&&item\.registryProductId===exactId/, "and Recreate never treats it as owning the exact product");
});

test("the intake sends a pick as a selection and a label as evidence, never both as proof", () => {
  const intake = read("components/garment-intake.tsx");
  assert.match(intake, /catalogProductId: piece\.link\.status === "selected" \? piece\.link\.product\.registryProductId : null/);
  assert.match(intake, /labelText: piece\.link\.status === "verified" \? piece\.labelText : null/);
  assert.match(intake, /BRAND · YOUR PICK/);
  assert.match(intake, /Linked as your pick, visible only to you/);
  assert.match(intake, /if \(opening && piece\.candidatesState === "idle"/, "suggestions load once, when the person asks");
  assert.match(intake, /current\.query === query \?/, "a slow older search never overwrites a newer one");
});

test("the catalog route is Consumer-only, rate limited, and writes nothing", () => {
  const route = read("app/api/catalog/route.ts");
  assert.match(route, /session\.role !== "consumer"/);
  assert.match(route, /RATE_LIMIT_RULES\[rule\]/);
  for (const write of ["PutCommand", "putPrivateImage", "saveBrandProduct", "addWardrobeItem"]) assert.ok(!route.includes(write), `the catalog must not ${write}`);
});

// ─── Brand enrollment from one photo ───────────────────────────────────────────

test("a product enrolls from one photo, with its look recorded for recognition", () => {
  const enrolled = createBrandProductRegistration({
    ownerSubject: "brand-1", name: "Everyday Tee", brand: "Northstar Atelier", aliases: [], sku: "na-tee-1", category: "Tops",
    subtype: "T-Shirt", color: " Navy ", pattern: "solid", material: "Cotton", style: "Minimal, workwear, minimal",
    parts: [{ view: "front", fileName: "tee.jpg", contentType: "image/jpeg", size: 100 }],
  });
  assert.equal(enrolled.category, "top");
  assert.equal(enrolled.subtype, "t-shirt");
  assert.equal(enrolled.color, "navy");
  assert.equal(enrolled.material, "cotton");
  assert.deepEqual(enrolled.style, ["minimal", "workwear"]);
  assert.equal(enrolled.views.back, undefined, "no back or label photo is needed");
  assert.equal(enrolled.labelText, "", "and no label text");
  assert.throws(() => createBrandProductRegistration({ ownerSubject: "b", name: "Tee", brand: "Northstar Atelier", aliases: [], sku: "X-1", category: "top", parts: [] }), /Add a product photo/);
  assert.throws(() => createBrandProductRegistration({ ownerSubject: "b", name: "Tee", brand: "Northstar Atelier", aliases: [], sku: "X-1", category: "spaceship", parts: [{ view: "front", fileName: "a.jpg", contentType: "image/jpeg", size: 1 }] }), /category/);
  const route = read("app/api/brand/products/route.ts");
  assert.match(route, /Add a product photo\./);
  assert.doesNotMatch(route, /Exactly one \$\{view\} image is required/);
});

test("Fill in from photo describes the largest recognised piece and stores nothing", () => {
  const detection = (id: string, width: number, garment: Record<string, unknown>, provider = "bedrock-look") => ({
    id, exactBounds: true, bounds: { x: 0, y: 0, width, height: 0.5 },
    analysis: { provider, confidence: 80, garment: { name: "Piece", category: "top", subtype: "other-top", color: "unknown", pattern: "solid", material: "cotton", style: ["minimal"], ...garment } },
  }) as unknown as DetectedLookGarment;
  const suggestion = describeProductFromDetections([
    detection("small", 0.2, { name: "Belt", category: "accessory", subtype: "belt" }),
    detection("large", 0.6, { name: "Navy Overshirt", category: "outerwear", subtype: "other-outerwear", color: "navy" }),
  ])!;
  assert.equal(suggestion.name, "Navy Overshirt");
  assert.equal(suggestion.subtype, undefined, "an 'other' type is left for the brand to choose");
  assert.equal(suggestion.color, "navy");
  assert.equal(suggestion.piecesInPhoto, 2);
  assert.equal(describeProductFromDetections([detection("x", 1, {}, "manual-review")]), null, "a manual-review stand-in describes nothing");

  const route = read("app/api/brand/products/describe/route.ts");
  assert.match(route, /session\.role !== "brand"/);
  assert.match(route, /RATE_LIMIT_RULES\.brandProductDescribe/);
  for (const write of ["putPrivateImage", "saveBrandProduct", "PutCommand"]) assert.ok(!route.includes(write), `reading a photo must not ${write}`);
});

// ─── The reward for linking ────────────────────────────────────────────────────

test("a linked piece shows its cost per wear, labelled as the brand's listed price", () => {
  assert.equal(costPerWearLine({ listedPrice: 90, listedCurrency: "USD", wearCount: 3 }), "$30.00 a wear, from the brand's listed price");
  assert.equal(costPerWearLine({ listedPrice: 90, listedCurrency: "USD", wearCount: 0 }), "Listed at $90.00 · wear it to see its cost per wear");
  assert.equal(costPerWearLine({ listedPrice: 40, listedCurrency: "not-a-code", wearCount: 4 }), "$10.00 a wear, from the brand's listed price");
  assert.equal(costPerWearLine({ listedPrice: null, wearCount: 5 }), null, "an unlinked piece has no price to divide");
  assert.equal(costPerWearLine({ listedPrice: -1, wearCount: 5 }), null);
  const store = read("lib/server/production-store.ts");
  assert.match(store, /listedPrice:catalogProduct\?\.price\?\?null/, "the price comes from the catalog, never from the browser");
});
