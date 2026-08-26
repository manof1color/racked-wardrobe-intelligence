import test from "node:test";
import assert from "node:assert/strict";
import { availableCategories, availableStyles, classifyLookStyles, filterLooks, LOOK_CATEGORIES, LOOK_STYLES, lookCategories } from "../lib/look-discovery.ts";
import type { OutfitPost, PublicOutfitGarment } from "../lib/platform-types.ts";

function garment(overrides: Partial<PublicOutfitGarment> & Pick<PublicOutfitGarment, "name" | "category">): PublicOutfitGarment {
  return { publicGarmentId: `g-${overrides.name}`, image: "/api/community/images/p/g", resolutionState: "GENERIC_UNVERIFIED", ...overrides } as PublicOutfitGarment;
}

function post(id: string, garments: PublicOutfitGarment[], overrides: Partial<OutfitPost> = {}): OutfitPost {
  return { id, handle: "@person", outfitTitle: id, caption: "", image: "", createdAt: "2026-08-23T00:00:00Z", likes: 0, sourceType: "consumer", garments, products: [], ...overrides };
}

const formalLook = post("formal", [
  garment({ name: "Navy Blazer", category: "outerwear", subtype: "blazer", style: ["tailored"] }),
  garment({ name: "White Dress Shirt", category: "top", subtype: "dress-shirt" }),
  garment({ name: "Leather Derby", category: "shoe", subtype: "dress-shoes" }),
]);

const streetLook = post("street", [
  garment({ name: "Grey Hoodie", category: "top", subtype: "hoodie", style: ["relaxed"] }),
  garment({ name: "Black Jeans", category: "bottom", subtype: "jeans" }),
  garment({ name: "White Sneakers", category: "shoe", subtype: "sneakers" }),
], { sourceType: "brand" });

const athleticLook = post("athletic", [
  garment({ name: "Training Tee", category: "top", subtype: "t-shirt", style: ["athletic", "performance"] }),
  garment({ name: "Road Runners", category: "shoe", subtype: "running-shoes" }),
]);

const looks = [formalLook, streetLook, athleticLook];

test("style is inferred from the pieces, not from a declared tag", () => {
  assert.ok(classifyLookStyles(formalLook).includes("formal"), "blazer + dress shirt + derbies reads formal");
  assert.ok(classifyLookStyles(streetLook).includes("streetwear"), "hoodie + jeans + sneakers reads streetwear");
  assert.ok(classifyLookStyles(athleticLook).includes("athletic"));
  assert.equal(classifyLookStyles(formalLook).includes("athletic"), false, "a formal look must not read as athletic");
  assert.equal(classifyLookStyles(athleticLook).includes("formal"), false);
});

test("a look with no garments claims no style rather than guessing", () => {
  assert.deepEqual(classifyLookStyles(post("empty", [])), []);
  assert.deepEqual(lookCategories(post("empty", [])), []);
});

test("classification is deterministic and order-stable", () => {
  assert.deepEqual(classifyLookStyles(formalLook), classifyLookStyles(formalLook));
  const reversed = post("formal-reversed", [...formalLook.garments].reverse());
  assert.deepEqual(classifyLookStyles(reversed), classifyLookStyles(formalLook), "piece order must not change the styles");
});

test("categories are read from the pieces present", () => {
  assert.deepEqual(lookCategories(formalLook), ["top", "outerwear", "shoe"]);
  assert.deepEqual(lookCategories(athleticLook), ["top", "shoe"]);
});

test("filtering by style returns only looks evidencing that style", () => {
  const formal = filterLooks(looks, { style: "formal" }).map((entry) => entry.id);
  assert.ok(formal.includes("formal"));
  assert.equal(formal.includes("athletic"), false);
  assert.equal(filterLooks(looks, { style: "all" }).length, 3);
});

test("filtering by category returns only looks containing that category", () => {
  assert.deepEqual(filterLooks(looks, { category: "outerwear" }).map((entry) => entry.id), ["formal"]);
  assert.equal(filterLooks(looks, { category: "shoe" }).length, 3);
});

test("style, category, and source filters compose", () => {
  assert.deepEqual(filterLooks(looks, { style: "streetwear", source: "brand" }).map((entry) => entry.id), ["street"]);
  assert.deepEqual(filterLooks(looks, { style: "streetwear", source: "consumer" }), [], "a brand look must not survive a consumer-only filter");
});

test("search matches titles, captions, garment names, colours, and brands", () => {
  const named = post("named", [garment({ name: "Sienna Overshirt", category: "outerwear", color: "sienna", verifiedProduct: { registryProductId: "r", sku: "S", name: "Sienna Overshirt", brand: "Racked Test Atelier", brandSlug: "racked-test-atelier" } })], { caption: "Layered for autumn" });
  assert.equal(filterLooks([named], { query: "sienna" }).length, 1);
  assert.equal(filterLooks([named], { query: "autumn" }).length, 1);
  assert.equal(filterLooks([named], { query: "Racked Test Atelier" }).length, 1);
  assert.equal(filterLooks([named], { query: "NOTHING MATCHES" }).length, 0);
  assert.equal(filterLooks([named], { query: "  " }).length, 1, "an empty query must not filter anything out");
});

test("search is case-insensitive", () => {
  assert.equal(filterLooks(looks, { query: "HOODIE" }).length, 1);
  assert.equal(filterLooks(looks, { query: "hoodie" }).length, 1);
});

test("REGRESSION: only public post fields are searched, never private wardrobe data", () => {
  const withPrivate = post("private", [garment({ name: "Tee", category: "top" })]) as OutfitPost & Record<string, unknown>;
  withPrivate.ownerId = "private-account-uuid";
  withPrivate.sourceOutfitId = "private-outfit-id";
  assert.equal(filterLooks([withPrivate], { query: "private-account-uuid" }).length, 0, "an owner ID must never be searchable");
  assert.equal(filterLooks([withPrivate], { query: "private-outfit-id" }).length, 0, "a saved-outfit ID must never be searchable");
});

test("the UI is only offered filters that actually have looks", () => {
  const styles = availableStyles(looks).map((entry) => entry.id);
  assert.ok(styles.includes("formal") && styles.includes("streetwear"));
  assert.equal(availableStyles([]).length, 0, "an empty feed offers no style filters");
  const categories = availableCategories(looks).map((entry) => entry.category);
  assert.ok(categories.includes("shoe"));
  assert.equal(categories.includes("jewelry"), false, "a category with no looks must not be offered");
  assert.ok(availableStyles(looks).every((entry) => entry.count > 0));
});

test("every published style definition has a label, description, and signals", () => {
  for (const definition of LOOK_STYLES) {
    assert.ok(definition.label.length > 0 && definition.description.length > 0);
    assert.ok(definition.signals.length > 0, `${definition.id} needs signals`);
  }
  assert.equal(new Set(LOOK_STYLES.map((entry) => entry.id)).size, LOOK_STYLES.length, "style ids must be unique");
  assert.equal(new Set(LOOK_CATEGORIES).size, LOOK_CATEGORIES.length);
});
