import test from "node:test";
import assert from "node:assert/strict";
import { GARMENT_TAXONOMY, autoGarmentDisplayName, cleanHypothesis, garmentSubtypeLabel, normalizeGarmentClassification, subtypeForCategory } from "../lib/garment-taxonomy.ts";
import { SHOE_KNOWLEDGE, shoeKnowledgePrompt } from "../lib/shoe-knowledge.ts";

test("controlled taxonomy retains useful garment subtypes across every broad category", () => {
  assert.equal(subtypeForCategory("top", "hoodie"), "hoodie");
  assert.equal(subtypeForCategory("outerwear", "bomber jacket"), "bomber-jacket");
  assert.equal(subtypeForCategory("shoe", "loafers"), "loafers");
  assert.ok(Object.values(GARMENT_TAXONOMY).every((subtypes) => subtypes.length > 0));
});

test("unknown or incompatible subtype text falls back inside its broad category", () => {
  assert.deepEqual(normalizeGarmentClassification("top", "loafer"), { category: "top", subtype: "other-top" });
  assert.deepEqual(normalizeGarmentClassification("mystery", "mystery"), { category: "unknown", subtype: "other-garment" });
});

test("the controlled shoe reference covers every footwear subtype with unique aliases and visible cues",()=>{
  assert.deepEqual(SHOE_KNOWLEDGE.map(entry=>entry.subtype),GARMENT_TAXONOMY.shoe);
  assert.ok(SHOE_KNOWLEDGE.every(entry=>entry.aliases.length>0&&entry.visibleCues.length>0));
  const aliases=SHOE_KNOWLEDGE.flatMap(entry=>entry.aliases.map(alias=>alias.toLowerCase()));
  assert.equal(new Set(aliases).size,aliases.length,"shoe aliases must resolve to only one canonical subtype");
  assert.equal(subtypeForCategory("shoe","Chelsea boot"),"chelsea-boots");
  assert.equal(subtypeForCategory("shoe","basketball sneaker"),"basketball-shoes");
  assert.match(shoeKnowledgePrompt(),/closed lacing quarters/i);
  assert.match(shoeKnowledgePrompt(),/court outsole/i);
});

test("AI-authored names become grammatical labels while manual naming remains outside the helper",()=>{
  assert.equal(autoGarmentDisplayName({name:"sneakers",category:"shoe",subtype:"sneakers",color:"white",wearableUnit:"pair"}),"White Sneakers");
  assert.equal(autoGarmentDisplayName({name:"a white sneaker",category:"shoe",subtype:"sneakers",color:"white",wearableUnit:"single"}),"White Sneaker");
  assert.equal(autoGarmentDisplayName({name:"PAIR OF tan work boots",category:"shoe",subtype:"work-boots",color:"tan",wearableUnit:"pair"}),"Tan Work Boots");
  assert.equal(autoGarmentDisplayName({name:"navy bomber jacket",category:"outerwear",subtype:"bomber-jacket",color:"navy"}),"Navy Bomber Jacket");
  assert.equal(garmentSubtypeLabel("high-top-sneakers","pair"),"High-Top Sneakers");
});

test("first-photo hypotheses are bounded and contain descriptive fields only", () => {
  const hypothesis = cleanHypothesis({
    category: "outerwear", subtype: "bomber jacket", confidence: 200, reasoning: "Visible ribbed cuffs.",
    alternatives: [{ category: "top", subtype: "sweatshirt", confidence: 36, reason: "Rear is not visible." }],
    brand: "must not survive", verified: true,
  });
  assert.deepEqual(hypothesis, {
    category: "outerwear", subtype: "bomber-jacket", confidence: 95, reasoning: "Visible ribbed cuffs.",
    alternatives: [{ category: "top", subtype: "sweatshirt", confidence: 36, reason: "Rear is not visible." }],
  });
  assert.equal("brand" in (hypothesis as unknown as Record<string, unknown>), false);
  assert.equal("verified" in (hypothesis as unknown as Record<string, unknown>), false);
});
