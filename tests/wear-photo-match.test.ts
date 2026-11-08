import assert from "node:assert/strict";
import test from "node:test";
import { parseLookGarmentDetections } from "../lib/look-garment-detection.ts";
import { compareColors, matchWearPhoto, MAX_WEAR_PIECES, type DetectedPiece, type WearPhotoSuggestion } from "../lib/wear-photo-match.ts";
import type { WardrobeItem } from "../lib/types.ts";

// Detections go through the real detector parser, written the way the model actually answers —
// capitalised, loose, sometimes with words the taxonomy does not know — not tidy test values.
function detect(garments: Array<Record<string, unknown>>): DetectedPiece[] {
  const parsed = parseLookGarmentDetections({ garments: garments.map((garment, index) => ({ bounds: { x: (index % 5) * 0.2, y: Math.floor(index / 5) * 0.3, width: 0.18, height: 0.28 }, ...garment })) }, { width: 1200, height: 1600 });
  return parsed.map(entry => ({
    id: entry.id, name: entry.analysis.garment.name, category: entry.analysis.garment.category, subtype: entry.analysis.garment.subtype,
    color: entry.analysis.garment.color, pattern: entry.analysis.garment.pattern, material: entry.analysis.garment.material,
    wearableUnit: entry.analysis.garment.wearableUnit, confidence: entry.analysis.confidence,
  }));
}

function piece(id: string, fields: Partial<WardrobeItem> & Pick<WardrobeItem, "name" | "category" | "color">): WardrobeItem {
  return { id, style: [], season: "all-season", wearCount: 0, lastWornDays: 999, source: "ai-confirmed", art: "ivory", ...fields };
}

const lightJeans = piece("jeans-light", { name: "Light Wash Straight Jeans", category: "bottom", subtype: "jeans", color: "light wash blue", pattern: "solid", material: "denim" });
const darkJeans = piece("jeans-dark", { name: "Dark Indigo Slim Jeans", category: "bottom", subtype: "jeans", color: "dark indigo", pattern: "solid", material: "denim" });
const greyHenley = piece("henley-grey", { name: "Heather Grey Henley", category: "top", subtype: "other-top", color: "heather grey", pattern: "solid", material: "cotton" });
const navyHenley = piece("henley-navy", { name: "Navy Henley", category: "top", subtype: "other-top", color: "navy", pattern: "solid", material: "cotton" });
const whiteSneakers = piece("sneakers-white", { name: "White Low-Top Sneakers", category: "shoe", subtype: "low-top-sneakers", wearableUnit: "pair", color: "white", material: "leather" });
// Added by hand: a category, a name, sometimes a color, and nothing else.
const manualBoots = piece("boots-manual", { name: "Black boots", category: "shoe", color: "black", source: "manual" });
const manualJacket = piece("jacket-manual", { name: "Jacket", category: "outerwear", color: "unknown", source: "manual" });
const greyHoodieAsOuterwear = piece("hoodie-outer", { name: "Grey zip hoodie", category: "outerwear", subtype: "other-outerwear", color: "grey", source: "manual" });

const closet = [lightJeans, darkJeans, greyHenley, navyHenley, whiteSneakers, manualBoots, manualJacket];

function candidateIds(suggestion: WearPhotoSuggestion) { return suggestion.candidates.map(candidate => candidate.itemId); }

/** Every suggestion names only closet pieces, and no closet piece is preselected twice. */
function assertHonest(suggestions: WearPhotoSuggestion[], pieces: WardrobeItem[]) {
  const ids = new Set(pieces.map(item => item.id));
  for (const suggestion of suggestions) {
    for (const candidate of suggestion.candidates) assert.ok(ids.has(candidate.itemId), `invented ${candidate.itemId}`);
    if (suggestion.preselectedItemId) {
      assert.ok(ids.has(suggestion.preselectedItemId));
      assert.equal(suggestion.status, "matched");
      assert.equal(suggestion.candidates[0].itemId, suggestion.preselectedItemId, "the preselected piece is shown first");
      assert.equal(suggestion.candidates[0].strength, "strong");
    }
    assert.ok(suggestion.candidates.length <= 3, "the best match and at most two alternatives");
    for (const candidate of suggestion.candidates.slice(suggestion.preselectedItemId ? 1 : 0)) assert.equal(candidate.strength, "possible", "only a preselected piece is shown as strong");
  }
  const chosen = suggestions.map(entry => entry.preselectedItemId).filter(Boolean);
  assert.equal(new Set(chosen).size, chosen.length, "a closet piece is preselected once at most");
}

test("two similar pairs of jeans: the wash decides, and the other pair stays one tap away", () => {
  const detections = detect([
    { name: "light wash denim jeans", category: "Bottoms", subtype: "Jeans", color: "Light blue", pattern: "Solid", material: "Denim", confidence: 84 },
  ]);
  const [jeans] = matchWearPhoto(detections, closet);
  assertHonest([jeans], closet);
  assert.equal(jeans.preselectedItemId, lightJeans.id);
  assert.deepEqual(candidateIds(jeans).slice(0, 2), [lightJeans.id, darkJeans.id]);

  const [dark] = matchWearPhoto(detect([{ name: "dark wash skinny jeans", category: "bottom", subtype: "jeans", color: "Dark indigo blue", pattern: "solid", material: "denim", confidence: 80 }]), closet);
  assert.equal(dark.preselectedItemId, darkJeans.id);
  assert.ok(candidateIds(dark).includes(lightJeans.id));
});

test("two pairs of jeans saved with the same plain details: nothing is preselected, both are offered", () => {
  const plainA = piece("jeans-a", { name: "Blue jeans", category: "bottom", subtype: "jeans", color: "blue", material: "denim" });
  const plainB = piece("jeans-b", { name: "Other blue jeans", category: "bottom", subtype: "jeans", color: "blue", material: "denim" });
  const [jeans] = matchWearPhoto(detect([{ name: "blue jeans", category: "bottom", subtype: "jeans", color: "Medium blue", pattern: "solid", material: "denim", confidence: 88 }]), [plainA, plainB]);
  assertHonest([jeans], [plainA, plainB]);
  assert.equal(jeans.preselectedItemId, null, "a tie is never shown as certain");
  assert.equal(jeans.status, "choose");
  assert.deepEqual(new Set(candidateIds(jeans)), new Set([plainA.id, plainB.id]));
});

test("two henleys differing only by color: the color picks the right one", () => {
  const detections = detect([{ name: "Gray henley shirt", category: "Top", subtype: "henley", color: "heather gray", pattern: "none", material: "cotton jersey", confidence: 78 }]);
  assert.equal(detections[0].subtype, "other-top", "the detector's 'henley' is outside the taxonomy");
  const [henley] = matchWearPhoto(detections, closet);
  assertHonest([henley], closet);
  assert.equal(henley.preselectedItemId, greyHenley.id);
  assert.ok(!candidateIds(henley).includes(navyHenley.id), "a navy henley is a different piece from a grey one");

  const [navyResult] = matchWearPhoto(detect([{ name: "navy blue henley", category: "top", subtype: "Henley", color: "Navy Blue", pattern: "Solid", material: "Cotton", confidence: 81 }]), closet);
  assert.equal(navyResult.preselectedItemId, navyHenley.id);
});

test("pieces added by hand with few details still appear, and are only preselected when the details agree", () => {
  const [boots, jacket] = matchWearPhoto(detect([
    { name: "black leather chelsea boots", category: "Footwear", subtype: "Chelsea boots", wearableUnit: "pair", color: "Black", material: "Leather", confidence: 86 },
    { name: "blue denim jacket", category: "outerwear", subtype: "denim jacket", color: "light wash blue", material: "denim", confidence: 80 },
  ]), closet);
  assertHonest([boots, jacket], closet);
  // "Black boots" has no type saved; its name says boots, which covers chelsea boots, and the color agrees.
  assert.equal(boots.preselectedItemId, manualBoots.id);
  // "Jacket" has only a category: offered, never preselected, and the screen says why.
  assert.equal(jacket.preselectedItemId, null);
  assert.equal(jacket.status, "choose");
  assert.deepEqual(candidateIds(jacket), [manualJacket.id]);
  assert.ok(jacket.candidates[0].reasons.includes("Few details saved"));
});

test("an empty closet: every detected piece says there is no match, and nothing is made up", () => {
  const suggestions = matchWearPhoto(detect([
    { name: "white tee", category: "top", subtype: "t-shirt", color: "white", confidence: 90 },
    { name: "black jeans", category: "bottom", subtype: "jeans", color: "black", confidence: 90 },
  ]), []);
  assert.deepEqual(suggestions.map(entry => entry.status), ["no-match", "no-match"]);
  assert.ok(suggestions.every(entry => entry.candidates.length === 0 && entry.preselectedItemId === null));
});

test("shoes stored as one pair: two single-shoe detections match the pair once", () => {
  const suggestions = matchWearPhoto(detect([
    { name: "white sneaker", category: "Footwear", subtype: "sneaker", wearableUnit: "single", color: "White", material: "leather", confidence: 72 },
    { name: "white sneaker", category: "Footwear", subtype: "sneaker", wearableUnit: "single", color: "white", material: "leather", confidence: 70 },
  ]), closet);
  assertHonest(suggestions, closet);
  assert.equal(suggestions[0].preselectedItemId, whiteSneakers.id);
  assert.equal(suggestions[1].preselectedItemId, null);
  assert.equal(suggestions[1].status, "other-shoe");
});

test("more detections than closet pieces: each piece is used once, the rest say so", () => {
  const small = [lightJeans, greyHenley];
  const suggestions = matchWearPhoto(detect([
    { name: "light blue jeans", category: "bottom", subtype: "jeans", color: "light blue", material: "denim", confidence: 85 },
    { name: "grey henley", category: "top", subtype: "henley", color: "grey", pattern: "solid", material: "cotton knit", confidence: 80 },
    { name: "olive bomber jacket", category: "outerwear", subtype: "bomber jacket", color: "olive green", confidence: 83 },
    { name: "brown leather belt", category: "accessory", subtype: "belt", color: "brown", confidence: 75 },
    { name: "light wash jeans", category: "bottom", subtype: "jeans", color: "light wash", material: "denim", confidence: 60 },
  ]), small);
  assertHonest(suggestions, small);
  assert.equal(suggestions[0].preselectedItemId, lightJeans.id);
  assert.equal(suggestions[1].preselectedItemId, greyHenley.id);
  // The grey henley is a top; a bomber jacket is outerwear. A close category is offered, never preselected.
  assert.equal(suggestions[2].preselectedItemId, null);
  assert.equal(suggestions[3].status, "no-match");
  assert.equal(suggestions[4].status, "already-matched");
});

test("nothing detected: no suggestions at all", () => {
  assert.deepEqual(matchWearPhoto(detect([]), closet), []);
});

test("a piece the detector could not classify is called unrecognized, with no closet guess", () => {
  const detections: DetectedPiece[] = [{ id: "x", name: "Unrecognized piece", category: "unknown", subtype: "other-garment", color: "unknown", pattern: "unknown", material: "unknown", confidence: 0 }];
  const [entry] = matchWearPhoto(detections, closet);
  assert.equal(entry.status, "unrecognized");
  assert.deepEqual(entry.candidates, []);
});

test("category filters first: a top is never offered for jeans, nor shoes for a top", () => {
  const [jeans, tee] = matchWearPhoto(detect([
    { name: "jeans", category: "bottom", subtype: "jeans", color: "blue", confidence: 90 },
    { name: "white t-shirt", category: "top", subtype: "t-shirt", color: "white", confidence: 90 },
  ]), closet);
  assert.ok(jeans.candidates.every(candidate => [lightJeans.id, darkJeans.id].includes(candidate.itemId)));
  assert.ok(tee.candidates.every(candidate => ![whiteSneakers.id, lightJeans.id, darkJeans.id, manualBoots.id].includes(candidate.itemId)));
});

test("a clearly different piece in the right category is not a reasonable match", () => {
  const [result] = matchWearPhoto(detect([{ name: "tan suede loafers", category: "shoe", subtype: "loafers", wearableUnit: "pair", color: "tan", material: "suede", confidence: 82 }]), [whiteSneakers]);
  assert.equal(result.status, "no-match");
  assert.deepEqual(result.candidates, []);
});

test("an unsure detector never gets a preselected match, however close the piece", () => {
  const [result] = matchWearPhoto(detect([{ name: "light wash jeans", category: "bottom", subtype: "jeans", color: "light wash blue", pattern: "solid", material: "denim", confidence: 25 }]), [lightJeans]);
  assert.equal(result.preselectedItemId, null);
  assert.deepEqual(candidateIds(result), [lightJeans.id]);
});

test("a hoodie saved as outerwear is offered for a detected hoodie, but not as certain", () => {
  const [result] = matchWearPhoto(detect([{ name: "grey zip-up hoodie", category: "top", subtype: "hoodie", color: "Heather Grey", material: "cotton fleece", confidence: 85 }]), [greyHoodieAsOuterwear, navyHenley]);
  assertHonest([result], [greyHoodieAsOuterwear, navyHenley]);
  assert.equal(result.preselectedItemId, null);
  assert.equal(result.candidates[0].itemId, greyHoodieAsOuterwear.id);
  assert.ok(result.candidates[0].reasons.includes("Saved as outerwear"));
});

test("no more than ten pieces are preselected, the wear route's limit", () => {
  const colors = ["black", "white", "red", "green", "yellow", "purple", "orange", "pink", "brown", "navy", "beige", "gray"];
  const many = colors.map(color => piece(`tee-${color}`, { name: `${color} tee`, category: "top", subtype: "t-shirt", color, material: "cotton" }));
  const suggestions = matchWearPhoto(detect(colors.map(color => ({ name: `${color} t-shirt`, category: "top", subtype: "t-shirt", color, material: "cotton", confidence: 90 }))), many);
  assertHonest(suggestions, many);
  assert.equal(suggestions.filter(entry => entry.preselectedItemId).length, MAX_WEAR_PIECES);
});

test("color wording the detector actually uses lines up with what people type", () => {
  assert.equal(compareColors("Heather Grey", "gray"), "exact");
  assert.equal(compareColors("Off-white", "cream"), "family");
  assert.equal(compareColors("navy blue", "Navy"), "exact");
  assert.equal(compareColors("light wash", "dark indigo"), "shade-conflict");
  assert.equal(compareColors("Navy and white stripe", "white"), "family");
  assert.equal(compareColors("camel", "brown"), "adjacent");
  assert.equal(compareColors("black", "white"), "conflict");
  assert.equal(compareColors("unknown", "black"), "unknown");
  assert.equal(compareColors("", "black"), "unknown");
});

test("only a name and a color agreeing puts the piece first, but leaves it for the person to confirm", () => {
  const [result] = matchWearPhoto(detect([{ name: "grey henley", category: "top", subtype: "henley", color: "grey", confidence: 80 }]), closet);
  assert.equal(result.preselectedItemId, null);
  assert.equal(result.status, "choose");
  assert.equal(result.candidates[0].itemId, greyHenley.id);
});

test("black read in dim light can be navy: offered as a close color, never preselected", () => {
  const navyJeans = piece("jeans-navy", { name: "Navy chinos", category: "bottom", subtype: "chinos", color: "navy", material: "cotton" });
  const [result] = matchWearPhoto(detect([{ name: "black chino trousers", category: "bottom", subtype: "chinos", color: "black", material: "cotton twill", confidence: 77 }]), [navyJeans]);
  assert.equal(result.preselectedItemId, null);
  assert.deepEqual(candidateIds(result), [navyJeans.id]);
  assert.ok(result.candidates[0].reasons.includes("Close color"));
});
