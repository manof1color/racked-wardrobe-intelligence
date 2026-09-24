import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateConsumerHangerReply, replyClaimsMissingOutfit } from "../lib/hanger-conversation.ts";
import { rememberPendingRequest, readHangerConversation, emptyHangerConversation } from "../lib/hanger-memory.ts";
import { planHangerTurn, replyAsksBack, suppliesPendingContext } from "../lib/hanger-turn.ts";
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
  assert.equal(replyClaimsMissingOutfit("Here is your suggested outfit for that.", []), true);
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
  assert.match(route, /rememberPendingRequest\(nextState, replyAsksBack\(reply\.message\) \? plan\.pendingRequest : null\)/);
  assert.match(route, /appear in more than one outfit/);
  assert.match(route, /This answered the request still open from an earlier message/);
});

// Every reply in the reported session ended with the same sentence — the clearest signal that
// something is reciting rather than talking.
test("the stylist is told not to ask the same question twice", () => {
  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /Never close two replies in a row with the same question/);
  assert.match(source, /never repeat a question the conversation has already answered/);
  assert.match(source, /illustration only and never as a source of garments/, "the voice example cannot be mined for clothes");
  assert.match(source, /temperature: 0\.6/, "two similar requests do not come back in identical sentences");
});

// REGRESSION: "an outfit that includes the Megalace Slides" produced an outfit without them. The
// cue list held "include" but not "includes", and a word boundary makes those different words, so
// the piece the customer named by hand was never required — and nothing asked about it either.
test("REGRESSION: a piece named in the request is in the outfit", () => {
  const asked = plan("What about an outfit that includes the Megalace Slides");
  assert.equal(asked.mode, "create");
  assert.deepEqual(asked.requiredItemIds, ["s3"], "the named piece is required, not merely mentioned");

  for (const phrasing of [
    "an outfit that includes the Megalace Slides",
    "a look that features the Black Skully",
    "something that uses the Blue Jeans",
    "build a fit with the Megalace Slides",
  ]) {
    assert.ok(plan(phrasing).requiredItemIds.length > 0, phrasing);
  }

  // A named piece that is not owned still asks rather than quietly building something else.
  const unresolved = plan("What about an outfit that includes the red velvet blazer");
  assert.equal(unresolved.mode, "clarify");
  assert.match(unresolved.clarification ?? "", /exact saved name/);
});

// A set whose outfits differ by one shirt is five outfits on paper and one look in the mirror.
// The seeded judge closet is the hard case: four tops and three bottoms, but only two pairs of
// shoes, so forcing variety can strip a category bare if nothing stops it.
test("outfits in a set differ by more than a single piece", () => {
  const closet = [
    make("t1", "Blue Oxford", "top", "dress-shirt"), make("t2", "White Tee", "top", "t-shirt"),
    make("t3", "Charcoal Knit", "top", "sweater"), make("t4", "Signature Tee", "top", "t-shirt"),
    make("b1", "Wool Trouser", "bottom", "dress-pants"), make("b2", "Indigo Jean", "bottom", "jeans"),
    make("b3", "Linen Short", "bottom", "shorts"),
    make("o1", "Tailored Blazer", "outerwear", "blazer"), make("o2", "Rain Shell", "outerwear", "rain-jacket"),
    make("o3", "Olive Overshirt", "outerwear", "denim-jacket"),
    make("s1", "Leather Derby", "shoe", "dress-shoes"), make("s2", "White Sneaker", "shoe", "sneakers"),
  ];
  const set = rankOutfitSet(closet, "Build me 5 unique outfits", { count: 5 });
  assert.equal(set.length, 5, "five distinct outfits exist in this closet and all five are found");

  for (const entry of set) {
    const categories = new Set(entry.outfit.pieces.map((piece) => piece.item.category));
    assert.ok(categories.has("shoe"), `outfit ${entry.index} has shoes — forcing variety must never empty a category`);
    assert.equal(categories.size, entry.outfit.pieces.length, "one piece per category");
  }

  for (const [index, entry] of set.entries()) {
    for (const other of set.slice(index + 1)) {
      const ids = new Set(other.outfit.pieces.map((piece) => piece.item.id));
      const shared = entry.outfit.pieces.filter((piece) => ids.has(piece.item.id)).length;
      const size = Math.max(entry.outfit.pieces.length, other.outfit.pieces.length);
      assert.ok(shared <= size - 2, `outfits ${entry.index} and ${other.index} share ${shared} of ${size} — they read as one look restyled`);
    }
  }
});

// REGRESSION (found in review of #141): any message of four words or fewer counted as an answer,
// so after an outfit request "thanks!", "love it", and "lol" each built five more outfits — the
// exact going-in-circles behaviour the continuation was written to stop.
test("REGRESSION: saying thanks does not rebuild the outfits", () => {
  const pendingRequest = { message: "build me 5 unique outfits", count: 5 };
  const activeOutfit = { itemIds: ["t1", "b1", "s1"], intent: null };
  for (const message of ["thanks!", "ok cool", "love it", "hello", "nice one", "lol", "have a good day", "no, that's fine for work", "yes"]) {
    const turn = plan(message, { pendingRequest, activeOutfit } as never);
    assert.notEqual(turn.mode, "create", `${JSON.stringify(message)} is conversation, not a request`);
    assert.equal(turn.outfitCount, 1, `${JSON.stringify(message)} must not ask for five outfits`);
  }
  assert.notEqual(plan("cool, thanks", { pendingRequest, activeOutfit } as never).mode, "create", "thanks anywhere is thanks");
  // A real answer still completes the request — including the weather words that double as
  // pleasantries, since a request is only held right after Hanger asked something.
  assert.equal(plan("cold and rainy", { pendingRequest, activeOutfit } as never).outfitCount, 5);
  assert.equal(plan("cool and rainy", { pendingRequest, activeOutfit } as never).outfitCount, 5);
});

// The request is held only when the reply asked something. Holding it after every outfit meant
// the next unrelated message was read as an answer to a question nobody had asked.
test("a request is held open only when the reply actually asked something", () => {
  assert.equal(replyAsksBack("Here are five looks for the week. Want them warmer?"), true);
  assert.equal(replyAsksBack("Here are five looks for the week."), false);
  assert.match(route, /replyAsksBack\(reply\.message\) \? plan\.pendingRequest : null/);
});

// REGRESSION (found in review of #144): adding "has" and "have" as cues for a requested piece
// made "I don't have the black boots anymore" *require* the boots, and made "I have the day off
// tomorrow" ask which garment was meant instead of building an outfit.
test("REGRESSION: 'have' is not a request for a piece", () => {
  const dayOff = plan("I have the day off tomorrow, what should I wear?");
  assert.equal(dayOff.mode, "create", "an ordinary sentence gets an outfit, not a question about a garment");
  assert.deepEqual(dayOff.requiredItemIds, []);

  assert.deepEqual(plan("I don't have the black boots anymore, build me an outfit").requiredItemIds, [], "a piece someone no longer has is never required");
  assert.deepEqual(plan("my friend has the same Blue Jeans, what should I wear").requiredItemIds, []);

  // The fix for "includes" still stands.
  assert.deepEqual(plan("What about an outfit that includes the Megalace Slides").requiredItemIds, ["s3"]);
});

// The guard exists to stop a reply describing screen furniture that is not there. Ordinary
// speech about someone's clothes is not that, and rejecting it threw good advice away.
test("the claims guard rejects invented screen furniture, not ordinary speech", () => {
  assert.equal(replyClaimsMissingOutfit("These pieces are your least worn.", []), false);
  assert.equal(replyClaimsMissingOutfit("Your current outfit already handles rain.", []), false);
  assert.equal(replyClaimsMissingOutfit("Selected outfit — these exact pieces appear in the photos and Save action.", []), true);
  assert.equal(replyClaimsMissingOutfit("Tap Save action below.", []), true);
});
