import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumerReplyPassesSelectionReview, replyInventsOutfits } from "../lib/hanger-conversation.ts";
import { rankOutfitSet } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const make = (id: string, name: string, category: string, subtype: string, color: string): WardrobeItem => ({
  id, name, category, subtype, color, pattern: "solid", material: "cotton", style: ["casual"], season: "all-season",
  wearCount: 2, lastWornDays: 10, source: "ai-confirmed", art: "photo",
} as WardrobeItem);

// Pieces from the reported conversation.
const wardrobe = [
  make("stussy", "Stussy", "top", "t-shirt", "navy"),
  make("skel", "black long-sleeve shirt with skeleton print", "top", "long-sleeve", "black"),
  make("navy", "Navy T Shirt", "top", "t-shirt", "navy"),
  make("henley", "Green Henley", "top", "casual-shirt", "green"),
  make("jeans", "Blue Jeans", "bottom", "jeans", "blue"),
  make("ripped", "Ripped Jeans", "bottom", "jeans", "light blue"),
  make("jordan4", "Jordan 4 Wet Concretes", "shoe", "sneakers", "grey"),
  make("ow", "Off White Air Jordans", "shoe", "sneakers", "white"),
  make("timbs", "LV Timbs", "shoe", "boots", "wheat"),
  make("skully", "Black Skully", "accessory", "beanie", "black"),
];

// REGRESSION: "Can you make me 3 outfits" got the canned template instead of the stylist. The
// reply was checked against the first outfit alone, so naming a piece from the second or third —
// all three on screen — was treated as inventing a garment and the model's words were thrown away.
test("REGRESSION: a reply about a set may discuss every outfit in it", () => {
  const set = rankOutfitSet(wardrobe, "Can you make me 3 outfits", { count: 3 });
  const first = set[0].outfit.pieces.map((piece) => piece.item);
  const shown = set.flatMap(({ outfit }) => outfit.pieces.map((piece) => piece.item));
  const later = shown.find((item) => !first.some((one) => one.id === item.id))!;
  const reply = `Three looks for you — the second swaps in the ${later.name} for something sharper.`;
  assert.equal(consumerReplyPassesSelectionReview(reply, wardrobe, first), false, "checked against outfit 1 alone, it was rejected");
  assert.equal(consumerReplyPassesSelectionReview(reply, wardrobe, shown), true, "checked against everything shown, it passes");

  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /const shown = \[\.\.\.input\.suggested, \.\.\.\(input\.alsoShown \?\? \[\]\)\];/);
  assert.match(read("app/api/agents/consumer/route.ts"), /alsoShown: set\.slice\(1\)\.flatMap/);
});

// REGRESSION: asked which colours go together, Hanger answered with three outfits it assembled
// itself — "Black Skully + Blue Jeans + … + Black Skully", the same beanie twice, no shoes.
test("REGRESSION: an outfit list the builder never made is caught", () => {
  const reported = "Here are 3 outfits for you:\n\n1. Black Skully + Blue Jeans + black long-sleeve shirt with skeleton print + Black Skully\n2. Black Skully + Blue Jeans + Navy T Shirt + Black Skully";
  assert.equal(replyInventsOutfits(reported, wardrobe), true);
  assert.equal(replyInventsOutfits("1. Black Skully, Blue Jeans, Navy T Shirt", wardrobe), true, "a numbered line of pieces is a list too");
  assert.equal(replyInventsOutfits("Outfit 2: something warmer", wardrobe), true);
  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /!\(shown\.length === 0 && replyInventsOutfits\(generated, input\.wardrobe\)\)/, "applied whenever no outfit was built");
});

// The guard must not cost Hanger its voice: a stylist names pieces in sentences all the time.
test("ordinary styling talk is never mistaken for an invented outfit", () => {
  const colour = "Green, light blue and orange is the stronger trio — the light blue cools the orange, so it reads fresh rather than loud. Green, black and orange goes heavier and more streetwear.";
  const verdict = "Ripped Jeans. With the Green Henley and LV Timbs they lean into the rugged workwear look; the Blue Jeans make the same outfit tidier, which is the better call for dinner.";
  const pairing = "Pair the Green Henley with the Ripped Jeans and the LV Timbs, and push the sleeves up once.";
  for (const reply of [colour, verdict, pairing]) assert.equal(replyInventsOutfits(reply, wardrobe), false, reply.slice(0, 40));
});

test("the stylist is told to answer what was asked: knowledge questions, comparisons, and follow-ups", () => {
  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /answer it directly from fashion knowledge with a clear opinion and the reason, without building or listing outfits/);
  assert.match(source, /If they ask which of two options is better, pick one, say why/);
  assert.match(source, /never answer with 'either'/);
  assert.match(source, /If they say you missed their question, find the question they asked earlier in the conversation and answer that one/);
});
