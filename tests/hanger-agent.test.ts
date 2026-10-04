import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGENT_DEADLINE_MS, MAX_AGENT_ROUNDS, agentSystemPrompt, bedrockAgentConverse, resolvePieceName, runHangerAgent, searchWardrobe, stripThinking, summarizeCommunityTrends,
  type AgentConverse, type AgentInput, type AgentModelResponse,
} from "../lib/hanger-agent.ts";
import type { Forecast } from "../lib/weather.ts";
import type { OutfitPost } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const make = (id: string, name: string, category: string, subtype: string, color: string): WardrobeItem => ({
  id, name, category, subtype, color, pattern: "solid", material: "cotton", style: ["casual"], season: "all-season",
  wearCount: 2, lastWornDays: 10, source: "ai-confirmed", art: "photo",
} as WardrobeItem);

// The closet from the reported conversation.
const wardrobe = [
  make("stussy", "Stussy", "top", "t-shirt", "navy"),
  make("navy", "Navy T Shirt", "top", "t-shirt", "navy"),
  make("henley", "Green Henley", "top", "casual-shirt", "green"),
  make("skel", "Skeleton Long Sleeve", "top", "long-sleeve", "black"),
  make("jeans", "Blue Jeans", "bottom", "jeans", "blue"),
  make("ripped", "Ripped Jeans", "bottom", "jeans", "light blue"),
  make("jorts", "Lugz Jorts", "bottom", "shorts", "black"),
  make("j4", "Jordan 4 Wet Concretes", "shoe", "sneakers", "grey"),
  make("ow", "Off White Air Jordans", "shoe", "sneakers", "white"),
  make("timbs", "LV Timbs", "shoe", "boots", "wheat"),
];

const forecast: Forecast = {
  place: "Washington D.C.", now: { tempF: 61, tempC: 16, description: "overcast" },
  today: { date: "2026-10-04", description: "rain", highF: 66, lowF: 58, highC: 19, lowC: 14, precipitationChance: 60, windMph: 9 },
  tomorrow: null, outfitWeather: "wet", summary: "Today in Washington D.C.: rain, 58–66°F (14–19°C), 60% chance of rain.",
};

const input = (message: string, overrides: Partial<AgentInput> = {}): AgentInput => ({
  message, history: [], wardrobe, forecast: null, activeOutfit: [], remembered: "", rankingBase: {},
  loadTrends: async () => null, today: new Date("2026-10-04T15:00:00Z"), ...overrides,
});

const say = (text: string): AgentModelResponse => ({ content: [{ text }], stopReason: "end_turn" });
const callTool = (name: string, args: Record<string, unknown>, id = `t-${name}`): AgentModelResponse => ({ content: [{ toolUse: { toolUseId: id, name, input: args as never } }], stopReason: "tool_use" });

/** A scripted model: returns each response in turn and records what it was sent. */
function scripted(...responses: AgentModelResponse[]) {
  const seen: Parameters<AgentConverse>[0][] = [];
  const call: AgentConverse = async (request) => { seen.push(structuredClone(request)); return responses[Math.min(seen.length - 1, responses.length - 1)]; };
  return { call, seen };
}
const lastToolResult = (request: Parameters<AgentConverse>[0]) => {
  const block = request.messages.at(-1)!.content!.find((entry) => entry.toolResult)!;
  return JSON.parse((block.toolResult!.content![0] as { text: string }).text);
};

// REGRESSION: "which colours go better together" was routed by keyword rules to outfit-building and
// answered with three invented outfits. The agent reads the question first and simply answers it.
test("REGRESSION: a styling question is answered, not turned into outfits", async () => {
  const answer = "Green, light blue and orange is the stronger trio — the light blue cools the orange so it reads fresh. Black with green and orange goes heavier and more streetwear.";
  const { call } = scripted(say(answer));
  const result = await runHangerAgent(input("Hey hanger which colors go better together green light blue and orange or green light black and orange"), call);
  assert.equal(result?.message, answer);
  assert.deepEqual(result?.outfits, [], "no outfit was built, so none is shown");
  assert.deepEqual(result?.toolsUsed, []);
});

test("asked for three outfits, the agent builds them from owned pieces and the cards show all three", async () => {
  const { call, seen } = scripted(callTool("build_outfits", { request: "weekend outfits", count: 3 }), say("Three easy weekend looks — the second leans sportier."));
  const result = await runHangerAgent(input("Can you make me 3 outfits"), call);
  assert.equal(result?.outfits.length, 3);
  for (const outfit of result!.outfits) for (const piece of outfit) assert.ok(wardrobe.includes(piece), "every piece is owned");
  assert.equal(result?.offered.length, new Set(result!.outfits.flat().map((piece) => piece.id)).size, "every offered piece is remembered");
  const toolResult = lastToolResult(seen[1]);
  assert.equal(toolResult.outfits.length, 3, "the model is told what was built");
  assert.match(toolResult.shown, /cards with photos/);
});

// REGRESSION: Hanger said green was not in the wardrobe, then built an outfit around the Green
// Henley. With a search tool it looks instead of guessing.
test("REGRESSION: 'do I own anything green' is looked up, not guessed", async () => {
  const { call, seen } = scripted(callTool("search_wardrobe", { color: "green" }), say("Yes — your Green Henley."));
  await runHangerAgent(input("do I have anything green"), call);
  const found = lastToolResult(seen[1]);
  assert.equal(found.count, 1);
  assert.equal(found.pieces[0].name, "Green Henley");
  assert.equal(searchWardrobe({ category: "shoe", text: "timbs" }, wardrobe).pieces[0].name, "LV Timbs");
  assert.equal(searchWardrobe({ color: "purple" }, wardrobe).count, 0);
});

// REGRESSION: "will the Henley with Timbs look better with ripped or blue jeans" got "either". The
// agent can build both and pick; a named piece the person does not own is reported, not invented.
test("REGRESSION: a comparison builds around the named pieces, and an unowned one is reported", async () => {
  const { call, seen } = scripted(
    callTool("build_outfits", { request: "casual", include: ["green henley", "LV Timbs", "Ripped Jeans", "Red Velvet Blazer"] }),
    say("Ripped Jeans — they push the Henley and Timbs toward rugged workwear; the Blue Jeans are the tidier call for dinner."),
  );
  const result = await runHangerAgent(input("will the green Henley lv timbs and ripped jeans or the green Henley lv timbs and blue jeans look better"), call);
  const ids = result!.outfits[0].map((piece) => piece.id);
  for (const id of ["henley", "timbs", "ripped"]) assert.ok(ids.includes(id), `${id} is in the outfit`);
  assert.deepEqual(result?.notFound, ["Red Velvet Blazer"]);
  assert.deepEqual(lastToolResult(seen[1]).notOwned, ["Red Velvet Blazer"]);
  assert.equal(resolvePieceName("timbs", wardrobe)?.id, "timbs");
  assert.equal(resolvePieceName("x", wardrobe), null);
});

test("an outfit list the builder never made is corrected once, then refused", async () => {
  const invented = "Here are 3 outfits for you:\n1. Stussy + Blue Jeans + LV Timbs";
  const corrected = scripted(say(invented), say("Green and light blue with orange is the better trio."));
  const fixed = await runHangerAgent(input("which colours go together"), corrected.call);
  assert.equal(fixed?.message, "Green and light blue with orange is the better trio.");
  assert.match(String(corrected.seen[1].messages.at(-1)?.content?.[0]?.text), /Call build_outfits/);

  const stubborn = scripted(say(invented), say(invented));
  assert.equal(await runHangerAgent(input("which colours go together"), stubborn.call), null, "twice invented: fall back to the grounded reply");
});

test("weather is a real forecast or nothing", async () => {
  const withForecast = scripted(callTool("get_weather", {}), say("Rain today — the LV Timbs, not the white Jordans."));
  await runHangerAgent(input("what should I wear today", { forecast }), withForecast.call);
  assert.match(lastToolResult(withForecast.seen[1]).summary, /Washington D\.C\.: rain/);

  const without = scripted(callTool("get_weather", {}), say("I can't see your weather yet."));
  await runHangerAgent(input("what should I wear today"), without.call);
  const answer = lastToolResult(without.seen[1]);
  assert.equal(answer.available, false);
  assert.match(answer.howToEnable, /home city in Settings/);
});

test("the forecast dresses an outfit only when the person did not say the weather", async () => {
  const { call } = scripted(callTool("build_outfits", { request: "something for tonight" }), say("Done."));
  const result = await runHangerAgent(input("something for tonight", { forecast }), call);
  assert.equal(result?.intent?.weather, "wet");
  const stated = scripted(callTool("build_outfits", { request: "something for a hot night out" }), say("Done."));
  assert.equal((await runHangerAgent(input("something for a hot night out", { forecast }), stated.call))?.intent?.weather, "warm", "their words win");
});

test("a turn is bounded in rounds and in time, and either limit falls back", async () => {
  let calls = 0;
  const looping: AgentConverse = async () => { calls += 1; return callTool("search_wardrobe", { color: "blue" }); };
  assert.equal(await runHangerAgent(input("hi"), looping), null);
  assert.equal(calls, MAX_AGENT_ROUNDS);

  let now = 0;
  const slow: AgentConverse = async () => { now += AGENT_DEADLINE_MS; return callTool("search_wardrobe", {}); };
  assert.equal(await runHangerAgent(input("hi"), slow, () => now), null, "out of time: the grounded reply answers");

  assert.equal(await runHangerAgent(input("hi"), async () => null), null, "no model: fall back");
  assert.equal(await runHangerAgent(input("hi"), async () => { throw new Error("boom"); }), null);
});

// Nova reasons aloud in <thinking> tags beside tool calls and sometimes before an answer.
test("the model's private reasoning is never shown to the person", async () => {
  assert.equal(stripThinking("<thinking>They want a verdict.</thinking>Ripped Jeans — more rugged."), "Ripped Jeans — more rugged.");
  assert.equal(stripThinking("<thinking>unclosed Ripped Jeans"), "unclosed Ripped Jeans", "a stray tag is removed, not the answer");
  const { call } = scripted(say("<thinking>Answer the colour question directly.</thinking>Green, light blue and orange."));
  assert.equal((await runHangerAgent(input("which colours"), call))?.message, "Green, light blue and orange.");
});

test("an unknown tool is answered with an error, not a crash", async () => {
  const { call, seen } = scripted(callTool("delete_wardrobe", {}), say("Let me try that differently."));
  const result = await runHangerAgent(input("hi"), call);
  assert.equal(result?.message, "Let me try that differently.");
  assert.match(lastToolResult(seen[1]).error, /No tool called delete_wardrobe/);
});

test("trends are anonymous totals over public looks", async () => {
  const posts = [
    { id: "p1", handle: "@someone", likes: 3, garments: [{ category: "top", subtype: "t-shirt", color: "Navy", style: ["casual"] }, { category: "shoe", subtype: "sneakers", color: "white", style: ["sporty"] }] },
    { id: "p2", handle: "@other", likes: 1, garments: [{ category: "top", subtype: "t-shirt", color: "navy", style: ["casual"] }] },
  ] as unknown as OutfitPost[];
  const trends = summarizeCommunityTrends(posts);
  assert.equal(trends.postCount, 2);
  assert.deepEqual(trends.colors.slice(0, 1), ["navy"]);
  assert.deepEqual(trends.pieces.slice(0, 1), ["t shirt"]);
  assert.doesNotMatch(JSON.stringify(trends), /someone|other|p1|p2/, "no handle or post id leaves the summary");

  const { call, seen } = scripted(callTool("get_trends", {}), say("Navy tees are everywhere on Racked right now."));
  await runHangerAgent(input("what's trending", { loadTrends: async () => trends }), call);
  assert.match(lastToolResult(seen[1]).basis, /2 most recent public looks/);
});

test("the stylist's standing instructions", () => {
  const prompt = agentSystemPrompt({ wardrobe, forecast: null, activeOutfit: [], remembered: "", today: new Date("2026-10-04T15:00:00Z") });
  assert.match(prompt, /Outfits come only from build_outfits/);
  assert.match(prompt, /Never write an outfit list yourself/);
  assert.match(prompt, /pick one and say why; never answer 'either'/);
  assert.match(prompt, /Never state or guess the weather without get_weather/);
  assert.match(prompt, /- Green Henley · top · green · smart casual · worn 2×/, "the wardrobe is indexed one line per piece, with its formality");
  assert.match(prompt, /formality ladder: athletic or lounge, casual, smart casual, business, formal/);
  assert.match(prompt, /no location set/);
});

test("without a configured provider the agent never runs", async () => {
  const before = process.env.AI_PROVIDER;
  delete process.env.AI_PROVIDER;
  assert.equal(await bedrockAgentConverse({ system: "", messages: [], tools: [], timeoutMs: 1_000 }), null);
  if (before !== undefined) process.env.AI_PROVIDER = before;
});

// The plain model reply is tried only after a fast rejection, never after a slow or throttled call.
test("the route asks the agent first and falls back without a second model wait", () => {
  const route = read("app/api/agents/consumer/route.ts");
  assert.ok(route.indexOf("await runHangerAgent(") < route.indexOf("const plan = planHangerTurn("), "the agent runs before the keyword rules");
  assert.match(route, /allowModel: !agentAttempted \|\| plainReplyWorthTrying\(agentOutcome\.failure\),/, "a slow agent failure is answered from the wardrobe at once");
  assert.match(route, /outfitCards\(agent\.outfits, agentActions\)/);
  assert.match(route, /rememberSuggestedItemIds\(nextState, agent\.offered\)/);
  assert.match(read("lib/hanger-conversation.ts"), /input\.allowModel === false \? null : await converse\(/);
});

// REGRESSION: a set's buttons are "save-outfit-2", "record-outfit-3". The panel only recognised the
// exact names, so tapping Save or Record under any outfit of a set did nothing at all.
test("REGRESSION: every outfit card in a set can be saved and recorded", () => {
  const panel = read("components/agent-panels.tsx");
  assert.match(panel, /const kind = action\.type\.startsWith\("save-outfit"\) \? "save-outfit" : action\.type\.startsWith\("record-outfit"\) \? "record-outfit" : action\.type;/);
  assert.match(panel, /if \(kind === "record-outfit"\)/);
  assert.match(panel, /\} else if \(kind === "save-outfit"\) \{/);
});
