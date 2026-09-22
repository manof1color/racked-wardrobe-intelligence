import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateConsumerHangerReply, replyClaimsMissingOutfit } from "../lib/hanger-conversation.ts";
import { rememberPendingRequest, readHangerConversation, emptyHangerConversation } from "../lib/hanger-memory.ts";
import { planHangerTurn, suppliesPendingContext } from "../lib/hanger-turn.ts";
import { rankOutfitSet, repeatedPiecesInSet } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/agents/consumer/route.ts");

const make = (id: string, name: string, category: string, subtype: string): WardrobeItem => ({
  id, name, category, subtype, color: "black", pattern: "solid", material: "cotton",
  style: ["casual"], season: "all-season", wearCount: 2, lastWornDays: 15, source: "ai-confirmed", art: "photo",
} as WardrobeItem);

// The closet from the reported session: five pairs of shoes, three tops, and only two bottoms.
const wardrobe = [
  make("t1", "Stussy", "top", "t-shirt"),
  make("t2", "Skeleton long sleeve", "top", "long-sleeve"),
  make("t3", "Scotland rugby shirt", "top", "polo"),
  make("b1", "Blue Jeans", "bottom", "jeans"),
  make("b2", "Lugz Jorts", "bottom", "shorts"),
  make("s1", "sneakers", "shoe", "sneakers"),
  make("s2", "black boots", "shoe", "boots"),
  make("s3", "Megalace Slides", "shoe", "sandals"),
  make("s4", "Adidas Skate Shoes", "shoe", "sneakers"),
  make("s5", "Off White Air Jordans", "shoe", "sneakers"),
  make("a1", "sock", "accessory", "socks"),
  make("a2", "Black Skully", "accessory", "hat"),
];

const plan = (message: string, extra: Parameters<typeof planHangerTurn>[0] extends infer T ? Partial<T> : never = {}) =>
  planHangerTurn({ wardrobe, message, ...extra });

// REGRESSION: "build me 5 unique outfits" returned two, because no piece was allowed to appear in
// more than one outfit. A closet with two pairs of trousers can never dress five days under that
// rule, and nobody dresses that way — the jeans repeat, the outfit does not.
test("REGRESSION: a set repeats a staple rather than stopping short", () => {
  const set = rankOutfitSet(wardrobe, "build me 5 unique outfits", { count: 5 });
  assert.equal(set.length, 5, "five outfits were asked for and this closet can make five");

  const signatures = set.map((entry) => entry.outfit.pieces.map((piece) => piece.item.id).sort().join("|"));
  assert.equal(new Set(signatures).size, 5, "no outfit repeats another outfit");

  const shoes = set.flatMap((entry) => entry.outfit.pieces.filter((piece) => piece.item.category === "shoe").map((piece) => piece.item.id));
  assert.equal(new Set(shoes).size, shoes.length, "five pairs of shoes cover five outfits, so none repeats");

  const tops = new Set(set.flatMap((entry) => entry.outfit.pieces.filter((piece) => piece.item.category === "top").map((piece) => piece.item.id)));
  assert.equal(tops.size, 3, "all three tops are used before any is used a third time");
  assert.ok(repeatedPiecesInSet(set) > 0, "and the reply can say which pieces had to repeat");
});

test("a closet with nothing to repeat still stops honestly", () => {
  const tiny = [make("t1", "Only top", "top", "t-shirt"), make("b1", "Only jeans", "bottom", "jeans"), make("s1", "Only shoes", "shoe", "sneakers")];
  const set = rankOutfitSet(tiny, "build me 5 unique outfits", { count: 5 });
  assert.equal(set.length, 1, "three pieces make one outfit and no second arrangement of them");
});

// REGRESSION: "I need some advice on what to wear" and "what about an outfit that includes the
// slides" were both classified as general advice, so neither produced pieces, photos, or a Save
// button — the customer asked for an outfit and got a paragraph.
test("REGRESSION: a request for an outfit is recognised however it is phrased", () => {
  for (const message of [
    "I need some advice on what to wear",
    "What about an outfit that includes the Megalace Slides",
    "Hello please build me 5 unique outfits",
    "what should I wear tonight",
    "give me some outfit ideas",
    "put together a look for me",
  ]) {
    assert.equal(plan(message).mode, "create", message);
  }
});

test("a question about the outfit on screen is still a question", () => {
  const active = { activeOutfit: { itemIds: ["t1", "b1", "s1"], intent: null } } as never;
  assert.equal(plan("why did you pick that", active).mode, "explain");
  assert.equal(plan("save it", active).mode, "save-confirm");
  assert.equal(plan("record those as worn", active).mode, "wear-confirm");
});

// REGRESSION: Hanger asked for the weather, the customer answered "Weather please", and the answer
// was read as a brand-new and much vaguer request. The five outfits already asked for never came.
test("REGRESSION: answering Hanger's question finishes the request that prompted it", () => {
  const pendingRequest = { message: "Hello please build me 5 unique outfits", count: 5 };
  const continued = plan("Weather please", { pendingRequest } as never);
  assert.equal(continued.mode, "create");
  assert.equal(continued.outfitCount, 5, "the number asked for survives a one-word answer");
  assert.match(continued.effectiveMessage, /5 unique outfits/, "the original request is what gets answered");
  assert.match(continued.effectiveMessage, /Weather please/, "with the answer added to it");

  assert.equal(plan("cold and rainy", { pendingRequest } as never).outfitCount, 5);
  assert.equal(plan("for a wedding", { pendingRequest } as never).outfitCount, 5);

  // An answer only continues a request that is actually outstanding.
  assert.equal(plan("Weather please").mode, "advice");
  // And an instruction about the current outfit is never swallowed as an answer.
  const withActive = { pendingRequest, activeOutfit: { itemIds: ["t1", "b1", "s1"], intent: null } } as never;
  assert.equal(plan("save it", withActive).mode, "save-confirm");
  assert.equal(plan("why", withActive).mode, "explain");
});

test("suppliesPendingContext reads answers, not new requests", () => {
  assert.equal(suppliesPendingContext("cold"), true);
  assert.equal(suppliesPendingContext("for the office"), true);
  assert.equal(suppliesPendingContext("Weather please"), true);
  assert.equal(suppliesPendingContext("build me something completely different for a formal evening event"), false, "a full request is not an answer");
});

test("the request is held open only while Hanger is waiting on an answer", () => {
  assert.deepEqual(plan("build me 3 outfits").pendingRequest, { message: "build me 3 outfits", count: 3 });
  assert.equal(plan("why", { activeOutfit: { itemIds: ["t1"], intent: null } } as never).pendingRequest, null, "a question asks nothing further");
  const continued = plan("cold", { pendingRequest: { message: "build me 3 outfits", count: 3 } } as never);
  assert.equal(continued.pendingRequest, null, "an answered request is not asked again");

  const stored = rememberPendingRequest(emptyHangerConversation(), { message: "build me 3 outfits", count: 3 });
  assert.deepEqual(readHangerConversation(stored).pendingRequest, { message: "build me 3 outfits", count: 3 }, "it survives a round trip through storage");
  assert.equal(readHangerConversation({ pendingRequest: { message: "x".repeat(5_000), count: 99 } }).pendingRequest?.count, 5, "a stored count stays inside the set limit");
});

// REGRESSION: on an advice turn the model wrote "Selected outfit — these exact pieces appear in
// the photos and Save action" and listed four garments. There were no photos and no Save button:
// advice was the one mode that skipped the review, so nothing checked the claim.
test("REGRESSION: a reply cannot describe an outfit that was never built", () => {
  const invented = "Selected outfit — these exact pieces appear in the photos and Save action:\n• black boots (shoe)";
  assert.equal(replyClaimsMissingOutfit(invented, []), true);
  assert.equal(replyClaimsMissingOutfit("Your current outfit works well for that.", []), true);
  assert.equal(replyClaimsMissingOutfit("You have not worn the rugby shirt in a while — it would work here.", []), false, "naming a garment is not claiming an outfit");
  assert.equal(replyClaimsMissingOutfit(invented, [wardrobe[0]]), false, "with a real selection the phrasing is accurate");

  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /!replyClaimsMissingOutfit\(generated, input\.suggested\)/, "every turn is reviewed, advice included");
});

test("the model is told the set already exists so it does not write its own", async () => {
  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /outfitsShownBelowReply/);
  assert.match(source, /do not list, invent, number, or re-describe the outfits yourself/);
  assert.match(source, /never ask a question in place of the outfit they asked for/);
  assert.match(route, /outfitCount: set\.length \|\| \(ranked \? 1 : 0\)/);

  // With no provider configured the grounded reply still answers rather than only asking back.
  const reply = await generateConsumerHangerReply({
    message: "build me an outfit for a cold wedding", history: [], wardrobe, outfits: [], required: [],
    suggested: [wardrobe[0], wardrobe[3], wardrobe[5]],
  });
  assert.equal(reply.usedModel, false);
  assert.match(reply.message, /Stussy/, "the answer comes before any question");
});

test("the route answers the held request and reports a repeated piece", () => {
  assert.match(route, /pendingRequest: stored\.pendingRequest/);
  assert.match(route, /const requestText = plan\.effectiveMessage;/);
  assert.match(route, /rememberPendingRequest\(nextState, plan\.pendingRequest\)/);
  assert.match(route, /appear in more than one outfit/);
  assert.match(route, /This answered the request still open from an earlier message/);
});
