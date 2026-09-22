import test from "node:test";
import assert from "node:assert/strict";
import { allowedOutfitActions, planHangerTurn } from "../lib/hanger-turn.ts";
import { rankOutfit, readOutfitIntent } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

function garment(overrides: Partial<WardrobeItem> & Pick<WardrobeItem, "id" | "name" | "category">): WardrobeItem {
  return {
    color: "black", style: [], season: "all-season", wearCount: 0, lastWornDays: 30,
    source: "ai-confirmed", art: "photo", ...overrides,
  } as WardrobeItem;
}

const wardrobe: WardrobeItem[] = [
  garment({ id: "top-blue", name: "Blue Oxford", category: "top", subtype: "dress-shirt", style: ["classic", "tailored"] }),
  garment({ id: "top-grey", name: "Grey Hoodie", category: "top", subtype: "hoodie", style: ["casual", "relaxed"] }),
  garment({ id: "bottom-wool", name: "Wool Trouser", category: "bottom", subtype: "dress-pants", style: ["tailored"] }),
  garment({ id: "bottom-chino", name: "Olive Chino", category: "bottom", subtype: "chinos", style: ["casual"] }),
  garment({ id: "shoe-derby", name: "Leather Derby", category: "shoe", subtype: "dress-shoes", style: ["classic", "tailored"] }),
  garment({ id: "shoe-sneaker", name: "White Sneaker", category: "shoe", subtype: "sneakers", style: ["casual", "sporty"] }),
  garment({ id: "coat-blazer", name: "Navy Blazer", category: "outerwear", subtype: "blazer", style: ["tailored"] }),
  garment({ id: "coat-bomber", name: "Black Bomber", category: "outerwear", subtype: "bomber-jacket", style: ["casual"] }),
];

function activeFrom(message: string) {
  const ranked = rankOutfit(wardrobe, message);
  return { itemIds: ranked.pieces.map((piece) => piece.item.id), intent: ranked.intent };
}

test("a first outfit request creates a new active-look plan",()=>{
  const plan = planHangerTurn({ wardrobe, message: "Build me a casual outfit for warm weather" });
  assert.equal(plan.mode, "create");
  assert.equal(plan.contextUsed, false);
  assert.equal(plan.intent.occasion, "casual");
  assert.equal(plan.intent.weather, "warm");
  assert.deepEqual(plan.activeItemIds, []);
});

test("keep the shoes but change the top preserves the rest of the active outfit",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit");
  const activeByCategory = new Map(activeOutfit.itemIds.map((id) => {
    const item = wardrobe.find((entry) => entry.id === id)!;
    return [item.category, item.id];
  }));
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "Keep the shoes but change the top" });
  assert.equal(plan.mode, "revise");
  assert.equal(plan.contextUsed, true);
  assert.ok(plan.requiredItemIds.includes(activeByCategory.get("shoe")!));
  assert.ok(plan.requiredItemIds.includes(activeByCategory.get("bottom")!), "unaffected pieces stay stable");
  assert.ok(plan.requiredItemIds.includes(activeByCategory.get("outerwear")!), "unaffected pieces stay stable");
  assert.ok(plan.excludedItemIds.includes(activeByCategory.get("top")!));

  const revised = rankOutfit(wardrobe, "Keep the shoes but change the top", {
    intentOverride: plan.intent,
    requiredItemIds: plan.requiredItemIds,
    excludedItemIds: plan.excludedItemIds,
    maxPieces: plan.maxPieces,
    avoidItemIds: activeOutfit.itemIds,
    rotatePriorSuggestions: plan.rotatePriorSuggestions,
  });
  const revisedIds = revised.pieces.map((piece) => piece.item.id);
  assert.ok(revisedIds.includes(activeByCategory.get("shoe")!));
  assert.ok(revisedIds.includes(activeByCategory.get("bottom")!));
  assert.ok(revisedIds.includes(activeByCategory.get("outerwear")!));
  assert.equal(revisedIds.includes(activeByCategory.get("top")!), false);
  assert.ok(revised.pieces.some((piece) => piece.item.category === "top"), "the changed slot is filled with another owned top");
});

test("a contextual style revision inherits the active constraints it did not replace",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit for warm weather");
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "Make it more formal" });
  assert.equal(plan.mode, "revise");
  assert.equal(plan.contextUsed, true);
  assert.equal(plan.intent.occasion, "formal");
  assert.equal(plan.intent.weather, "warm", "the short follow-up retains the prior weather context");
});

test("the planner distinguishes discussion and confirmation turns from creation",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit");
  const mode = (message: string) => planHangerTurn({ wardrobe, activeOutfit, message }).mode;
  assert.equal(mode("Why did you choose those pieces?"), "explain");
  assert.equal(mode("Save that outfit"), "save-confirm");
  assert.equal(mode("Record that I wore it today"), "wear-confirm");
  assert.equal(mode("What wardrobe gap should I prioritize?"), "advice");
  assert.equal(mode("What have I not worn lately?"), "advice");
  assert.equal(mode("Build another outfit and save it"), "create", "a creation request must not be mistaken for saving the prior look");
  assert.equal(planHangerTurn({ wardrobe, message: "Save that outfit" }).mode, "save-confirm", "without an active outfit, Save gets an honest no-selection reply");
});

test("deleting any piece of the active outfit invalidates that plan instead of silently saving a subset",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit");
  const afterDeletion = wardrobe.filter((item) => item.id !== activeOutfit.itemIds[0]);
  const plan = planHangerTurn({ wardrobe: afterDeletion, activeOutfit, message: "Save that outfit" });
  assert.deepEqual(plan.activeItemIds, []);
  assert.equal(plan.mode, "save-confirm");
});

test("referential requests revise the current look, while a new look after a negated save is created",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit for warm weather");
  for (const message of ["Make this outfit more formal", "Style this outfit for work", "Make it a more formal outfit"]) {
    const plan = planHangerTurn({ wardrobe, activeOutfit, message });
    assert.equal(plan.mode, "revise", message);
    assert.equal(plan.intent.weather, "warm", message);
  }
  assert.equal(planHangerTurn({ wardrobe, activeOutfit, message: "Do not save that outfit; build another outfit" }).mode, "create");
});

test("saving means the current look, not saving money or adding a garment to a look",()=>{
  const scarf = garment({ id: "scarf-blue", name: "Blue Scarf", category: "accessory", subtype: "scarf", color: "blue" });
  const closet = [...wardrobe, scarf];
  const activeOutfit = { itemIds: ["top-blue", "bottom-wool", "shoe-derby"], intent: readOutfitIntent("Build a look for work") };
  assert.equal(planHangerTurn({ wardrobe: closet, activeOutfit, message: "How can I save money on clothes?" }).mode, "advice");
  const plan = planHangerTurn({ wardrobe: closet, activeOutfit, message: "Add my Blue Scarf to the outfit" });
  assert.equal(plan.mode, "revise");
  assert.equal(plan.maxPieces, 4);
  assert.deepEqual(new Set(plan.requiredItemIds), new Set([...activeOutfit.itemIds, scarf.id]));
  assert.equal(planHangerTurn({ wardrobe: closet, activeOutfit, message: "Save that outfit" }).mode, "save-confirm");
});

test("an explicitly negated previous occasion is cleared instead of inherited",()=>{
  const activeOutfit = activeFrom("Build a tailored outfit for work in warm weather");
  assert.equal(activeOutfit.intent.occasion, "work");
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "Make it not for work" });
  assert.equal(plan.mode, "revise");
  assert.equal(plan.intent.occasion, null);
  assert.equal(plan.intent.weather, "warm");
});

test("keep shoes followed by a comma or and does not keep the old top",()=>{
  const activeOutfit = { itemIds: ["top-blue", "bottom-wool", "shoe-derby"], intent: readOutfitIntent("Build a work look") };
  for (const message of ["Keep the shoes, change the top", "Keep the shoes and change the top"]) {
    const plan = planHangerTurn({ wardrobe, activeOutfit, message });
    assert.equal(plan.mode, "revise");
    assert.ok(plan.requiredItemIds.includes("shoe-derby"));
    assert.ok(plan.excludedItemIds.includes("top-blue"));
    assert.ok(!plan.requiredItemIds.includes("top-blue"));
  }
});

test("mentioning this outfit in a question or wear command does not rerank it",()=>{
  const activeOutfit = activeFrom("Build me a casual outfit");
  const mode = (message: string) => planHangerTurn({ wardrobe, activeOutfit, message }).mode;
  assert.equal(mode("Why did you choose this outfit?"), "explain");
  assert.equal(mode("Explain this outfit"), "explain");
  assert.equal(mode("How many times have I worn this outfit?"), "advice");
  assert.equal(mode("Record this outfit as worn"), "wear-confirm");
  assert.equal(mode("Log that outfit as worn"), "wear-confirm");
  assert.equal(mode("Do not record this outfit"), "advice");
});

test("adding a second top to a three-piece look does not replace the first top",()=>{
  const activeOutfit = { itemIds: ["top-grey", "bottom-wool", "shoe-derby"], intent: readOutfitIntent("Build a look") };
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "Add my Blue Oxford to the outfit" });
  assert.equal(plan.maxPieces, 4);
  assert.ok(plan.requiredItemIds.includes("top-blue"));
  assert.ok(plan.requiredItemIds.includes("top-grey"));
  assert.ok(!plan.excludedItemIds.includes("top-grey"));
});

test("a new outfit honors a refusal to save or record without dropping the new selection",()=>{
  const activeOutfit = activeFrom("Build a casual outfit");
  const message = "Don't save that outfit; build another outfit";
  const plan = planHangerTurn({ wardrobe, activeOutfit, message });
  assert.equal(plan.mode, "create");
  assert.equal(allowedOutfitActions(plan.mode, message), "record");
  assert.equal(allowedOutfitActions("create", "Don't record this; build another outfit"), "save");
  assert.equal(allowedOutfitActions("create", "Don't save or record it; build another outfit"), "none");
  assert.equal(allowedOutfitActions("advice", "Do not save that outfit"), "none");
});

test("adding to a full look asks which existing piece to replace without dropping one",()=>{
  const activeOutfit = { itemIds: ["top-grey", "bottom-wool", "shoe-derby", "coat-blazer"], intent: readOutfitIntent("Build a look") };
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "Add my Blue Oxford to the outfit" });
  assert.equal(plan.mode, "clarify");
  assert.equal(allowedOutfitActions(plan.mode, "Add my Blue Oxford to the outfit"), "none");
  assert.deepEqual(plan.activeItemIds, activeOutfit.itemIds, "the current selection remains intact");
  assert.match(plan.clarification ?? "", /which existing piece to replace/);
});

test("an absent owned-sounding request is clarified, not returned as an unrelated saveable outfit",()=>{
  const plan = planHangerTurn({ wardrobe, message: "Build an outfit with my purple fedora" });
  assert.equal(plan.mode, "clarify");
  assert.equal(allowedOutfitActions(plan.mode, "Build an outfit with my purple fedora"), "none");
  assert.match(plan.clarification ?? "", /couldn't find one clearly matching/);
});

test("keep this hoodie instead of that shirt excludes the shirt while preserving the hoodie",()=>{
  const activeOutfit = { itemIds: ["top-grey", "top-blue", "bottom-wool", "shoe-derby"], intent: readOutfitIntent("Build a look") };
  const plan = planHangerTurn({ wardrobe, activeOutfit, message: "I want to keep my Grey Hoodie instead of Blue Oxford" });
  assert.equal(plan.mode, "revise");
  assert.ok(plan.requiredItemIds.includes("top-grey"));
  assert.ok(plan.excludedItemIds.includes("top-blue"));
  assert.ok(!plan.requiredItemIds.includes("top-blue"));
});
