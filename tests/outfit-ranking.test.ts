import test from "node:test";
import assert from "node:assert/strict";
import { MAX_OUTFIT_PIECES, previouslySuggestedItemIds, rankOutfit, readOutfitIntent } from "../lib/outfit-ranking.ts";
import { selectGroundedOutfit } from "../lib/hanger-conversation.ts";
import type { WardrobeItem } from "../lib/types.ts";

function garment(overrides: Partial<WardrobeItem> & Pick<WardrobeItem, "id" | "name" | "category">): WardrobeItem {
  return {
    color: "black", style: [], season: "all-season", wearCount: 0, lastWornDays: 30,
    source: "ai-confirmed", art: "photo", ...overrides,
  } as WardrobeItem;
}

const wardrobe: WardrobeItem[] = [
  garment({ id: "a-suit-jacket", name: "Tailored Blazer", category: "outerwear", style: ["tailored", "classic"], season: "all-season", wearCount: 2, lastWornDays: 40 }),
  garment({ id: "b-oxford", name: "Blue Oxford", category: "top", style: ["classic", "smart"], season: "all-season", wearCount: 3, lastWornDays: 10 }),
  garment({ id: "c-hoodie", name: "Grey Hoodie", category: "top", style: ["casual", "relaxed"], season: "all-season", wearCount: 12, lastWornDays: 2 }),
  garment({ id: "d-trouser", name: "Wool Trouser", category: "bottom", style: ["tailored"], season: "winter", wearCount: 1, lastWornDays: 60 }),
  garment({ id: "e-shorts", name: "Linen Shorts", category: "bottom", style: ["casual"], season: "summer", wearCount: 0, lastWornDays: 999 }),
  garment({ id: "f-derby", name: "Leather Derby", category: "shoe", style: ["classic", "tailored"], season: "all-season", wearCount: 1, lastWornDays: 50 }),
  garment({ id: "g-sneaker", name: "White Sneaker", category: "shoe", style: ["casual", "sporty"], season: "all-season", wearCount: 20, lastWornDays: 1 }),
  garment({ id: "h-belt", name: "Brown Belt", category: "accessory", style: ["classic"], season: "all-season", wearCount: 4, lastWornDays: 20 }),
];

test("intent is read from the request rather than a single keyword branch", () => {
  const work = readOutfitIntent("Build me something for a work meeting");
  assert.equal(work.occasion, "work");
  assert.equal(work.mode, "outfit");

  const cold = readOutfitIntent("What can I wear in the snow?");
  assert.equal(cold.weather, "cold");

  const styled = readOutfitIntent("Something minimal and tailored for dinner");
  assert.equal(styled.occasion, "evening");
  assert.deepEqual(styled.styleHints.sort(), ["minimal", "tailored"]);

  const rotation = readOutfitIntent("What have I not worn lately?");
  assert.equal(rotation.mode, "rotation");
});

test("REGRESSION: two different requests no longer return the identical item set", () => {
  const work = selectGroundedOutfit(wardrobe, "Build an outfit for a formal work meeting").map((item) => item.id);
  const beach = selectGroundedOutfit(wardrobe, "Something casual for a hot sunny weekend").map((item) => item.id);
  assert.notDeepEqual(work, beach, "occasion and weather must change the selection");
  assert.ok(work.length > 0 && beach.length > 0);
});

test("a formal request prefers tailored pieces over casual ones", () => {
  const chosen = rankOutfit(wardrobe, "I need a formal outfit for an interview").pieces.map((piece) => piece.item.id);
  assert.ok(chosen.includes("b-oxford"), "the classic shirt should beat the hoodie for formal");
  assert.equal(chosen.includes("c-hoodie"), false, "a casual hoodie should not be chosen for a formal request");
  assert.ok(chosen.includes("f-derby"), "leather derbies should beat sneakers for formal");
});

test("weather steers season selection", () => {
  const warm = rankOutfit(wardrobe, "Something for a hot summer day").pieces.map((piece) => piece.item.id);
  assert.ok(warm.includes("e-shorts"), "summer shorts should win in warm weather");
  const cold = rankOutfit(wardrobe, "It is freezing and snowing today").pieces.map((piece) => piece.item.id);
  assert.ok(cold.includes("d-trouser"), "winter trousers should win in cold weather");
  assert.equal(cold.includes("e-shorts"), false, "summer shorts must not be chosen for snow");
});

test("REGRESSION: a follow-up sets aside what was already suggested", () => {
  const first = rankOutfit(wardrobe, "Build me a casual outfit");
  const firstNames = first.pieces.map((piece) => piece.item.name);
  const history = [
    { role: "user" as const, content: "Build me a casual outfit" },
    { role: "assistant" as const, content: `I would start with ${firstNames.join(", ")}.` },
  ];
  const second = rankOutfit(wardrobe, "Give me something else", { history });
  const firstIds = new Set(first.pieces.map((piece) => piece.item.id));
  const repeated = second.pieces.filter((piece) => firstIds.has(piece.item.id));
  assert.equal(repeated.length, 0, "a follow-up must not repeat the same pieces");
  assert.ok(second.setAside > 0, "the set-aside count should be reported");
});

test("REGRESSION: an explicit different-outfit request honors validated prior action ids", () => {
  const first = rankOutfit(wardrobe, "Build me a casual outfit");
  const firstIds = first.pieces.map((piece) => piece.item.id);
  const second = rankOutfit(wardrobe, "Make me a different outfit", { avoidItemIds: firstIds });
  assert.equal(second.intent.alternativeRequested, true);
  assert.notDeepEqual(second.pieces.map((piece) => piece.item.id), firstIds);
  assert.equal(second.pieces.some((piece) => firstIds.includes(piece.item.id)), false, "a large enough wardrobe should produce an entirely fresh alternative");
});

test("a medium wardrobe uses every available fresh category before repeating only required slots", () => {
  const medium = wardrobe.slice(0, 6);
  const first = rankOutfit(medium, "Build me an outfit");
  const firstIds = first.pieces.map((piece) => piece.item.id);
  const freshIds = medium.filter((item) => !firstIds.includes(item.id)).map((item) => item.id);
  const second = rankOutfit(medium, "Give me another outfit", { avoidItemIds: firstIds });
  const secondIds = second.pieces.map((piece) => piece.item.id);
  assert.ok(freshIds.length > 0 && freshIds.every((id) => secondIds.includes(id)), "every available new piece should be used before a repeat");
  assert.notDeepEqual(secondIds, firstIds);
});

test("a wardrobe too small to avoid repeats still returns a real outfit", () => {
  const tiny = wardrobe.slice(0, 2);
  const history = [{ role: "assistant" as const, content: "I would start with Tailored Blazer, Blue Oxford." }];
  const result = rankOutfit(tiny, "Give me something else", { history });
  assert.ok(result.pieces.length > 0, "it must not return an empty outfit rather than repeat");
  assert.equal(result.setAside, 0, "nothing is reported as set aside when the fallback was used");
});

test("selection is deterministic — identical inputs give identical output", () => {
  const once = rankOutfit(wardrobe, "Smart outfit for the office").pieces.map((piece) => piece.item.id);
  const twice = rankOutfit(wardrobe, "Smart outfit for the office").pieces.map((piece) => piece.item.id);
  assert.deepEqual(once, twice);
  const shuffled = rankOutfit([...wardrobe].reverse(), "Smart outfit for the office").pieces.map((piece) => piece.item.id);
  assert.deepEqual(shuffled.sort(), once.sort(), "input ordering must not change the chosen set");
});

test("rotation mode surfaces the least-worn pieces", () => {
  const rotation = rankOutfit(wardrobe, "What have I not worn lately?");
  assert.equal(rotation.intent.mode, "rotation");
  const ids = rotation.pieces.map((piece) => piece.item.id);
  assert.ok(ids.includes("e-shorts"), "a never-worn piece should surface in a rotation request");
  assert.equal(ids.includes("g-sneaker"), false, "the most-worn piece should not surface in a rotation request");
});

test("an outfit covers distinct categories rather than stacking one slot", () => {
  const pieces = rankOutfit(wardrobe, "Build a complete outfit").pieces;
  const categories = pieces.map((piece) => piece.item.category);
  assert.equal(new Set(categories).size, categories.length, "each piece should fill a different category");
  assert.ok(pieces.length <= MAX_OUTFIT_PIECES);
});

test("every chosen piece carries inspectable score components and reasons", () => {
  for (const piece of rankOutfit(wardrobe, "Tailored outfit for a work meeting in the cold").pieces) {
    assert.equal(piece.components.length, 5, "all five signals must be reported");
    assert.deepEqual(piece.components.map((component) => component.key).sort(), ["occasion", "recency", "style", "underuse", "weather"]);
    for (const component of piece.components) {
      assert.ok(component.score >= 0 && component.score <= 100, `${component.key} score must be 0-100`);
      assert.ok(component.evidence.length > 0, `${component.key} needs evidence`);
    }
    assert.ok(piece.reasons.length > 0);
    assert.ok(piece.score >= 0 && piece.score <= 100);
  }
});

test("REGRESSION: selection can only ever return items the account owns", () => {
  const result = rankOutfit(wardrobe, "Build me anything at all");
  const owned = new Set(wardrobe.map((item) => item.id));
  assert.ok(result.pieces.every((piece) => owned.has(piece.item.id)));
  assert.deepEqual(rankOutfit([], "Build me an outfit").pieces, [], "an empty wardrobe yields no pieces, never invented ones");
});

test("previously-suggested detection ignores user turns and short names", () => {
  const items = [garment({ id: "x", name: "Blue Oxford", category: "top" }), garment({ id: "y", name: "Ax", category: "top" })];
  const fromUserOnly = previouslySuggestedItemIds(items, [{ role: "user", content: "I love my Blue Oxford" }]);
  assert.equal(fromUserOnly.size, 0, "what the customer said is not a Hanger suggestion");
  const fromAssistant = previouslySuggestedItemIds(items, [{ role: "assistant", content: "Try the Blue Oxford today." }]);
  assert.deepEqual([...fromAssistant], ["x"]);
});
