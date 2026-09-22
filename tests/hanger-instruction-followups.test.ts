import assert from "node:assert/strict";
import test from "node:test";
import { planHangerTurn } from "../lib/hanger-turn.ts";
import { rankOutfit } from "../lib/outfit-ranking.ts";
import type { HangerActiveOutfit } from "../lib/hanger-memory.ts";
import type { WardrobeItem } from "../lib/types.ts";

function piece(id: string, name: string, category: string, wearCount = 0): WardrobeItem {
  return {
    id, name, category, color: "black", style: [], season: "all-season",
    wearCount, lastWornDays: 999, source: "manual", art: "photo",
  };
}

const wardrobe = [
  piece("white-tee", "White Tee", "top"),
  piece("blue-shirt", "Blue Shirt", "top", 20),
  piece("red-shirt", "Red Shirt", "top"),
  piece("black-jeans", "Black Jeans", "bottom"),
  piece("tan-chinos", "Tan Chinos", "bottom"),
  piece("white-sneakers", "White Sneakers", "shoe"),
  piece("black-boots", "Black Boots", "shoe"),
  piece("navy-coat", "Navy Coat", "outerwear"),
];

const activeOutfit: HangerActiveOutfit = {
  itemIds: ["white-tee", "black-jeans", "white-sneakers", "navy-coat"],
  intent: {
    mode: "outfit", occasion: null, weather: null, styleHints: [],
    styleSource: "none", alternativeRequested: false,
  },
};

function followUp(message: string) {
  const plan = planHangerTurn({ wardrobe, message, activeOutfit });
  const result = plan.mode === "create" || plan.mode === "revise"
    ? rankOutfit(wardrobe, message, {
        intentOverride: plan.intent,
        maxPieces: plan.maxPieces,
        requiredItemIds: plan.requiredItemIds,
        excludedItemIds: plan.excludedItemIds,
        avoidItemIds: activeOutfit.itemIds,
        rotatePriorSuggestions: plan.rotatePriorSuggestions,
      })
    : null;
  return { plan, ids: result?.pieces.map((entry) => entry.item.id) ?? [] };
}

test("change the top to a named owned shirt uses that shirt, not a higher-scoring alternative", () => {
  const { plan, ids } = followUp("Change the top to Blue Shirt");
  assert.equal(plan.mode, "revise");
  assert.ok(ids.includes("blue-shirt"), "the explicitly named replacement must be selected");
  assert.ok(!ids.includes("white-tee"), "the old top must be replaced");
});

test("swap an owned tee for a named shirt honors both sides of the replacement", () => {
  const { plan, ids } = followUp("Swap my White Tee for the Blue Shirt");
  assert.equal(plan.mode, "revise");
  assert.ok(ids.includes("blue-shirt"), "the named replacement must be selected");
  assert.ok(!ids.includes("white-tee"), "the swapped-out tee must be excluded");
});

test("remove the shoes removes footwear instead of substituting another pair", () => {
  const { plan, ids } = followUp("Remove the shoes");
  assert.equal(plan.mode, "revise");
  assert.ok(ids.every((id) => wardrobe.find((item) => item.id === id)?.category !== "shoe"));
});

test("an outfit requested without shoes contains no footwear", () => {
  const { plan, ids } = followUp("Give me an outfit without shoes");
  assert.equal(plan.mode, "create");
  assert.ok(ids.every((id) => wardrobe.find((item) => item.id === id)?.category !== "shoe"));
});

test("negated save and wear requests cannot offer the opposite action", () => {
  assert.notEqual(followUp("Do not save that outfit").plan.mode, "save-confirm");
  assert.notEqual(followUp("Don't record that as worn").plan.mode, "wear-confirm");
});

test("adding one named shirt to the active outfit keeps unaffected pieces", () => {
  const { plan, ids } = followUp("I want to use the Blue Shirt");
  assert.equal(plan.mode, "revise");
  assert.ok(ids.includes("blue-shirt"));
  assert.ok(ids.includes("black-jeans"));
  assert.ok(ids.includes("white-sneakers"), "a top-only request must not also switch shoes");
  assert.ok(ids.includes("navy-coat"));
  assert.ok(!ids.includes("white-tee"));
});
