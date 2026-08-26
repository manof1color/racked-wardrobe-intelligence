import test from "node:test";
import assert from "node:assert/strict";
import { NEVER_WORN_DAYS, wornDaysAgo } from "../lib/wear-recency.ts";
import { rankOutfit } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const NOW = Date.parse("2026-08-24T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

test("REGRESSION: a wear recorded today reads as zero days, not the stale stored value", () => {
  // The stored age said 999 ("never worn") while the timestamp says it was worn today.
  // Before this fix the stale 999 won, so a recorded wear reverted on reload.
  assert.equal(wornDaysAgo(daysAgo(0), 999, NOW), 0);
  assert.equal(wornDaysAgo(daysAgo(1), 999, NOW), 1);
  assert.equal(wornDaysAgo(daysAgo(45), 2, NOW), 45, "the timestamp is authoritative over the stored age");
});

test("a garment with no wear timestamp keeps its stored age", () => {
  assert.equal(wornDaysAgo(undefined, 30, NOW), 30);
  assert.equal(wornDaysAgo(null, 7, NOW), 7);
  assert.equal(wornDaysAgo("not a date", 12, NOW), 12);
});

test("a record with neither a timestamp nor a usable age reads as never worn", () => {
  assert.equal(wornDaysAgo(undefined, undefined, NOW), NEVER_WORN_DAYS);
  assert.equal(wornDaysAgo(undefined, -5, NOW), NEVER_WORN_DAYS, "a negative stored age is not usable");
  assert.equal(wornDaysAgo(undefined, "nonsense", NOW), NEVER_WORN_DAYS);
});

test("clock skew never produces a negative age", () => {
  assert.equal(wornDaysAgo(new Date(NOW + 60_000).toISOString(), 5, NOW), 0);
});

test("age is derived fresh, so a fixture does not drift as time passes", () => {
  const wornAt = daysAgo(3);
  assert.equal(wornDaysAgo(wornAt, 3, NOW), 3);
  assert.equal(wornDaysAgo(wornAt, 3, NOW + 7 * 86_400_000), 10, "the same record ages correctly a week later");
});

function garment(overrides: Partial<WardrobeItem> & Pick<WardrobeItem, "id" | "name" | "category" | "lastWornDays">): WardrobeItem {
  return { color: "black", style: [], season: "all-season", wearCount: 0, source: "ai-confirmed", art: "photo", ...overrides } as WardrobeItem;
}

test("REGRESSION: a just-worn garment stops being surfaced as a rotation candidate", () => {
  // This is what the stale age actually broke: recency feeds the outfit ranker, so a
  // garment worn today kept scoring as "not worn on record" and kept being recommended.
  const justWorn = garment({ id: "worn-today", name: "Worn Today Tee", category: "top", wearCount: 3, lastWornDays: wornDaysAgo(daysAgo(0), 999, NOW) });
  const longUnworn = garment({ id: "forgotten", name: "Forgotten Shirt", category: "top", wearCount: 3, lastWornDays: wornDaysAgo(daysAgo(120), 999, NOW) });
  const ids = rankOutfit([justWorn, longUnworn], "What have I not worn lately?").pieces.map((piece) => piece.item.id);
  assert.equal(ids[0], "forgotten", "the genuinely neglected piece should lead a rotation request");
});
