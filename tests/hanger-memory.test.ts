import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_STORED_TURNS,
  PROMPT_HISTORY_CHAR_BUDGET,
  appendTurns,
  avoidedItemIds,
  conversationForPrompt,
  earlierConversationNote,
  emptyHangerConversation,
  extractPreferences,
  mergePreferences,
  preferenceSummary,
  readHangerConversation,
  rememberSuggestedItemIds,
} from "../lib/hanger-memory.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const vocabulary = {
  subtypes: ["heels", "t shirt", "hoodie", "high top sneakers"],
  categories: ["top", "bottom", "shoe", "dress"],
  colors: ["navy", "white", "olive"],
  styles: ["minimal", "tailored", "sporty"],
};
const turn = (role: "user" | "assistant", content: string) => ({ role, content });
const owned = (overrides: Partial<WardrobeItem> = {}): WardrobeItem => ({ id: "item-1", name: "Black heels", category: "shoe", subtype: "heels", color: "black", style: ["elegant"], season: "all-season", wearCount: 1, lastWornDays: 20, source: "ai-confirmed", art: "photo", ...overrides } as WardrobeItem);

test("a conversation continues across messages and keeps only the most recent turns",()=>{
  let state = emptyHangerConversation();
  for (let index = 0; index < MAX_STORED_TURNS + 6; index++) state = appendTurns(state, [turn("user", `message ${index}`)]);
  assert.equal(state.turns.length, MAX_STORED_TURNS);
  assert.equal(state.earlierTurnCount, 6, "what fell off the record is counted, not silently lost");
  assert.equal(state.turns.at(-1)?.content, `message ${MAX_STORED_TURNS + 5}`);
  assert.equal(state.turns[0].content, "message 6");
});

test("empty and malformed turns never enter the record",()=>{
  const state = appendTurns(emptyHangerConversation(), [turn("user", "   "), turn("assistant", "Here is an outfit.")]);
  assert.deepEqual(state.turns, [{ role: "assistant", content: "Here is an outfit." }]);
});

// The context window, spent deliberately rather than by luck.
test("the prompt history fills a character budget newest-first and never cuts a turn in half",()=>{
  let state = emptyHangerConversation();
  for (let index = 0; index < 12; index++) state = appendTurns(state, [turn("user", `${index}`.padEnd(500, "x"))]);
  const { history, usedCharacters, omittedTurnCount } = conversationForPrompt(state, 1_200);
  assert.ok(usedCharacters <= 1_200);
  assert.equal(history.length, 2, "two 500-character turns fit inside a 1,200-character budget");
  assert.equal(history.at(-1)?.content.startsWith("11"), true, "the newest turn is always included");
  assert.equal(history[0].content.startsWith("10"), true, "and history stays in chronological order");
  assert.equal(omittedTurnCount, 10);
  assert.ok(history.every((entry) => entry.content.length === 500), "no turn is truncated to fit");
});

test("the whole conversation is sent when it fits, and the model is told when it does not",()=>{
  const state = appendTurns(emptyHangerConversation(), [turn("user", "what can I wear to dinner"), turn("assistant", "Try the navy shirt.")]);
  const fits = conversationForPrompt(state, PROMPT_HISTORY_CHAR_BUDGET);
  assert.equal(fits.history.length, 2);
  assert.equal(fits.omittedTurnCount, 0);
  assert.equal(earlierConversationNote(fits.omittedTurnCount), null);
  assert.match(earlierConversationNote(7)!, /7 earlier messages .* no longer quoted/);
  assert.match(earlierConversationNote(1)!, /1 earlier message /);
});

test("a stated dislike is remembered, and a later change of mind replaces it",()=>{
  const avoid = extractPreferences("I never wear heels, honestly", vocabulary);
  assert.deepEqual(avoid, [{ kind: "avoid", facet: "subtype", value: "heels" }]);
  const prefer = extractPreferences("I prefer navy and minimal pieces", vocabulary);
  assert.deepEqual(prefer.map((entry) => `${entry.kind}:${entry.value}`).sort(), ["prefer:minimal", "prefer:navy"]);
  const merged = mergePreferences(avoid, extractPreferences("actually I like heels now", vocabulary));
  assert.deepEqual(merged, [{ kind: "prefer", facet: "subtype", value: "heels" }], "the newest statement wins");
});

// REGRESSION guard on the memory's boundary: only controlled vocabulary is ever stored, so a
// sentence about a person leaves nothing behind.
test("REGRESSION: nothing outside the wardrobe vocabulary is ever remembered",()=>{
  assert.deepEqual(extractPreferences("I am pregnant and recovering from surgery", vocabulary), []);
  assert.deepEqual(extractPreferences("my partner hates my job", vocabulary), []);
  assert.deepEqual(extractPreferences("I never wear anything my ex bought", vocabulary), [], "a dislike with no vocabulary term stores nothing");
  assert.deepEqual(extractPreferences("show me a navy outfit", vocabulary), [], "a request is not a standing preference");
});

test("remembered preferences read as a sentence and cap at a bounded number",()=>{
  const preferences = mergePreferences([], [
    ...extractPreferences("I never wear heels", vocabulary),
    ...extractPreferences("I prefer navy", vocabulary),
  ]);
  assert.equal(preferenceSummary(preferences), "avoids heels; prefers navy");
  assert.equal(preferenceSummary([]), "");
  const many = mergePreferences([], Array.from({ length: 30 }, (_, index) => ({ kind: "avoid" as const, facet: "style" as const, value: `style${index}` })));
  assert.equal(many.length, 12);
  assert.equal(many.at(-1)?.value, "style29", "the most recent statements are the ones kept");
});

test("a remembered dislike maps only to the owner's matching pieces",()=>{
  // Stored subtypes use the taxonomy's hyphenated ids; a remembered preference is stated in words.
  const wardrobe = [owned(), owned({ id: "item-2", name: "White tee", category: "top", subtype: "t-shirt", color: "white" }), owned({ id: "item-3", name: "Navy chinos", category: "bottom", subtype: "chinos", color: "navy" })];
  assert.deepEqual(avoidedItemIds(extractPreferences("I never wear heels", vocabulary), wardrobe), ["item-1"]);
  assert.deepEqual(avoidedItemIds(extractPreferences("I avoid navy", vocabulary), wardrobe), ["item-3"]);
  assert.deepEqual(avoidedItemIds(extractPreferences("I prefer navy", vocabulary), wardrobe), [], "a preference is not an exclusion");
  assert.deepEqual(avoidedItemIds([], wardrobe), []);
});

test("already-suggested pieces are remembered so a follow-up brings something new",()=>{
  const state = rememberSuggestedItemIds(rememberSuggestedItemIds(emptyHangerConversation(), ["a", "b"]), ["b", "c"]);
  assert.deepEqual(state.suggestedItemIds, ["a", "b", "c"]);
});

test("a stored record is read back defensively",()=>{
  const recovered = readHangerConversation({ turns: [{ role: "assistant", content: "hi" }, { role: "nonsense", content: "" }], preferences: [{ kind: "avoid", facet: "subtype", value: "HEELS" }, { value: "" }], suggestedItemIds: ["a", "a", 7], earlierTurnCount: -3 });
  assert.deepEqual(recovered.turns, [{ role: "assistant", content: "hi" }]);
  assert.deepEqual(recovered.preferences, [{ kind: "avoid", facet: "subtype", value: "heels" }]);
  assert.deepEqual(recovered.suggestedItemIds, ["a"]);
  assert.equal(recovered.earlierTurnCount, 0);
  assert.deepEqual(readHangerConversation(null), emptyHangerConversation());
  assert.deepEqual(readHangerConversation("nonsense"), emptyHangerConversation());
});

test("the conversation is owned by the account: stored, cleared, and deleted with it",()=>{
  const store = read("lib/server/production-store.ts");
  assert.match(store, /SK:"HANGER_CHAT"/);
  assert.match(store, /export async function loadHangerConversation/);
  assert.match(store, /export async function saveHangerConversation/);
  assert.match(store, /export async function clearHangerConversation/);
  // Account deletion walks every record in the partition, so the conversation goes with it.
  assert.match(store, /KeyConditionExpression:"PK = :pk",ExpressionAttributeValues:\{":pk":`USER#\$\{ownerId\}`\}/);

  const route = read("app/api/agents/consumer/route.ts");
  assert.match(route, /loadHangerConversation\((?:subject|session!\.subject)\)/);
  assert.match(route, /saveHangerConversation\(subject/);
  assert.match(route, /export async function DELETE/, "a person can clear what Hanger remembers");
  assert.match(route, /export async function GET/, "and reopen the conversation where they left it");
  assert.doesNotMatch(route, /sanitizeAgentHistory\(body\.history\)/, "history comes from the account, not the browser");
});

test("the stylist panel restores the stored conversation instead of starting over",()=>{
  const panel = read("components/agent-panels.tsx");
  assert.match(panel, /fetch\("\/api\/agents\/consumer"\)/, "the panel loads the stored conversation on open");
  assert.match(panel, /method:"DELETE"|method: "DELETE"/, "and offers to clear it");
  assert.doesNotMatch(panel, /body: JSON\.stringify\(\{ message, history, previousSuggestionItemIds \}\)/, "the browser no longer carries the history");
});
