import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankCatalogCandidates } from "../lib/catalog-match.ts";
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
  assert.match(intake, /void loadCandidates\(entry\);\s*searchCatalog\(entry, entry\.readBrand\);/, "matches are fetched as soon as the piece appears");
  assert.match(intake, /link: \{ status: "none" \},/, "a new piece is never linked");
  assert.match(intake, /nothing is linked until you choose it/);
  assert.match(intake, /function searchOnlyResults\(piece: Piece\)/, "a product offered as a look-alike is not listed again under search");
});
