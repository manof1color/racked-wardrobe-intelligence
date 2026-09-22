import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_HANGER_MODEL, FALLBACK_HANGER_MODEL, generateConsumerHangerReply, hangerModelCandidates, MAX_HANGER_MODEL_ATTEMPTS, mayTryAnotherHangerModel } from "../lib/hanger-conversation.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const owned = (id: string, overrides: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id, name: `Piece ${id}`, category: "top", subtype: "t-shirt", color: "navy", pattern: "solid", material: "cotton",
  style: ["casual"], season: "all-season", wearCount: 2, lastWornDays: 10, source: "ai-confirmed", art: "photo",
  ...overrides,
} as WardrobeItem);

// REGRESSION: Amazon serves Nova through regional inference profiles, so `amazon.nova-lite-v1:0`
// is rejected where `us.amazon.nova-lite-v1:0` is accepted. Detection used the prefixed id; the
// chat path used the bare AI_MODEL value, so every conversational reply failed its one Bedrock call
// and fell back to the same grounded sentence — a stylist that looked like it was repeating itself.
test("REGRESSION: the chat model is tried in its inference-profile form first", () => {
  const candidates = hangerModelCandidates({ AI_MODEL: "amazon.nova-lite-v1:0" });
  assert.equal(candidates[0], "us.amazon.nova-lite-v1:0", "the prefixed form leads");
  assert.ok(candidates.includes("amazon.nova-lite-v1:0"), "and the configured id is still tried");
  assert.ok(candidates.length <= MAX_HANGER_MODEL_ATTEMPTS, "attempts stay bounded so a reply is never slow to arrive");

  assert.equal(hangerModelCandidates({ AI_HANGER_MODEL: "us.amazon.nova-pro-v1:0" })[0], "us.amazon.nova-pro-v1:0", "an already-prefixed id is left alone");
  assert.equal(hangerModelCandidates({ AI_HANGER_MODEL: "anthropic.claude-haiku-4-5-20251001-v1:0" })[0], "anthropic.claude-haiku-4-5-20251001-v1:0", "a non-Nova id is never rewritten");
  assert.deepEqual(hangerModelCandidates({}), [DEFAULT_HANGER_MODEL, FALLBACK_HANGER_MODEL], "with nothing configured, both Nova profiles are tried");
});

test("another model is tried for a configuration failure, never for a timeout", () => {
  const named = (name: string) => Object.assign(new Error("boom"), { name });
  for (const name of ["ValidationException", "AccessDeniedException", "ResourceNotFoundException", "ModelNotReadyException"]) {
    assert.equal(mayTryAnotherHangerModel(named(name)), true, name);
  }
  for (const name of ["TimeoutError", "AbortError", "ThrottlingException", "ServiceUnavailableException"]) {
    assert.equal(mayTryAnotherHangerModel(named(name)), false, `${name} must not double the wait`);
  }
  assert.equal(mayTryAnotherHangerModel("not an error"), false);

  const source = read("lib/hanger-conversation.ts");
  assert.match(source, /if \(!mayTryAnotherHangerModel\(error\)\) return null;/);
  assert.match(source, /for \(const \[index, modelId\] of candidates\.entries\(\)\)/);
});

// The grounded reply is a fallback, not a script: two different requests must not read identically.
test("REGRESSION: a grounded reply varies with the request and the selection", async () => {
  const wardrobe = [owned("a"), owned("b", { category: "bottom", subtype: "jeans", name: "Piece b" }), owned("c", { category: "shoe", subtype: "boots", name: "Piece c" })];
  const base = { history: [], wardrobe, outfits: [], required: [] };
  const first = await generateConsumerHangerReply({ ...base, message: "Build me an outfit", suggested: [wardrobe[0], wardrobe[1]] });
  const second = await generateConsumerHangerReply({ ...base, message: "Something for a wedding in the cold", suggested: [wardrobe[1], wardrobe[2]] });
  assert.equal(first.usedModel, false, "no provider is configured in tests, so both are grounded replies");
  assert.notEqual(first.message, second.message, "a different request must not return identical prose");
  assert.match(first.message, /Tell me the occasion and the weather/, "an unqualified request asks for what is missing");
  assert.doesNotMatch(second.message, /Tell me the occasion and the weather/, "a request that supplied both does not ask again");

  const repeat = await generateConsumerHangerReply({ ...base, message: "Build me an outfit", suggested: [wardrobe[0], wardrobe[1]] });
  assert.equal(first.message, repeat.message, "the same request is still answered the same way");
});

test("a reply the model did not write says so, in the response and on screen", () => {
  assert.match(read("app/api/agents/consumer/route.ts"), /The stylist model did not answer this turn, so this reply is composed from your wardrobe alone/);
  assert.match(read("components/agent-panels.tsx"), /reply\.provider === "grounded-wardrobe" && <p className="hanger-degraded"/);
  assert.match(read("app/globals.css"), /\.hanger-degraded\{/);
});
