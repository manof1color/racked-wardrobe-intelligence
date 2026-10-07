/**
 * A stylist's evaluation set: the closet from the reported conversation, and what a stylist would
 * and would not put in front of someone for each request. The cases run through the same code the
 * live app uses — the outfit builder, the turn planner, and the agent's build_outfits tool — so a
 * change that makes Hanger dress someone badly fails here before it reaches a phone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_TOOLS, describeAgentFailure, plainReplyWorthTrying, runHangerAgent, type AgentConverse, type AgentFailure, type AgentInput } from "../lib/hanger-agent.ts";
import { planHangerTurn } from "../lib/hanger-turn.ts";
import { rankOutfit, rankOutfitSet, readOutfitIntent } from "../lib/outfit-ranking.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const make = (id: string, name: string, category: string, subtype: string, extra: Partial<WardrobeItem> = {}) =>
  ({ id, name, category, subtype, color: "", pattern: "solid", style: ["casual"], season: "all-season", wearCount: 2, lastWornDays: 10, source: "ai-confirmed", art: "photo", ...extra }) as WardrobeItem;

// The reported closet. The graphic tee was never worn, which is why rotation used to pick it.
const closet = [
  make("stussy", "Stussy", "top", "t-shirt", { pattern: "graphic print", wearCount: 0, lastWornDays: 999 }),
  make("navy", "Navy T Shirt", "top", "t-shirt"),
  make("henley", "Green Henley", "top", "casual-shirt", { wearCount: 6, lastWornDays: 2 }),
  make("skel", "Skeleton Long Sleeve", "top", "other-top", { pattern: "graphic print" }),
  make("jeans", "Blue Jeans", "bottom", "jeans", { wearCount: 5, lastWornDays: 3 }),
  make("ripped", "Ripped Jeans", "bottom", "jeans", { wearCount: 0, lastWornDays: 999 }),
  make("jorts", "Lugz Jorts", "bottom", "shorts"),
  make("j4", "Jordan 4 Wet Concretes", "shoe", "sneakers"),
  make("ow", "Off White Air Jordans", "shoe", "sneakers", { wearCount: 0, lastWornDays: 999 }),
  make("timbs", "LV Timbs", "shoe", "boots", { wearCount: 4, lastWornDays: 4 }),
  make("skully", "Black Skully", "accessory", "beanie", { wearCount: 0, lastWornDays: 999 }),
];
// The same closet with a few dressier and athletic pieces, for requests the first cannot answer well.
const fuller = [
  ...closet,
  make("oxford", "White Oxford Shirt", "top", "casual-shirt", { style: ["classic"], wearCount: 4, lastWornDays: 6 }),
  make("chinos", "Khaki Chinos", "bottom", "chinos", { wearCount: 4, lastWornDays: 6 }),
  make("loafers", "Brown Loafers", "shoe", "loafers", { wearCount: 3, lastWornDays: 8 }),
  make("belt", "Brown Leather Belt", "accessory", "belt"),
  make("hoodie", "Grey Hoodie", "top", "hoodie"),
  make("joggers", "Black Joggers", "bottom", "casual-pants"),
  make("runners", "Running Shoes", "shoe", "running-shoes"),
];

const names = (pieces: WardrobeItem[]) => pieces.map((item) => item.name);
const built = (wardrobe: WardrobeItem[], message: string) => rankOutfit(wardrobe, message).pieces.map((piece) => piece.item);
const casualPieces = ["Stussy", "Skeleton Long Sleeve", "Ripped Jeans", "Lugz Jorts", "Off White Air Jordans", "Jordan 4 Wet Concretes", "Black Skully"];

// REGRESSION: "I need a more formal outfit any ideas" came back as the graphic tee, jeans, Jordans,
// and the skully — while a henley and Timbs sat in the same closet.
test("REGRESSION: a more formal outfit reaches for the dressiest pieces owned", () => {
  const outfit = names(built(closet, "I need a more formal outfit any ideas"));
  assert.deepEqual(outfit.slice(0, 3), ["Green Henley", "Blue Jeans", "LV Timbs"]);
  for (const name of casualPieces) assert.ok(!outfit.includes(name), `${name} is not part of a more formal outfit`);
});

test("with dressier pieces in the closet, formal means the oxford, chinos, and loafers", () => {
  const outfit = names(built(fuller, "something dressier for dinner"));
  for (const name of ["White Oxford Shirt", "Khaki Chinos", "Brown Loafers"]) assert.ok(outfit.includes(name), `${name} missing from ${outfit.join(", ")}`);
  assert.ok(!outfit.includes("Black Skully"), "a skully never tops off a dressy outfit");
});

test("the words people use for formal are understood", () => {
  for (const message of ["something dressier", "make it classier", "I want to dress up tonight", "a fancy outfit", "outfit for a wedding", "less casual please"]) {
    assert.equal(readOutfitIntent(message).occasion, "formal", message);
  }
  assert.equal(readOutfitIntent("business casual for the office").occasion, "work");
  assert.equal(readOutfitIntent("something less formal").occasion, "casual");
});

test("a casual request stays casual, and the gym gets gym clothes", () => {
  const casual = names(built(fuller, "casual weekend fit"));
  assert.ok(!casual.includes("Brown Loafers") && !casual.includes("White Oxford Shirt"), casual.join(", "));
  const gym = names(built(fuller, "outfit for the gym"));
  for (const name of ["Grey Hoodie", "Black Joggers", "Running Shoes"]) assert.ok(gym.includes(name), `${name} missing from ${gym.join(", ")}`);
});

test("a set for an occasion stops when the closet runs out of pieces that suit it", () => {
  const set = rankOutfitSet(closet, "3 formal outfits", { count: 3 });
  assert.equal(set.length, 1, "one honest outfit, not two more built from graphic tees and jorts");
  assert.deepEqual(names(set[0].outfit.pieces.map((piece) => piece.item)).slice(0, 3), ["Green Henley", "Blue Jeans", "LV Timbs"]);
  assert.match(read("app/api/agents/consumer/route.ts"), /ran out of unused pieces\$\{turnIntent\.occasion \? ` that suit \$\{turnIntent\.occasion\}` : ""\}/);
});

test("without an occasion the builder is unchanged: rotation leads", () => {
  const outfit = built(closet, "build me an outfit");
  assert.ok(outfit.some((item) => item.category === "top") && outfit.some((item) => item.category === "bottom") && outfit.some((item) => item.category === "shoe"));
});

test("REGRESSION: the fallback planner makes the outfit on screen more formal, not the same", () => {
  const onScreen = { itemIds: ["stussy", "ripped", "ow", "skully"], intent: readOutfitIntent("casual outfit") };
  const plan = planHangerTurn({ wardrobe: closet, message: "I need a more formal outfit any ideas", activeOutfit: onScreen, pendingRequest: null });
  const outfit = names(rankOutfit(closet, plan.effectiveMessage, {
    intentOverride: plan.intent, maxPieces: plan.maxPieces, requiredItemIds: plan.requiredItemIds,
    excludedItemIds: plan.excludedItemIds, rotatePriorSuggestions: plan.rotatePriorSuggestions,
  }).pieces.map((piece) => piece.item));
  assert.equal(plan.intent.occasion, "formal");
  assert.ok(outfit.includes("Green Henley") && outfit.includes("LV Timbs"), outfit.join(", "));
  assert.ok(!outfit.includes("Stussy") && !outfit.includes("Black Skully"), outfit.join(", "));
});

const agentInput = (message: string, overrides: Partial<AgentInput> = {}): AgentInput => ({
  message, history: [], wardrobe: closet, forecast: null, activeOutfit: [], remembered: "", rankingBase: {},
  loadTrends: async () => null, today: new Date("2026-10-04T15:00:00Z"), ...overrides,
});

test("the agent's outfit builder answers 'more formal' with the formal pieces", async () => {
  const script: AgentConverse = async ({ messages }) => messages.length === 1
    ? { content: [{ toolUse: { toolUseId: "t1", name: "build_outfits", input: { request: "a more formal outfit" } } }] }
    : { content: [{ text: "Your Green Henley with Blue Jeans and the LV Timbs is the dressiest you can go right now." }] };
  const result = await runHangerAgent(agentInput("I need a more formal outfit any ideas"), script);
  assert.ok(result);
  assert.deepEqual(names(result.outfits[0]).slice(0, 3), ["Green Henley", "Blue Jeans", "LV Timbs"]);
  assert.equal(result.intent?.occasion, "formal");
});

// REGRESSION: the first live run fell back with nothing on screen saying why.
test("REGRESSION: a failed agent turn says which error it was", async () => {
  const failures: AgentFailure[] = [];
  const rejected = Object.assign(new Error("Model produced invalid sequence as part of ToolUse."), { name: "ValidationException" });
  const result = await runHangerAgent(agentInput("more formal please", { onFallback: (failure) => failures.push(failure) }), async () => { throw rejected; });
  assert.equal(result, null);
  assert.equal(failures[0].kind, "model-error");
  assert.equal(failures[0].errorName, "ValidationException");
  assert.equal(describeAgentFailure(failures[0]), "the model returned an error (ValidationException)");
  assert.equal(plainReplyWorthTrying(failures[0]), true, "a fast rejection of tool use leaves time for the plain model reply");

  const slow: AgentFailure[] = [];
  const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
  await runHangerAgent(agentInput("more formal please", { onFallback: (failure) => slow.push(failure) }), async () => { throw timeout; });
  assert.equal(slow[0].kind, "out-of-time");
  assert.equal(plainReplyWorthTrying(slow[0]), false, "a slow provider is never asked twice");
  assert.equal(plainReplyWorthTrying({ kind: "model-error", errorName: "ValidationException", elapsedMs: 12_000 }), false);
});

test("the reply and the chat panel carry the reason", () => {
  const route = read("app/api/agents/consumer/route.ts");
  assert.match(route, /onFallback: \(failure\) => \{ agentOutcome\.failure = failure; \}/);
  assert.match(route, /degradedReason: describeAgentFailure\(agentOutcome\.failure\)/);
  assert.match(read("components/agent-panels.tsx"), /Written without Hanger&rsquo;s wardrobe tools this turn — \{reply\.degradedReason\}/);
});

test("the live model call throws its error instead of hiding it", () => {
  const agent = read("lib/hanger-agent.ts");
  assert.match(agent, /if \(!mayTryAnotherHangerModel\(error\)\) throw error;/);
  assert.match(agent, /if \(lastError\) throw lastError;/);
  assert.match(agent, /inferenceConfig: \{ maxTokens: 900, temperature: 0\.1 \}/);
});

// Nova's tool-use validator accepts plain JSON Schema; every tool now has at least one property and
// none relies on enum, minimum, or maximum, which the server checks itself.
test("tool schemas use only plain JSON Schema", () => {
  for (const tool of AGENT_TOOLS) {
    const schema = tool.toolSpec?.inputSchema?.json as { type: string; properties: Record<string, Record<string, unknown>> };
    assert.equal(schema.type, "object");
    assert.ok(Object.keys(schema.properties).length > 0, `${tool.toolSpec?.name} has no properties`);
    for (const property of Object.values(schema.properties)) {
      for (const keyword of ["enum", "minimum", "maximum"]) assert.ok(!(keyword in property), `${tool.toolSpec?.name} uses ${keyword}`);
    }
  }
});

test("the agent sees each piece's formality, in the index and in search", async () => {
  const script: AgentConverse = async ({ system, messages }) => {
    assert.match(system, /- Stussy · top ·\s+· casual · worn 0×/);
    assert.match(system, /- Green Henley · top ·\s+· smart casual · worn 6×/);
    return messages.length === 1
      ? { content: [{ toolUse: { toolUseId: "s1", name: "search_wardrobe", input: { text: "henley" } } }] }
      : { content: [{ text: "Yes — the Green Henley." }] };
  };
  const seen: string[] = [];
  const recording: AgentConverse = async (request) => {
    const last = request.messages.at(-1)?.content?.[0];
    if (last && "toolResult" in last && last.toolResult) seen.push(String(last.toolResult.content?.[0] && "text" in last.toolResult.content[0] ? last.toolResult.content[0].text : ""));
    return script(request);
  };
  await runHangerAgent(agentInput("do I have a henley?"), recording);
  assert.match(seen[0], /"formality":"smart casual"/);
});
