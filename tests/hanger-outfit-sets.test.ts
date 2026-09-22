import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_OUTFIT_SET, rankOutfitSet, requestedOutfitCount } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/agents/consumer/route.ts");

function piece(id: string, category: string, subtype: string): WardrobeItem {
  return {
    id, name: `${category} ${id}`, category, subtype, color: "navy", pattern: "solid", material: "cotton",
    style: ["casual"], season: "all-season", wearCount: 1, lastWornDays: 20, source: "ai-confirmed", art: "photo",
  } as WardrobeItem;
}
// Four of each slot: enough for four complete outfits and not a fifth.
const wardrobe = [
  ...["t1", "t2", "t3", "t4"].map((id) => piece(id, "top", "t-shirt")),
  ...["b1", "b2", "b3", "b4"].map((id) => piece(id, "bottom", "jeans")),
  ...["s1", "s2", "s3", "s4"].map((id) => piece(id, "shoe", "sneakers")),
];

// REGRESSION: "Build me 5 unique outfits" returned one outfit, because nothing read the number.
test("REGRESSION: a request for several outfits is answered with several outfits", () => {
  assert.equal(requestedOutfitCount("Build me 5 unique outfits at once"), 5);
  assert.equal(requestedOutfitCount("Build me 5 unique outfits for the week right now"), 5);
  assert.equal(requestedOutfitCount("build three different looks"), 3);
  assert.equal(requestedOutfitCount("give me a few outfits"), 3);
  assert.equal(requestedOutfitCount("outfits for the week"), MAX_OUTFIT_SET);
  assert.equal(requestedOutfitCount("what can I wear tonight"), 1, "an ordinary request is still one outfit");
  assert.equal(requestedOutfitCount("build me 40 outfits"), MAX_OUTFIT_SET, "a set stays reviewable");
});

test("outfits in a set share no pieces", () => {
  const set = rankOutfitSet(wardrobe, "Build me 4 unique outfits", { count: 4 });
  assert.equal(set.length, 4);
  assert.deepEqual(set.map((entry) => entry.index), [1, 2, 3, 4]);
  const everyId = set.flatMap((entry) => entry.outfit.pieces.map((ranked) => ranked.item.id));
  assert.equal(new Set(everyId).size, everyId.length, "no piece appears in two outfits");
  for (const entry of set) assert.ok(entry.outfit.pieces.length >= 2, "each outfit is a real outfit");
});

test("a closet that runs out stops the set instead of repeating itself", () => {
  const small = [piece("t1", "top", "t-shirt"), piece("b1", "bottom", "jeans"), piece("s1", "shoe", "sneakers")];
  const set = rankOutfitSet(small, "Build me 5 unique outfits", { count: 5 });
  assert.equal(set.length, 1, "one outfit is all three pieces can make");
  assert.match(route, /outfit\$\{set\.length === 1 \? "" : "s"\} built of the \$\{requestedCount\} asked for — your closet ran out of unused pieces/, "and the reply says so");
});

test("the route builds the set, and every outfit carries its own actions", () => {
  assert.match(route, /const requestedCount = producesOutfit \? requestedOutfitCount\(message\) : 1;/);
  assert.match(route, /const set = producesOutfit && requestedCount > 1 \? rankOutfitSet\(wardrobe, message, \{ \.\.\.rankingOptions, count: requestedCount \}\) : \[\];/);
  assert.match(route, /type: `save-outfit-\$\{index\}`/);
  assert.match(route, /type: `record-outfit-\$\{index\}`/);
  assert.match(route, /\(outfitSet \?\? \[\{ pieces: selection \}\]\)\.flatMap/, "every piece offered is remembered, so a follow-up rotates past the whole set");

  const panel = read("components/agent-panels.tsx");
  assert.match(panel, /const set = reply\.outfits && reply\.outfits\.length > 1 \? reply\.outfits : null;/);
  assert.match(panel, /key=\{`\$\{keyPrefix\}\$\{action\.type\}`\}/, "two outfits' actions cannot collide on one key");
  assert.match(panel, /className="hanger-outfit-set"/);
});

// A set is something a create or revise turn builds. "Explain those five outfits" is a question
// about the five already on screen, so it must not quietly propose five more underneath the answer.
test("only a turn that builds outfits builds a set of them", () => {
  assert.match(route, /const producesOutfit = plan\.mode === "create" \|\| plan\.mode === "revise";/);
  assert.match(route, /const ranked = set\.length \? set\[0\]\.outfit : producesOutfit \? rankOutfit\(wardrobe, message, rankingOptions\) : null;/);
  assert.match(route, /actionMode === "both" \|\| actionMode === "save"/, "a set's Save buttons obey the same permission the single outfit gets");
  assert.match(route, /actionMode === "both" \|\| actionMode === "record"/);
});

test("one outfit still renders exactly as it did", () => {
  assert.match(route, /\.\.\.\(outfitSet \? \{ outfits: outfitSet \} : \{\}\)/, "a single outfit sends no set at all");
  const panel = read("components/agent-panels.tsx");
  assert.match(panel, /\{hasSelection && pieceGrid\(reply\.selection!, "Pieces in Hanger's current outfit"\)\}/);
});
