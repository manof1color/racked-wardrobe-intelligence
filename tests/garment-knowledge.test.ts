import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_SUBTYPES, NAME_CUES, OCCASION_FORMALITY, SUBTYPE_FORMALITY, formalityGap, garmentFormality, occasionFit,
} from "../lib/garment-knowledge.ts";
import { OUTFIT_OCCASIONS } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const piece = (name: string, category: string, subtype: string, extra: Partial<WardrobeItem> = {}) =>
  ({ id: name, name, category, subtype, color: "", style: [], season: "all-season", wearCount: 0, lastWornDays: 999, source: "manual", art: "", ...extra }) as WardrobeItem;

test("every garment type in the taxonomy has a formality on the ladder", () => {
  for (const subtype of KNOWN_SUBTYPES) {
    const level = SUBTYPE_FORMALITY[subtype];
    assert.ok(typeof level === "number" && level >= 1 && level <= 5, `${subtype} has no formality`);
  }
  assert.equal(Object.keys(SUBTYPE_FORMALITY).length, KNOWN_SUBTYPES.length, "no formality is kept for a type the taxonomy dropped");
});

test("each occasion asks for a band of the ladder with its target inside it", () => {
  for (const occasion of OUTFIT_OCCASIONS) {
    const band = OCCASION_FORMALITY[occasion];
    assert.ok(band.min <= band.target && band.target <= band.max, occasion);
  }
});

test("what a piece is called moves it on the ladder", () => {
  const tee = garmentFormality(piece("White Tee", "top", "t-shirt")).level;
  assert.ok(garmentFormality(piece("Stussy Graphic Tee", "top", "t-shirt")).level < tee, "a graphic tee is more casual than a plain one");
  assert.ok(garmentFormality(piece("Ripped Jeans", "bottom", "jeans")).level < garmentFormality(piece("Blue Jeans", "bottom", "jeans")).level);
  assert.equal(garmentFormality(piece("Green Henley", "top", "casual-shirt")).label, "smart casual");
  assert.equal(garmentFormality(piece("Black Skully", "accessory", "hat")).label, "casual");
  assert.ok(garmentFormality(piece("LV Timbs", "shoe", "boots")).level > garmentFormality(piece("Off White Air Jordans", "shoe", "sneakers")).level, "Timbs are a step above sneakers");
  assert.ok(garmentFormality(piece("Cashmere Sweater", "top", "sweater")).level > garmentFormality(piece("Sweater", "top", "sweater")).level);
  assert.equal(garmentFormality(piece("Silk Graphic Tee", "top", "t-shirt")).basis, "a graphic print", "a print caps even a dressy material");
  assert.ok(NAME_CUES.every((cue) => cue.level > 0));
});

test("what recognition saw counts even when the name does not say it", () => {
  // The reported closet's tee is named only "Stussy"; its pattern is what makes it a graphic tee.
  const named = garmentFormality(piece("Stussy", "top", "t-shirt"));
  const seen = garmentFormality(piece("Stussy", "top", "t-shirt", { pattern: "graphic print" }));
  assert.ok(seen.level < named.level);
  assert.equal(seen.basis, "a graphic print");
});

test("sporty style tags never let a piece pass as dressy", () => {
  assert.ok(garmentFormality(piece("Track Jacket", "outerwear", "other-outerwear", { style: ["athletic"] })).level <= 2);
});

test("a graphic tee is too casual for formal; a dress shirt suits it", () => {
  const tee = occasionFit(piece("Stussy Graphic Tee", "top", "t-shirt"), "formal");
  const shirt = occasionFit(piece("White Dress Shirt", "top", "dress-shirt"), "formal");
  assert.match(tee.evidence, /too casual for formal/);
  assert.match(shirt.evidence, /suits formal/);
  assert.ok(shirt.score > tee.score + 50);
});

test("overdressing is named as such, not as a fit", () => {
  assert.match(occasionFit(piece("Tuxedo Jacket", "outerwear", "suit-jacket"), "casual").evidence, /dressier than casual needs/);
});

test("jewelry dresses up or down, except for a workout", () => {
  for (const occasion of OUTFIT_OCCASIONS) {
    assert.equal(formalityGap(piece("Gold Ring", "jewelry", "ring"), occasion), occasion === "active" ? 1 : 0, occasion);
  }
});
