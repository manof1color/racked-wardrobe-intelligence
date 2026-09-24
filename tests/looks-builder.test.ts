import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addExtra, availableExtras, finishLooks, initialLooks, looksItemIds, looksRows, removeExtra, rowAccepts, setMode, shuffleLooks, stepRow, toggleLock,
  type LooksState,
} from "../lib/looks-rows.ts";
import { rankOutfit, seasonsClash } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const make = (id: string, category: string, subtype: string, wearCount = 3, season = "all-season"): WardrobeItem => ({
  id, name: id, category, subtype, color: "navy", pattern: "solid", material: "cotton", style: ["casual"], season,
  wearCount, lastWornDays: 10, source: "ai-confirmed", art: "photo",
} as WardrobeItem);

// The seeded judge closet, seasons included.
const closet = [
  make("oxford", "top", "dress-shirt", 6), make("tee", "top", "t-shirt", 14, "summer"), make("knit", "top", "sweater", 1, "winter"),
  make("trouser", "bottom", "dress-pants", 3, "winter"), make("jean", "bottom", "jeans", 18), make("short", "bottom", "shorts", 0, "summer"),
  make("blazer", "outerwear", "blazer", 2), make("shell", "outerwear", "rain-jacket", 1, "fall"),
  make("derby", "shoe", "derbies", 4), make("sneaker", "shoe", "sneakers", 22),
];
const rowOf = (state: ReturnType<typeof initialLooks>, key: string, wardrobe = closet) => looksRows(wardrobe, state).find((row) => row.key === key)!;

test("the Looks screen opens on Hanger's pick for today", () => {
  const state = initialLooks(closet);
  const hanger = rankOutfit(closet, "What should I wear today?", { maxPieces: 4 }).pieces.map((piece) => piece.item.id).sort();
  assert.deepEqual([...looksItemIds(closet, state)].sort(), hanger, "the opening outfit is exactly the ranker's");
  assert.deepEqual(looksRows(closet, state).map((row) => row.key), ["layer", "top", "bottom", "shoe"], "rows in the order a person dresses");
});

// REGRESSION: every piece was scored on its own, so with no weather given the judge closet opened
// on a winter knit over summer linen shorts — the first thing a judge would see on this screen.
test("REGRESSION: summer and winter pieces are not put in one outfit", () => {
  const ids = rankOutfit(closet, "What should I wear today?", { maxPieces: 4 }).pieces.map((piece) => piece.item);
  for (const first of ids) for (const second of ids) assert.equal(seasonsClash(first.season, second.season), false, `${first.id} (${first.season}) with ${second.id} (${second.season})`);

  assert.equal(seasonsClash("summer", "winter"), true);
  assert.equal(seasonsClash("all-season", "winter"), false, "all-season goes with anything");
  assert.equal(seasonsClash("fall", "summer"), false, "only a direct contradiction counts");
  assert.equal(seasonsClash(undefined, "winter"), false, "an untagged piece never clashes");

  const onlyShorts = [make("knit", "top", "sweater", 1, "winter"), make("short", "bottom", "shorts", 0, "summer"), make("derby", "shoe", "derbies")];
  const forced = rankOutfit(onlyShorts, "What should I wear today?", { maxPieces: 4 }).pieces.map((piece) => piece.item.id);
  assert.ok(forced.includes("short"), "a clash is still better than an outfit with no bottom");
  const asked = rankOutfit(closet, "wear my knit with my shorts", { requiredItemIds: ["knit", "short"] }).pieces.map((piece) => piece.item.id);
  assert.ok(asked.includes("knit") && asked.includes("short"), "pieces the person asks for are never dropped for a season");
});

test("the Layer row holds jackets and shirts, jackets first, and can be left empty", () => {
  const layer = rowOf(initialLooks(closet), "layer");
  assert.ok(layer.optional);
  assert.deepEqual(layer.items.map((item) => item.category), ["outerwear", "outerwear", "top", "top", "top"], "jackets come before shirts");
  assert.ok(rowAccepts("layer", make("x", "top", "casual-shirt")) && rowAccepts("layer", make("y", "outerwear", "blazer")));
  let state: LooksState = { ...initialLooks(closet), selected: { ...initialLooks(closet).selected, layer: "shell" } };
  const visited: Array<string | null> = [];
  for (let step = 0; step < 6; step++) { state = stepRow(closet, state, "layer", 1); visited.push(state.selected.layer ?? null); }
  assert.ok(visited.includes(null), "the Layer row reaches \"none\"");
});

test("a shirt worn as the Top is never offered as the Layer over itself", () => {
  let state = initialLooks(closet);
  const top = state.selected.top;
  for (let step = 0; step < 10; step++) {
    state = stepRow(closet, state, "layer", 1);
    assert.notEqual(state.selected.layer, top);
  }
});

test("a locked row stays put through flipping, Shuffle, and Finish", () => {
  const start = toggleLock(initialLooks(closet), "shoe");
  const shoe = start.selected.shoe;
  assert.equal(stepRow(closet, start, "shoe", 1).selected.shoe, shoe, "a locked row does not flip");
  let shuffled = start;
  for (let round = 0; round < 3; round++) {
    const before = looksItemIds(closet, shuffled).join();
    shuffled = shuffleLooks(closet, shuffled);
    assert.equal(shuffled.selected.shoe, shoe, "Shuffle keeps the locked shoes");
    assert.notEqual(looksItemIds(closet, shuffled).join(), before, "and always changes something else");
  }
  assert.equal(finishLooks(closet, shuffled).selected.shoe, shoe, "Finish keeps them too");
});

test("Dress mode swaps Top and Bottom for one Dress row, and back", () => {
  const wardrobe = [...closet, make("midi", "dress", "midi-dress")];
  const dressed = setMode(wardrobe, initialLooks(wardrobe), "dress");
  assert.deepEqual(looksRows(wardrobe, dressed).map((row) => row.key), ["layer", "dress", "shoe"]);
  assert.ok(looksItemIds(wardrobe, dressed).includes("midi"));
  assert.ok(!looksItemIds(wardrobe, dressed).some((id) => ["oxford", "tee", "knit", "trouser", "jean", "short"].includes(id) && id !== dressed.selected.layer), "no separates under a dress");
  const back = setMode(wardrobe, dressed, "separates");
  assert.deepEqual(looksRows(wardrobe, back).map((row) => row.key), ["layer", "top", "bottom", "shoe"]);
});

test("extra rows are offered only for what the closet holds, and open on a piece", () => {
  assert.deepEqual(availableExtras(closet, initialLooks(closet)), [], "no hat, bag, or jewellery in this closet, so no chips");
  const wardrobe = [...closet, make("cap", "accessory", "hat"), make("tote", "bag", "tote")];
  const state = initialLooks(wardrobe);
  assert.deepEqual(availableExtras(wardrobe, state).sort(), ["bag", "hat"]);
  const withHat = addExtra(wardrobe, state, "hat");
  assert.equal(withHat.selected.hat, "cap", "tapping + Hat means a hat is wanted");
  assert.ok(looksItemIds(wardrobe, withHat).includes("cap"));
  assert.ok(!looksItemIds(wardrobe, removeExtra(withHat, "hat")).includes("cap"));
});

test("a piece deleted elsewhere drops out rather than showing stale", () => {
  const state = initialLooks(closet);
  const bottom = state.selected.bottom;
  const without = closet.filter((item) => item.id !== bottom);
  assert.ok(rowOf(state, "bottom", without).selected, "a required row falls back to another piece");
  assert.ok(!looksItemIds(without, state).includes(String(bottom)));
});

test("the dashboard's Looks tab uses the row builder, with save and wear kept separate", () => {
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /<LooksBuilder items=\{items\} onSave=\{saveNewOutfit\} onWear=\{recordNewOutfit\} onAddClothing=\{openAdd\}\/>/);
  assert.match(dashboard, /async function saveNewOutfit\(itemIds:string\[\]\)/, "Save look saves without recording a wear");
  const builder = read("components/looks-builder.tsx");
  assert.match(builder, /const SWIPE_DISTANCE = 40;/);
  assert.match(builder, /aria-label=\{`Next \$\{row\.label\.toLowerCase\(\)\}`\}/, "every arrow says which row it flips");
  assert.match(builder, /aria-pressed=\{row\.locked\}/);
  // The layout budget that keeps the whole outfit on one phone screen, measured at 724px of 778.
  assert.match(read("app/globals.css"), /\.looks-row\{position:relative;height:124px;/);
});
