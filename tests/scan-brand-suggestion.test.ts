import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandCatalog, brandTextNames, rankCatalogCandidates, searchCatalog } from "../lib/catalog-match.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const intake = read("components/garment-intake.tsx");

function product(id: string, overrides: Partial<BrandProductRegistration>): BrandProductRegistration {
  return {
    id, ownerSubject: "brand-v", name: "Product", brand: "Versatile", brandSlug: "versatile", aliases: ["Versatile"],
    sku: `V-${id}`, gtin: null, category: "top", labelText: "", enrolledAt: "2026-09-20T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  } as BrandProductRegistration;
}

const registry = [
  product("FLAG", { name: "\"Flag\" Tee shirt", subtype: "t-shirt", color: "black", pattern: "graphic", material: "cotton" }),
  product("HOOD", { name: "Logo Hoodie", subtype: "hoodie", color: "grey" }),
  product("PLAIN", { name: "Plain Tee", brand: "Otherbrand", brandSlug: "otherbrand", aliases: ["Otherbrand"], subtype: "t-shirt", color: "black" }),
];

// The scan of the reported shirt: "Versatile" printed on it, but its type read as a sweatshirt.
const scanned = { category: "top", subtype: "sweatshirt", color: "black", pattern: "graphic", material: "cotton" };

// REGRESSION: the scan read "Versatile" off the shirt and passed it to the matcher, and the
// matcher still answered "No enrolled product looks like this one" — because it ruled out any
// product whose type disagreed before it looked at the brand. The owner had to type the brand in.
test("REGRESSION: a brand printed on the garment finds its product even when the scan misjudged the type", () => {
  const candidates = rankCatalogCandidates({ ...scanned, brandText: "Versatile" }, registry);
  assert.equal(candidates[0]?.registryProductId, "FLAG", "the Versatile tee is offered first");
  assert.equal(candidates[0].brandEvidence, true);
  assert.ok(candidates[0].reasons.includes("Versatile was read on this piece"));
  assert.ok(candidates[0].reasons.some((reason) => /^Listed as t shirt; the scan read sweatshirt$/.test(reason)), "and says plainly that the types differ, so the person decides");
});

test("the brand overrides a type disagreement only when the colour matches exactly", () => {
  const ids = rankCatalogCandidates({ ...scanned, brandText: "Versatile" }, registry).map((candidate) => candidate.registryProductId);
  assert.ok(!ids.includes("HOOD"), "a grey hoodie is not offered for a black shirt, whatever the label");
  assert.ok(!ids.includes("PLAIN"), "another brand's tee gains nothing from Versatile's name");
});

test("without a brand read on the garment, a type disagreement still rules a product out", () => {
  assert.deepEqual(rankCatalogCandidates(scanned, registry), [], "no printed brand, no exception to the type rule");
});

// The scan's reading is a suggestion. The intake opens on it and fetches matches, but a link is
// only ever made by the person's own tap — the registry-only verification boundary is unchanged.
test("a brand read on the garment opens the section with the search filled in, and links nothing", () => {
  assert.match(intake, /expanded: Boolean\(readBrand\)/, "the brand section opens by itself");
  assert.match(intake, /query: readBrand,/, "the search starts from what the scan read");
  assert.match(intake, /continue;\s*void loadCandidates\(entry\);\s*\}/, "look-alikes are fetched as soon as the piece appears");
  assert.match(intake, /if \(piece\.readBrand && !candidates\.some\(\(candidate\) => candidate\.brandEvidence\) && !brandProducts\.length\) searchCatalog\(piece, piece\.readBrand\);/,
    "the brand search runs only when the catalog found nothing of that brand — matching is rate-limited and a batch holds up to 24 pieces");
  assert.match(intake, /link: \{ status: "none" \},/, "a new piece is never linked");
  assert.match(intake, /nothing is linked until you choose it/);
  assert.match(intake, /function searchOnlyResults\(piece: Piece\)/, "a product offered as a look-alike is not listed again under search");
});

// REGRESSION: a brand on Racked that the scan read still had to be looked up by hand. Look-alike
// ranking is strict about the garment, so when the scan misjudged the piece's colour shade, type
// or category, the brand's own products were all ruled out; the owner saw nothing, or only another
// brand's look-alikes (which also stopped the fallback search from running).
const shelf = [
  ...registry,
  product("JKT", { name: "Coach Jacket", category: "outerwear", subtype: "jacket", color: "navy" }),
  product("OW", { name: "Arrow Hoodie", brand: "Off-White", brandSlug: "off-white", aliases: [], subtype: "hoodie", color: "black" }),
  product("LEV", { name: "501 Jeans", brand: "Levi's", brandSlug: "levis", aliases: [], category: "bottom", subtype: "jeans", color: "blue" }),
  product("GONE", { name: "Old Tee", subtype: "t-shirt", color: "black", archived: true }),
];

test("REGRESSION: a brand read on the garment lists that brand's products even when the scan misjudged the piece", () => {
  const sweatshirt = { category: "top", subtype: "sweatshirt", color: "charcoal", brandText: "Versatile" };
  assert.deepEqual(rankCatalogCandidates(sweatshirt, shelf).filter((c) => c.brandEvidence), [], "look-alike ranking stays strict about the garment");
  assert.deepEqual(brandCatalog(sweatshirt, shelf).map((p) => p.registryProductId), ["FLAG", "HOOD", "JKT"], "the brand's own pieces are listed, same category first");
  const jacketReadAsTop = brandCatalog({ category: "top", subtype: "overshirt", color: "navy", brandText: "VERSATILE CLOTHING CO." }, shelf).map((p) => p.registryProductId);
  assert.ok(jacketReadAsTop.includes("JKT"), "a different category does not hide the brand's jacket");
  assert.ok(!jacketReadAsTop.includes("GONE"), "an archived product is never offered");
  assert.ok(!jacketReadAsTop.includes("PLAIN"), "another brand gains nothing");
});

test("the brand list leaves out what is already offered as a look-alike, and needs a brand", () => {
  const piece = { category: "top", subtype: "t-shirt", color: "black", brandText: "Versatile" };
  const offered = rankCatalogCandidates(piece, shelf).map((c) => c.registryProductId);
  assert.ok(offered.includes("FLAG"));
  assert.ok(!brandCatalog(piece, shelf, { exclude: offered }).some((p) => offered.includes(p.registryProductId)));
  assert.deepEqual(brandCatalog({ category: "top", subtype: "t-shirt", color: "black" }, shelf), [], "nothing is listed without a brand read");
});

test("a brand read off a label matches despite spacing, punctuation, extra words, or one misread letter", () => {
  const versatile = shelf[0];
  for (const read of ["VERSATILE", "Versatile Clothing Co.", "VERSATLE", "Versatiel", "VERSATILLE"]) assert.equal(brandTextNames(versatile, read), true, read);
  assert.equal(brandTextNames(shelf.find((p) => p.id === "OW")!, "OFF WHITE"), true);
  assert.equal(brandTextNames(shelf.find((p) => p.id === "LEV")!, "LEVIS"), true);
  for (const read of ["Verse", "Universal", "VRSTL", "Diverse"]) assert.equal(brandTextNames(versatile, read), false, read);
  const gap = product("GAP", { brand: "Gap", aliases: [] });
  assert.equal(brandTextNames(gap, "Gab"), false, "a short brand name must be read exactly");
});

test("searching a brand works however it is typed", () => {
  const ids = (query: string, category?: string) => searchCatalog(query, shelf, { category }).map((p) => p.registryProductId);
  assert.deepEqual(ids("offwhite"), ["OW"]);
  assert.deepEqual(ids("levis"), ["LEV"]);
  assert.deepEqual(ids("Levi's jeans"), ["LEV"]);
  assert.deepEqual(ids("versatle", "top").sort(), ["FLAG", "HOOD"], "a misspelled brand still finds it when nothing else matches");
  assert.ok(ids("Versatile Co.", "top").includes("FLAG"), "company-form words on a label do not narrow the search away");
  assert.deepEqual(ids("versatile hoodie"), ["HOOD"], "real extra words still narrow");
});

test("the intake shows the read brand's other products and the catalog route returns them", () => {
  const route = read("app/api/catalog/route.ts");
  assert.match(route, /brandCatalog\(piece, registry, \{ exclude: candidates\.map/);
  assert.match(route, /brandProducts: await withImages\(brandProducts, registry\)/);
  assert.match(intake, /piece\.brandProducts\.map\(\(product\) =>/);
  assert.match(intake, /\[\.\.\.\(piece\.candidates \?\? \[\]\), \.\.\.piece\.brandProducts\]/, "a product is never listed twice");
});
