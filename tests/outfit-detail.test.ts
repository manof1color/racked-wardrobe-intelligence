import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { outfitDetailOrder, pieceCategoryLabel, piecesLabel, renamedOutfit, savedLabel, wearsLabel } from "../lib/outfit-detail.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the saved-outfit screens use singular and plural correctly", () => {
  assert.equal(wearsLabel(0), "0 wears");
  assert.equal(wearsLabel(1), "1 wear");
  assert.equal(piecesLabel(1), "1 piece");
  assert.equal(piecesLabel(4), "4 pieces");
});

test("categories read as words, and an unknown one never shows its raw value", () => {
  assert.equal(pieceCategoryLabel("shoe"), "Shoes");
  assert.equal(pieceCategoryLabel("outerwear"), "Outerwear");
  assert.equal(pieceCategoryLabel("unknown"), "Piece");
  assert.equal(pieceCategoryLabel("something-else"), "Piece");
});

test("the saved date reads like Aug 9, 2026, and a bad date does not show Invalid Date", () => {
  assert.equal(savedLabel("2026-08-09T12:00:00.000Z", "UTC"), "Saved Aug 9, 2026");
  assert.equal(savedLabel("not a date"), "Saved");
});

test("pieces run head to toe with the outer layer last, keeping saved order within a category", () => {
  const order = outfitDetailOrder([{ category: "outerwear", id: 1 }, { category: "shoe", id: 2 }, { category: "bottom", id: 3 }, { category: "top", id: 4 }, { category: "unknown", id: 5 }, { category: "top", id: 6 }]);
  assert.deepEqual(order.map((piece) => piece.id), [4, 6, 3, 2, 1, 5]);
});

test("renaming trims the name and ignores a blank or unchanged one", () => {
  assert.equal(renamedOutfit("Old", "  New   name "), "New name");
  assert.equal(renamedOutfit("Old", "Old"), null);
  assert.equal(renamedOutfit("Old", "   "), null);
});

test("renaming stays scoped to the signed-in owner and changes only the name", () => {
  const route = read("app/api/consumer/outfits/route.ts");
  assert.match(route, /onlyFields\(body,\["outfitId","itemIds","name"\]\)/);
  assert.match(route, /renameOutfit\(session\.subject,outfitId,name\)/);
  const store = read("lib/server/production-store.ts");
  const start = store.indexOf("export async function renameOutfit");
  const body = store.slice(start, store.indexOf("export async function deleteOutfit", start));
  assert.ok(start > 0);
  assert.match(body, /PK:`USER#\$\{ownerId\}`/);
  assert.match(body, /attribute_exists\(PK\)/);
  assert.match(body, /"SET #name = :name"/);
  assert.doesNotMatch(body, /generateOutfitBoard/, "a new name does not regenerate the board");
});

test("the detail keeps the safeguards: confirm before removing a piece or deleting, and a way back", () => {
  const detail = read("components/outfit-views.tsx");
  assert.match(detail, /aria-label="Back to saved outfits"/);
  assert.match(detail, /Confirm remove/);
  assert.match(detail, /Your garment stays in your wardrobe/);
  assert.match(detail, /Confirm Delete/);
  assert.match(detail, /keeps historical wear records/);
  assert.match(detail, /no longer in your wardrobe/);
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /<OutfitDetail /);
  assert.match(dashboard, /<OutfitList /);
});
