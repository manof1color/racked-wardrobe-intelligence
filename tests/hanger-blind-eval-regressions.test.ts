/**
 * Regressions from the blind evaluation of 2026-11-10 (docs/hanger-evaluation-diagnosis.md).
 *
 * Each defect is reproduced with a scripted model — the tool calls are fixed, so the test is
 * repeatable and costs nothing — and run through runConsumerHangerTurn, the turn the chat route
 * runs: the agent, the grounded fallback, the outfit card, the Save action and the conversation
 * that would be stored. Beside each fix is a nearby case the fix could have broken.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGENT_TOOLS, completeIntent, runHangerAgent, searchWardrobe, swapCorrection, UNSHOWN_OUTFIT_CORRECTION, type AgentConverse, type AgentInput, type AgentModelResponse } from "../lib/hanger-agent.ts";
import { runConsumerHangerTurn } from "../lib/hanger-consumer-turn.ts";
import { replyDescribesUnshownOutfit } from "../lib/hanger-conversation.ts";
import { buildForecast, conversationShowing, mechanicalChecks, outfitProblems, swapProblems, toWardrobeItem, weatherWord, type EvalCloset, type EvalPiece, type EvalRequest } from "../lib/hanger-evaluation.ts";
import { emptyHangerConversation, readHangerConversation, rememberActiveOutfit } from "../lib/hanger-memory.ts";
import { planHangerTurn } from "../lib/hanger-turn.ts";
import { weatherFit } from "../lib/garment-knowledge.ts";
import { AESTHETIC_KEYS, BRIEF_KEYS, OUTFIT_AESTHETICS, OUTFIT_BRIEFS, aestheticByKey, aestheticFit, briefByKey, briefFit, briefsNamed, readAesthetic, readBrief } from "../lib/occasion-knowledge.ts";
import { STYLE_VOCABULARY, missingFoundation, rankOutfit, readOutfitIntent } from "../lib/outfit-ranking.ts";
import { GARMENT_TAXONOMY } from "../lib/garment-taxonomy.ts";
import { forecastToOutfitWeather } from "../lib/weather.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const closets = new Map(["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => [id, JSON.parse(read(`data/hanger-eval/${id}.json`)) as EvalCloset]));
const requests = new Map((JSON.parse(read("data/hanger-eval/requests.json")) as { requests: EvalRequest[] }).requests.map((request) => [request.id, request]));
interface ReplayCase { id: string; variant?: string; group: string; steps: Array<{ tool: string; args: Record<string, unknown> }>; reply: string; expect?: { absent?: string[]; present?: string[]; why: string } }
const replayCases = (JSON.parse(read("data/hanger-eval/replay-cases.json")) as { cases: ReplayCase[] }).cases;

const say = (text: string): AgentModelResponse => ({ content: [{ text }], stopReason: "end_turn" });
const callTool = (name: string, args: Record<string, unknown>): AgentModelResponse => ({ content: [{ toolUse: { toolUseId: `t-${name}-${Math.random()}`, name, input: args as never } }], stopReason: "tool_use" });
/** A scripted model: each response in turn, the last one repeated, and a record of what it was sent. */
function scripted(...responses: AgentModelResponse[]) {
  const seen: Parameters<AgentConverse>[0][] = [];
  const call: AgentConverse = async (request) => { seen.push(structuredClone(request)); return responses[Math.min(seen.length - 1, responses.length - 1)]; };
  const toolResults = () => seen.flatMap((request) => (request.messages.at(-1)?.content ?? []).flatMap((block) => (block.toolResult ? [JSON.parse((block.toolResult.content![0] as { text: string }).text)] : [])));
  const corrections = () => seen.slice(1).map((request) => (request.messages.at(-1)?.content ?? []).map((block) => block.text ?? "").join("")).filter(Boolean);
  return { call, seen, toolResults, corrections };
}

const quiet = async <T>(run: () => Promise<T>) => { const warn = console.warn; console.warn = () => {}; try { return await run(); } finally { console.warn = warn; } };
const noInspiration = { lookCount: 0, styleHints: [], colors: [], categories: [], subtypes: [], recentLookTitles: [] };

/** One turn of the shared route logic on a synthetic closet, with whatever is on screen stored first. */
async function turn(pieces: EvalPiece[], message: string, model: AgentConverse, options: { onScreen?: string[]; forecast?: EvalRequest["forecast"]; today?: string; agentEnabled?: boolean } = {}) {
  const today = new Date(`${options.today ?? "2026-04-14"}T12:00:00Z`);
  const onScreen = (options.onScreen ?? []).map((id) => pieces.find((piece) => piece.id === id)!);
  const result = await quiet(() => runConsumerHangerTurn({
    message, wardrobe: pieces.map(toWardrobeItem), outfits: [], inspiration: noInspiration, stored: conversationShowing(onScreen, today),
    forecast: options.forecast ? buildForecast(options.forecast, options.today ?? "2026-04-14") : null,
    agentEnabled: options.agentEnabled ?? true, aiPaused: false, today, loadTrends: async () => null, agentCall: model, plainCall: async () => null,
  }));
  const card = (result.reply.selection ?? []).map((piece) => pieces.find((entry) => entry.id === piece.id)!);
  const cards = result.reply.outfits?.length ? result.reply.outfits.map((entry) => entry.pieces.map((piece) => piece.name)) : card.length ? [card.map((piece) => piece.name)] : [];
  return { ...result, card, cards, names: card.map((piece) => piece.name), byAgent: result.reply.provider === "amazon-bedrock" };
}
const replay = (entry: ReplayCase) => {
  const request = requests.get(entry.id)!;
  const model = scripted(...entry.steps.map((step) => callTool(step.tool, step.args)), say(entry.reply));
  return turn(closets.get(request.closet)!.pieces, request.text, model.call, { onScreen: request.activeOutfit, forecast: request.forecast, today: request.today }).then((result) => ({ ...result, request, model }));
};
/** The card, the Save action and the stored active outfit are one list of ids, or it is a bug. */
function assertOneSelection(result: Awaited<ReturnType<typeof turn>>, label: string) {
  const cardIds = result.card.map((piece) => piece.id);
  const saved = String(result.reply.actions.find((action) => action.type === "save-outfit")?.payload?.itemIds ?? "").split(",").filter(Boolean);
  assert.deepEqual(saved, cardIds, `${label}: Save stores the pieces on the card`);
  assert.deepEqual(result.nextState.activeOutfit?.itemIds, cardIds, `${label}: "this outfit" in the next message means the card`);
}

// ── The replay: every lost request that was reproduced, through the route's turn ────────────────

test("REGRESSION: the replayed losses each come back as a complete outfit, an exact swap, and one selection", async () => {
  for (const entry of replayCases) {
    const label = `${entry.id}${entry.variant ? ` (${entry.variant})` : ""}`;
    const result = await replay(entry);
    assert.ok(result.card.length, `${label}: an outfit is offered`);
    if (result.request.kind === "swap") {
      const before = result.request.activeOutfit!.map((id) => closets.get(result.request.closet)!.pieces.find((piece) => piece.id === id)!);
      assert.deepEqual(swapProblems(before, result.card, result.request.swapCategory!), [], `${label}: only the ${result.request.swapCategory} changed — ${result.names.join(", ")}`);
    } else {
      assert.deepEqual(outfitProblems(result.card), [], `${label}: ${result.names.join(", ")}`);
    }
    assertOneSelection(result, label);
    for (const id of entry.expect?.absent ?? []) assert.ok(!result.card.some((piece) => piece.id === id), `${label}: ${entry.expect!.why} — ${result.names.join(", ")}`);
    for (const id of entry.expect?.present ?? []) assert.ok(result.card.some((piece) => piece.id === id), `${label}: ${entry.expect!.why} — ${result.names.join(", ")}`);
    // Every outfit the builder handed the model is one the person can see.
    const shown = new Set(result.cards.map((names) => [...names].sort().join("|")));
    if (result.byAgent) for (const built of result.model.toolResults().flatMap((entry) => (Array.isArray(entry.outfits) ? entry.outfits : []))) {
      assert.ok(shown.has(built.pieces.map((piece: { name: string }) => piece.name).sort().join("|")), `${label}: an outfit the model was given is on a card`);
    }
  }
});

test("REGRESSION: a client presentation, dinner with a partner's parents, a black-tie-optional wedding and casual Friday lead with four different outfits", async () => {
  const leads = new Map<string, string[]>();
  for (const entry of replayCases.filter((item) => ["a-01", "a-02", "a-03", "a-04"].includes(item.id))) leads.set(entry.id, (await replay(entry)).names);
  assert.equal(new Set([...leads.values()].map((names) => [...names].sort().join("|"))).size, 4, JSON.stringify([...leads]));
  const level = (id: string) => leads.get(id)!;
  // Not only different: ordered the way the occasions are. The wedding is the most dressed, casual Friday the least.
  assert.ok(level("a-03").includes("Black oxfords") && level("a-03").includes("Charcoal dress trousers"), `wedding: ${level("a-03").join(", ")}`);
  assert.ok(level("a-04").includes("White leather sneakers") && !level("a-04").includes("Navy blazer"), `casual Friday: ${level("a-04").join(", ")}`);
  assert.ok(!level("a-02").includes("Navy blazer") && !level("a-02").includes("Black oxfords"), `smart but not stiff: ${level("a-02").join(", ")}`);
});

// ── Reading the request ─────────────────────────────────────────────────────────────────────────

test("a request is read for its dress code or activity: the most specific phrase, then the first mentioned", () => {
  const key = (text: string) => readBrief(text)?.brief.key ?? null;
  assert.equal(key("I'm a guest at an afternoon wedding, black tie optional."), "black-tie-optional", "a stated dress code outranks the event");
  assert.equal(key("Black tie gala on Saturday"), "black-tie");
  assert.equal(key("It's casual Friday at the office. Something comfortable."), "casual-friday", "not simply 'office'");
  assert.equal(key("Dinner with my partner's parents tonight. Smart but not stiff."), "smart-casual");
  assert.equal(key("Gym first, then grabbing coffee with a friend."), "gym", "the first thing they are doing leads");
  assert.equal(key("Coffee with a friend, then the gym."), "brunch");
  assert.equal(key("family dinner on Sunday"), "meet-the-family", "words inside a longer match belong to it");
  assert.equal(key("I'm heading out for a long walk."), "walk");
  assert.equal(key("What should I wear for a day of sightseeing?"), "walk");
  assert.equal(key("What should I wear today?"), null, "no occasion named, none invented");
  // Everyday turns of phrase are not occasions.
  assert.equal(key("Running errands all afternoon."), "walk", "errands, not a run");
  assert.equal(key("would this work with jeans"), null);
  assert.equal(key("meeting friends for coffee"), "brunch", "not a meeting");
  assert.equal(key("not a wedding, just a party"), "night-out", "a negated occasion is not the occasion");
  // A word like casual or fancy moves an event half a step; it does not replace it.
  assert.deepEqual([readBrief("First date at a casual dinner spot tonight.")?.brief.key, readBrief("First date at a casual dinner spot tonight.")?.shift], ["date", -0.5]);
  assert.deepEqual([readBrief("I'm a guest at an evening wedding, formal.")?.brief.key, readBrief("I'm a guest at an evening wedding, formal.")?.shift], ["wedding", 0.5]);
  assert.equal(readBrief("Interview at a creative agency tomorrow.")?.shift, -0.5);
  assert.deepEqual(briefsNamed("A morning run, then a quick breakfast."), ["run", "brunch"]);
});

test("the old six occasions still read exactly as they did, and new activities get a family", () => {
  for (const [text, occasion] of [["formal dinner", "formal"], ["something for the office", "work"], ["date night", "evening"], ["gym session", "active"], ["airport outfit", "travel"], ["casual weekend fit", "casual"], ["something less formal", "casual"], ["less casual please", "formal"]] as const) {
    assert.equal(readOutfitIntent(text).occasion, occasion, text);
  }
  assert.deepEqual([readOutfitIntent("Beach cookout this afternoon.").occasion, readOutfitIntent("Beach cookout this afternoon.").brief], ["casual", "beach"]);
  assert.equal(readOutfitIntent("something less formal").brief, "casual", "a direction names the general brief it points at");
});

test("the curated knowledge is well formed: known garment types, bands inside the ladder, no key twice", () => {
  const subtypes = new Set(Object.values(GARMENT_TAXONOMY).flat() as string[]);
  assert.equal(new Set(BRIEF_KEYS).size, BRIEF_KEYS.length);
  assert.equal(new Set(AESTHETIC_KEYS).size, AESTHETIC_KEYS.length);
  for (const brief of OUTFIT_BRIEFS) {
    assert.ok(brief.min >= 1 && brief.max <= 5 && brief.min <= brief.target && brief.target <= brief.max, `${brief.key}: band`);
    assert.ok(brief.phrases.length > 0 && brief.phrases.every((phrase) => phrase === phrase.toLowerCase()), `${brief.key}: phrases`);
    for (const needs of Object.values(brief.needs ?? {})) for (const subtype of [...(needs.prefer ?? []), ...(needs.avoid ?? [])]) assert.ok(subtypes.has(subtype), `${brief.key}: ${subtype} is not a garment type`);
    for (const needs of Object.values(brief.needs ?? {})) assert.deepEqual((needs.prefer ?? []).filter((subtype) => needs.avoid?.includes(subtype)), [], `${brief.key}: preferred and ruled out at once`);
  }
  for (const look of OUTFIT_AESTHETICS) {
    for (const subtype of [...look.subtypes, ...(look.avoid ?? [])]) assert.ok(subtypes.has(subtype), `${look.key}: ${subtype} is not a garment type`);
    assert.ok(look.tags.some((tag) => STYLE_VOCABULARY.includes(tag)), `${look.key}: carries a style the ranker stores`);
  }
  // It describes clothes and occasions, never a person.
  assert.doesNotMatch(read("lib/occasion-knowledge.ts").split("*/")[1].replace(/phrases: \[[^\]]*\]/g, ""), /\b(?:men|women|male|female|slim|curvy|plus[- ]size|petite|skinny body|age|income)\b/i);
});

// ── Occasion matching on a closet the evaluation never saw ──────────────────────────────────────

const piece = (id: string, name: string, category: string, subtype: string, extra: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id, name, category, subtype, color: "", pattern: "solid", material: "cotton", style: ["casual"], season: "all-season", wearCount: 5, lastWornDays: 10, source: "manual", art: "ivory", ...extra,
} as WardrobeItem);
// One of most things, with rotation deliberately favouring the wrong piece for most requests:
// the gown and the hiking boots have barely been worn.
const mixed = [
  piece("tee", "Plain white tee", "top", "t-shirt", { wearCount: 20, lastWornDays: 1 }),
  piece("gymtee", "Training tee", "top", "t-shirt", { style: ["athletic", "sporty"], wearCount: 25, lastWornDays: 1 }),
  piece("shirt", "Blue dress shirt", "top", "dress-shirt", { style: ["classic", "tailored"], wearCount: 18, lastWornDays: 2 }),
  piece("knit", "Grey lambswool sweater", "top", "sweater", { style: ["classic"], season: "winter", material: "wool" }),
  piece("hoodie", "Black hoodie", "top", "hoodie", { wearCount: 1, lastWornDays: 200 }),
  piece("jeans", "Blue jeans", "bottom", "jeans", { wearCount: 22, lastWornDays: 1 }),
  piece("suit", "Charcoal suit trousers", "bottom", "dress-pants", { style: ["tailored"], wearCount: 15, lastWornDays: 3 }),
  piece("shorts", "Running shorts", "bottom", "shorts", { style: ["athletic", "sporty"], season: "summer", wearCount: 19, lastWornDays: 2 }),
  piece("chinos", "Stone chinos", "bottom", "chinos", { style: ["classic"] }),
  piece("gown", "Burgundy evening gown", "dress", "formal-dress", { style: ["elegant"], wearCount: 0, lastWornDays: 999 }),
  piece("blazer", "Charcoal suit jacket", "outerwear", "suit-jacket", { style: ["tailored"], wearCount: 12, lastWornDays: 4 }),
  piece("shell", "Packable rain shell", "outerwear", "rain-jacket", { wearCount: 14, lastWornDays: 5 }),
  piece("puffer", "Down puffer", "outerwear", "puffer-jacket", { season: "winter", wearCount: 2, lastWornDays: 90 }),
  piece("runners", "Road running shoes", "shoe", "running-shoes", { style: ["athletic", "sporty"], wearCount: 30, lastWornDays: 1 }),
  piece("hikers", "Leather hiking boots", "shoe", "hiking-boots", { style: ["utility"], season: "fall", wearCount: 0, lastWornDays: 999 }),
  piece("oxfords", "Black oxfords", "shoe", "oxfords", { style: ["tailored"], wearCount: 16, lastWornDays: 3 }),
  piece("sneakers", "White sneakers", "shoe", "sneakers", { wearCount: 26, lastWornDays: 1 }),
  piece("sandals", "Leather sandals", "shoe", "sandals", { season: "summer", wearCount: 1, lastWornDays: 300 }),
  piece("heels", "Black heels", "shoe", "heels", { style: ["elegant"], wearCount: 1, lastWornDays: 400 }),
  piece("briefcase", "Leather briefcase", "bag", "briefcase", { wearCount: 1, lastWornDays: 100 }),
];
const dressed = (message: string, weather?: "cold" | "warm" | "wet") => {
  const intent = readOutfitIntent(message);
  return rankOutfit(mixed, message, { intentOverride: weather ? { ...intent, weather } : intent }).pieces.map((entry) => entry.item.id);
};

test("athletic, casual, business and formal requests are each dressed for what they are, whatever was worn least", () => {
  const run = dressed("Quick 5k before breakfast");
  assert.ok(run.includes("runners") && run.includes("shorts") && run.includes("gymtee"), `a run: ${run}`);
  assert.ok(!run.includes("hikers") && !run.includes("gown") && !run.includes("briefcase"), `a run: ${run}`);

  const hike = dressed("Hiking with friends on Saturday");
  assert.ok(hike.includes("hikers") && !hike.includes("oxfords") && !hike.includes("heels"), `a hike: ${hike}`);

  const lazy = dressed("Lazy Sunday, nothing fancy");
  assert.ok(!lazy.includes("gown") && !lazy.includes("oxfords") && !lazy.includes("blazer") && !lazy.includes("briefcase"), `a lazy day: ${lazy}`);
  assert.ok(!lazy.includes("suit") && !lazy.includes("heels"), `a lazy day: ${lazy}`);
  const unprompted = dressed("What should I wear today?");
  assert.ok(!unprompted.includes("gown") && !unprompted.includes("briefcase"), `no occasion named, so occasionwear stays in the closet: ${unprompted}`);

  const pitch = dressed("Pitching to investors on Tuesday");
  assert.ok(pitch.includes("shirt") && pitch.includes("suit") && pitch.includes("blazer"), `a pitch: ${pitch}`);
  assert.ok(!pitch.includes("sneakers") && !pitch.includes("hikers") && !pitch.includes("runners"), `a pitch: ${pitch}`);

  const gala = dressed("Charity gala, black tie");
  assert.ok(gala.includes("gown") && gala.includes("heels"), `black tie: ${gala}`);
  assert.equal(new Set([run, hike, lazy, pitch, gala].map((ids) => [...ids].sort().join("|"))).size, 5, "five occasions, five outfits");
});

test("known weather rules a piece out, and weather gear waits for weather", () => {
  const rainyWalk = dressed("A long walk around the city", "wet");
  assert.ok(rainyWalk.includes("shell") && !rainyWalk.includes("sandals") && !rainyWalk.includes("heels"), `rain: ${rainyWalk}`);
  const heat = dressed("Sightseeing all day", "warm");
  assert.ok(!heat.includes("puffer") && !heat.includes("shell") && !heat.includes("blazer") && !heat.includes("knit"), `35 °C: ${heat}`);
  const office = dressed("What should I wear to the office?", "wet");
  assert.ok(office.includes("shell"), `the rain jacket goes to the office too: ${office}`);
  // With no weather known, a coat is not a finishing touch.
  const unknown = dressed("Dinner with friends tonight");
  assert.ok(!unknown.includes("puffer") && !unknown.includes("shell"), `no weather: ${unknown}`);

  assert.equal(weatherFit({ name: "Rain shell", category: "outerwear", subtype: "rain-jacket", season: "all-season", material: "nylon" }, "wet").score, 100);
  assert.ok(weatherFit({ name: "Bomber", category: "outerwear", subtype: "bomber-jacket", season: "fall", material: "nylon" }, "wet").score < 50, "a jacket that gets wet is not rain protection");
  assert.ok(weatherFit({ name: "Camel wool skirt", category: "bottom", subtype: "skirt", season: "winter", material: "wool" }, "warm").score < 40);
  assert.ok(weatherFit({ name: "Button-down shirt", category: "top", subtype: "dress-shirt", season: "all-season", material: "cotton" }, "warm").score >= 50, "'down' in button-down is not a fabric");
  assert.ok(weatherFit({ name: "Canvas sneakers", category: "shoe", subtype: "low-top-sneakers", season: "all-season", material: "canvas" }, "wet").score < 40);
});

test("a named look is matched on what a piece is, not only on its tags", () => {
  assert.equal(readAesthetic("give me a streetwear fit for the weekend")?.key, "streetwear");
  assert.equal(readAesthetic("old money look for brunch")?.key, "quiet-luxury");
  assert.equal(readAesthetic("something dark academia")?.key, "dark-academia");
  assert.equal(readAesthetic("what should I wear today"), null);
  const streetwear = aestheticByKey("streetwear")!, quiet = aestheticByKey("quiet-luxury")!;
  const hoodie = piece("h", "Oversized grey hoodie", "top", "hoodie", { color: "grey", material: "fleece", style: [] });
  const cashmere = piece("c", "Camel cashmere sweater", "top", "sweater", { color: "camel", material: "cashmere", style: [] });
  assert.ok(aestheticFit(hoodie, streetwear).score > aestheticFit(cashmere, streetwear).score, "untagged pieces are still told apart");
  assert.ok(aestheticFit(cashmere, quiet).score > 60 && aestheticFit(hoodie, quiet).score < 20);
  const look = rankOutfit(mixed, "a streetwear outfit").pieces.map((entry) => entry.item.id);
  assert.ok(look.includes("hoodie") && !look.includes("oxfords") && !look.includes("suit") && !look.includes("gown"), `streetwear: ${look}`);
  assert.equal(readOutfitIntent("a streetwear outfit").aesthetic, "streetwear");
});

test("formality decides for a dress code, and the right kind of piece decides for an activity", () => {
  const sneakers = piece("s", "White sneakers", "shoe", "sneakers", { material: "leather" });
  const runners = piece("r", "Road running shoes", "shoe", "running-shoes", { style: ["athletic"], material: "mesh" });
  const heels = piece("h", "Black heels", "shoe", "heels", { style: ["elegant"], material: "leather" });
  assert.ok(briefFit(runners, briefByKey("walk")!).score >= 88, "running shoes suit a long walk whatever their formality");
  assert.ok(briefFit(heels, briefByKey("walk")!).avoided);
  assert.ok(briefFit(sneakers, briefByKey("black-tie-optional")!).avoided);
  // A preferred type never excuses the wrong level of dress for a dress code.
  const skirt = piece("k", "Casual denim skirt", "bottom", "skirt", { material: "denim" });
  assert.ok(briefFit(skirt, briefByKey("black-tie-optional")!).score < 50);
});

// ── Complete outfits ────────────────────────────────────────────────────────────────────────────

const b = closets.get("closet-b")!.pieces, a = closets.get("closet-a")!.pieces, c = closets.get("closet-c")!.pieces, d = closets.get("closet-d")!.pieces;

test("REGRESSION: three jackets suggested by the model cannot cost the outfit its bottoms and shoes", async () => {
  const model = scripted(callTool("build_outfits", { request: "warm and waterproof", count: 1, include: ["Black puffer jacket", "Orange rain shell", "Olive bomber jacket"] }), say("Warm and dry."));
  const result = await turn(b, "I'm heading out for a long walk.", model.call);
  assert.deepEqual(outfitProblems(result.card), [], result.names.join(", "));
  assert.equal(result.card.filter((entry) => entry.category === "outerwear").length, 1, "one jacket, not three");
  const [built] = model.toolResults();
  assert.deepEqual(built.leftOut.sort(), ["Olive bomber jacket", "Orange rain shell"], "the model is told what was left out");
  assert.match(result.reply.evidence.join("\n"), /Left out .*an outfit needs a top, bottoms and shoes/, "and so is the person");
});

test("REGRESSION: a piece count in the model's own words does not shrink the outfit; the person's does", async () => {
  const fromModel = await turn(b, "I'm heading out for a long walk.", scripted(callTool("build_outfits", { request: "long walk, warm, two pieces" }), say("Here.")).call);
  assert.deepEqual(outfitProblems(fromModel.card), [], fromModel.names.join(", "));
  // A legitimate partial request is kept, and the reply's evidence says what is missing and why.
  const fromPerson = await turn(b, "Just two pieces: what top goes with my Black puffer jacket?", scripted(callTool("build_outfits", { request: "top for the puffer" }), say("This one.")).call);
  assert.equal(fromPerson.card.length, 2, fromPerson.names.join(", "));
  assert.ok(fromPerson.names.includes("Black puffer jacket"));
  assert.match(fromPerson.reply.evidence.join("\n"), /the pieces asked for fill this 2-piece outfit/);
});

test("a closet that cannot complete an outfit gets what it can, and is told what is missing", async () => {
  const barefoot = b.filter((entry) => entry.category !== "shoe");
  const model = scripted(callTool("build_outfits", { request: "casual" }), say("Here is what I could do."));
  const result = await turn(barefoot, "Something casual for the weekend.", model.call);
  assert.ok(result.card.some((entry) => entry.category === "top") && result.card.some((entry) => entry.category === "bottom"));
  assert.deepEqual(missingFoundation(result.card), ["shoe"]);
  assert.match(model.toolResults()[0].outfits[0].incomplete, /no shoes in this closet/);
  assert.match(result.reply.evidence.join("\n"), /no shoes in this closet/);
  // And with no model at all, the grounded reply itself says so.
  const grounded = await turn(barefoot, "What should I wear this weekend?", async () => null, { agentEnabled: false });
  assert.match(grounded.reply.message, /no shoes in this closet/);
});

test("REGRESSION: a blouse the model adds to a dress is left out; two tops the person names are both kept", async () => {
  const model = scripted(callTool("build_outfits", { request: "cool evening out", include: ["White linen shirt dress", "Pale blue blouse"] }), say("Here's an outfit."));
  const withDress = await turn(c, "Something for a cool evening out.", model.call);
  assert.deepEqual(outfitProblems(withDress.card), [], withDress.names.join(", "));
  assert.ok(withDress.names.includes("White linen shirt dress") && !withDress.names.includes("Pale blue blouse"));
  const layered = await turn(b, "Build an outfit with my Red plaid flannel shirt and my Cream chunky knit sweater.", scripted(callTool("build_outfits", { request: "layered" }), say("Layered.")).call);
  assert.ok(layered.names.includes("Red plaid flannel shirt") && layered.names.includes("Cream chunky knit sweater"), layered.names.join(", "));
  assert.deepEqual(missingFoundation(layered.card), [], "and it still has bottoms and shoes");
});

// ── Swaps ───────────────────────────────────────────────────────────────────────────────────────

const A08 = ["a-01", "a-06", "a-13", "a-10"];
const before = (pieces: EvalPiece[], ids: string[]) => ids.map((id) => pieces.find((entry) => entry.id === id)!);

test("REGRESSION: 'casual' is what a shoe is like, not a word in its name, and 'shoes' is a category", () => {
  const wardrobe = a.map(toWardrobeItem);
  const casual = searchWardrobe({ category: "shoe", text: "casual" }, wardrobe);
  assert.deepEqual(casual.pieces.map((entry) => entry.name), ["White leather sneakers"]);
  assert.deepEqual(searchWardrobe({ category: "shoes", text: "dressy" }, wardrobe).pieces.map((entry) => entry.name).sort(), ["Black ankle boots", "Black oxfords", "Brown loafers"]);
  assert.equal(searchWardrobe({ text: "casual shoes" }, wardrobe).count, 1, "the category can be named in the text");
  // Nothing matched, but the category is not empty: the model is shown it.
  const none = searchWardrobe({ category: "tops", text: "navy chinos brown loafers" }, wardrobe) as ReturnType<typeof searchWardrobe> & { ownedInCategory?: unknown[]; note?: string };
  assert.equal(none.count, 0);
  assert.equal(none.ownedInCategory?.length, 5);
  assert.match(none.note ?? "", /Choose from those before saying they have none/);
  // Something they really do not own is still reported as not owned.
  assert.equal(searchWardrobe({ text: "tuxedo" }, wardrobe).count, 0);
  assert.equal((searchWardrobe({ text: "tuxedo" }, wardrobe) as { ownedInCategory?: unknown }).ownedInCategory, undefined);
});

test("REGRESSION: a model that searches and gives up is corrected once; if it builds, the agent's swap is exact", async () => {
  const model = scripted(
    callTool("search_wardrobe", { category: "shoe", text: "something comfy" }),
    say("You don't own any casual shoes."),
    callTool("build_outfits", { request: "more casual shoes" }),
    say("Swapped the oxfords for your white sneakers."),
  );
  const result = await turn(a, "Swap the shoes for something more casual.", model.call, { onScreen: A08 });
  assert.ok(result.byAgent);
  assert.deepEqual(swapProblems(before(a, A08), result.card, "shoe"), [], result.names.join(", "));
  assert.ok(result.names.includes("White leather sneakers"));
  assert.match(model.corrections()[0], /They asked you to change the shoes of the outfit on screen, and they own other options: .*White leather sneakers \(casual\)/);
  assert.equal(model.corrections()[0], swapCorrection("shoes", ["Brown loafers (formal)", "White leather sneakers (casual)", "Black ankle boots (business)"]), "the pieces that could take the slot, each with how dressed it is");
  assert.match(model.toolResults().at(-1).changed, /Replaced Black oxfords with White leather sneakers; every other piece is the same\./);
  assertOneSelection(result, "a-08");
});

test("REGRESSION: a model that will not make the swap is overruled, and the wardrobe makes it", async () => {
  const stubborn = scripted(say("You don't own any casual shoes, so consider buying some."));
  const result = await turn(a, "Swap the shoes for something more casual.", stubborn.call, { onScreen: A08 });
  assert.equal(result.byAgent, false);
  assert.deepEqual(swapProblems(before(a, A08), result.card, "shoe"), [], result.names.join(", "));
  assert.match(result.reply.degradedReason ?? "", /did not make the change that was asked for/);
  assert.match(result.reply.evidence.join("\n"), /Changed only the shoe and kept the rest of the outfit/);
  assert.doesNotMatch(result.reply.message, /don't own any casual shoes/, "the false claim never reaches the person");
  assertOneSelection(result, "a-08 stubborn");
});

test("REGRESSION: the person's swap outranks the model's arguments — nothing else moves, nothing is added", async () => {
  // The model tries to change the top, drop the blazer, ask for three options and add a fourth piece.
  const meddling = scripted(callTool("build_outfits", { request: "swap the skirt for pants", count: 3, include: ["Navy striped tee", "Ivory linen blazer", "Denim shorts"], exclude: ["White linen shirt"] }), say("Here it is with pants."));
  const C09 = ["c-06", "c-14", "c-18"];
  const result = await turn(c, "Swap the skirt for pants.", meddling.call, { onScreen: C09 });
  assert.ok(result.byAgent);
  assert.deepEqual(result.names.sort(), ["Linen wide-leg pants", "White canvas sneakers", "White linen shirt"]);
  assert.deepEqual(swapProblems(before(c, C09), result.card, "bottom"), []);
  assert.equal(result.cards.length, 1, "one outfit answers a swap");
});

test("a swap follows the kind and the direction asked for, and matches what is kept when none is given", () => {
  const plan = (pieces: EvalPiece[], message: string, onScreen: string[]) => {
    const wardrobe = pieces.map(toWardrobeItem);
    const planned = planHangerTurn({ wardrobe, message, activeOutfit: { itemIds: onScreen, intent: readOutfitIntent("") } });
    const outfit = planned.mode === "revise" ? rankOutfit(wardrobe, message, { intentOverride: planned.intent, maxPieces: planned.maxPieces, requiredItemIds: planned.requiredItemIds, excludedItemIds: planned.excludedItemIds }).pieces.map((entry) => entry.item.name) : [];
    return { planned, outfit };
  };
  assert.ok(plan(c, "Swap the skirt for pants.", ["c-06", "c-14", "c-18"]).outfit.includes("Linen wide-leg pants"), "pants, not shorts");
  assert.ok(plan(c, "Make this dressier: swap the shoes.", ["c-01", "c-17", "c-21"]).outfit.includes("Nude block-heel pumps"));
  assert.ok(plan(d, "Change the shoes to something dressier.", ["d-03", "d-10", "d-18", "d-16"]).outfit.includes("Brown leather loafers"));
  // "Warmer" is read as cold weather, and the new top matches the gym clothes that stay.
  const warmer = plan(d, "Swap the top for something warmer.", ["d-01", "d-09", "d-17", "d-14"]);
  assert.equal(warmer.planned.intent.weather, "cold");
  assert.ok(warmer.outfit.includes("Navy quarter-zip") && !warmer.outfit.includes("Forest green merino sweater"), warmer.outfit.join(", "));
  // "Switch" is a swap too, and a piece can be named by its own name.
  assert.deepEqual(plan(b, "Switch the shoes to something I can walk far in.", ["b-03", "b-10", "b-20"]).planned.changedCategories, ["shoe"]);
  assert.deepEqual(plan(b, "Change the hoodie for something else.", ["b-03", "b-10", "b-20"]).planned.changedCategories, ["top"]);
  // Nothing more casual than the most casual pair: the closest is offered, and said to be so.
  const floor = plan(b, "Swap the shoes for something more casual.", ["b-01", "b-08", "b-21"]);
  assert.match(floor.planned.swapNote ?? "", /Nothing in your closet is more casual than the Black rubber slides/);
  assert.equal(floor.outfit.length, 3);
});

test("a swap the closet cannot make is refused honestly, and a question about a swap is not a swap", async () => {
  // No pants of any kind: the answer is that, not shorts.
  const noPants = c.filter((entry) => entry.category !== "bottom" || entry.subtype === "skirt" || entry.subtype === "shorts");
  const C09 = ["c-06", "c-14", "c-18"];
  const model = scripted(callTool("build_outfits", { request: "pants instead of the skirt" }), say("You don't have pants to swap in, so I left the outfit as it is."));
  const refused = await turn(noPants, "Swap the skirt for pants.", model.call, { onScreen: C09 });
  assert.equal(refused.card.length, 0, "no new card");
  assert.deepEqual(refused.nextState.activeOutfit?.itemIds, C09, "the outfit on screen is untouched");
  assert.match(model.toolResults()[0].note, /there are no pants to swap in\. I have not changed your outfit\./);
  // One pair of shoes: nothing to swap to.
  const onePair = a.filter((entry) => entry.category !== "shoe" || entry.id === "a-13");
  const grounded = await turn(onePair, "Swap the shoes for something more casual.", async () => null, { onScreen: A08, agentEnabled: false });
  assert.match(grounded.reply.message, /Black oxfords is the only pair of shoes/);
  assert.deepEqual(grounded.nextState.activeOutfit?.itemIds, A08);
  // An opinion is asked for; the model answers and nothing is forced.
  const opinion = scripted(say("I'd keep the oxfords: the blazer wants a dress shoe."));
  const asked = await turn(a, "Should I swap the shoes for something more casual?", opinion.call, { onScreen: A08 });
  assert.ok(asked.byAgent);
  assert.equal(asked.reply.message, "I'd keep the oxfords: the blazer wants a dress shoe.");
  assert.equal(opinion.corrections().length, 0);
  // "Remove the shoes" still removes them rather than choosing another pair.
  const removed = planHangerTurn({ wardrobe: a.map(toWardrobeItem), message: "Remove the shoes", activeOutfit: { itemIds: A08, intent: readOutfitIntent("") } });
  assert.deepEqual(removed.changedCategories, []);
});

// ── The person's words, then the model's ────────────────────────────────────────────────────────

test("the model's reading of the occasion fills only what the person did not say", () => {
  const person = readOutfitIntent("I have a client presentation tomorrow morning.");
  assert.equal(completeIntent(person, { occasion: "black-tie", request: "formal outfit" }, null, "I have a client presentation tomorrow morning.").brief, "presentation");
  const vague = readOutfitIntent("ok, build me that outfit");
  assert.deepEqual([completeIntent(vague, { occasion: "wedding", request: "outfit" }, null).brief, completeIntent(vague, { occasion: "wedding", request: "outfit" }, null).occasion], ["wedding", "formal"]);
  assert.equal(completeIntent(vague, { occasion: "made-up-key", request: "something for the beach" }, null).brief, "beach", "an unknown choice is ignored and the words are read");
  assert.equal(completeIntent(vague, { look: "streetwear", request: "outfit" }, null).aesthetic, "streetwear");
  // Weather: their words, then the model's, then the forecast.
  assert.equal(completeIntent(readOutfitIntent("something for a cold day"), { request: "hot" }, "wet").weather, "cold");
  assert.equal(completeIntent(vague, { request: "outfit" }, "wet").weather, "wet");
  // Two things named: the model may build for the second as well as the first, and for nothing else.
  const both = "A morning run, then a quick breakfast.";
  assert.equal(completeIntent(readOutfitIntent(both), { request: "quick breakfast" }, null, both).brief, "brunch");
  assert.equal(completeIntent(readOutfitIntent(both), { occasion: "gala", request: "dress up" }, null, both).brief, "run");
  // The choices are offered in words, since Nova's validator rejects enum.
  const build = AGENT_TOOLS.find((tool) => tool.toolSpec?.name === "build_outfits")!.toolSpec!.inputSchema!.json as unknown as { properties: Record<string, { description: string }> };
  for (const key of BRIEF_KEYS) assert.ok(build.properties.occasion.description.includes(key), key);
  for (const key of AESTHETIC_KEYS) assert.ok(build.properties.look.description.includes(key), key);
});

// ── The reply, the card and the saved outfit ────────────────────────────────────────────────────

test("REGRESSION: outfits built for two things are both on cards, and the first thing leads", async () => {
  const model = scripted(callTool("build_outfits", { request: "morning run" }), callTool("build_outfits", { request: "quick breakfast" }), say("One for the run, one for breakfast after."));
  const result = await turn(d, "A morning run, then a quick breakfast.", model.call);
  assert.equal(result.cards.length, 2, JSON.stringify(result.cards));
  assert.ok(result.names.includes("Black running shoes"), `the run leads: ${result.names.join(", ")}`);
  assert.equal(result.nextState.activeOutfit?.intent.brief, "run");
  assert.ok(!result.cards[1].includes("Black running shoes") || !result.cards[1].includes("Black running shorts"), `breakfast is not the run again: ${result.cards[1].join(", ")}`);
  assertOneSelection(result, "d-01");
  // A second build for the same thing replaces the first: the model tried again.
  const retried = await turn(d, "What should I wear for my run?", scripted(callTool("build_outfits", { request: "run" }), callTool("build_outfits", { request: "run", exclude: ["Grey training tank"] }), say("This one.")).call);
  assert.equal(retried.cards.length, 1);
  assert.ok(!retried.names.includes("Grey training tank"));
});

test("REGRESSION: a reply describing an outfit no card shows is corrected, then refused", async () => {
  const off = "For the run, wear the Navy cotton polo with the Grey slim chinos and the Brown leather loafers.";
  const corrected = scripted(callTool("build_outfits", { request: "run" }), say(off), say("Your running kit, with the windbreaker in case it turns."));
  const fixed = await turn(d, "What should I wear for my run?", corrected.call);
  assert.ok(fixed.byAgent);
  assert.deepEqual(corrected.corrections(), [UNSHOWN_OUTFIT_CORRECTION]);
  assert.equal(fixed.reply.message, "Your running kit, with the windbreaker in case it turns.");
  const stubborn = await turn(d, "What should I wear for my run?", scripted(callTool("build_outfits", { request: "run" }), say(off)).call);
  assert.equal(stubborn.byAgent, false, "the grounded reply answers, so the words and the card agree");
  assert.match(stubborn.reply.degradedReason ?? "", /describing an outfit that was not the one shown/);
  assertOneSelection(stubborn, "off-card");
  assert.doesNotMatch(stubborn.reply.message, /Navy cotton polo/);
});

test("what counts as describing an unshown outfit", () => {
  const wardrobe = c.map(toWardrobeItem);
  const byName = (...names: string[]) => names.map((name) => wardrobe.find((item) => item.name === name)!);
  const shown = [byName("White linen shirt dress", "Black leather flats", "Gold hoop earrings")];
  assert.equal(replyDescribesUnshownOutfit("The White linen shirt dress with the Black leather flats and Gold hoop earrings is easy and cool.", wardrobe, shown), false, "the card itself");
  assert.equal(replyDescribesUnshownOutfit("Try the White linen shirt with the Tan midi skirt and White canvas sneakers.", wardrobe, shown), true);
  assert.equal(replyDescribesUnshownOutfit("The White linen shirt dress is the one; the Black leather flats keep it relaxed.", wardrobe, shown), false, "'shirt dress' is not also read as 'shirt'");
  assert.equal(replyDescribesUnshownOutfit("I left the Ivory linen blazer out because it is warm, and you could add the Natural straw tote or the Wide-brim straw hat.", wardrobe, shown), false, "extras are not an outfit");
  assert.equal(replyDescribesUnshownOutfit("Lovely choice.", wardrobe, shown), false);
});

test("the finer reading survives in the stored conversation as a controlled key, and nothing else does", () => {
  const intent = { ...readOutfitIntent("First date at a casual dinner spot tonight."), aesthetic: "coastal" };
  const stored = rememberActiveOutfit(emptyHangerConversation(), ["x"], intent).activeOutfit!.intent;
  assert.deepEqual([stored.brief, stored.briefShift, stored.aesthetic], ["date", -0.5, "coastal"]);
  const tampered = readHangerConversation({ activeOutfit: { itemIds: ["x"], intent: { occasion: "evening", brief: "a sentence about someone's health", briefShift: 7, aesthetic: "<script>" } } }).activeOutfit!.intent;
  assert.deepEqual([tampered.brief, tampered.briefShift, tampered.aesthetic], [undefined, undefined, undefined]);
  // A follow-up keeps the occasion the outfit was built for.
  const followUp = planHangerTurn({ wardrobe: a.map(toWardrobeItem), message: "Change the top but keep everything else.", activeOutfit: { itemIds: ["a-02", "a-07", "a-14"], intent: readOutfitIntent("casual Friday at the office") } });
  assert.equal(followUp.intent.brief, "casual-friday");
});

// ── With no model at all ────────────────────────────────────────────────────────────────────────

test("naming where you are going is a request for an outfit, with or without 'what should I wear'", () => {
  const mode = (message: string, pending = false) => planHangerTurn({ wardrobe: b.map(toWardrobeItem), message, ...(pending ? { pendingRequest: { message: "build me 5 outfits", count: 5 } } : {}) }).mode;
  assert.equal(mode("Beach cookout this afternoon."), "create");
  assert.equal(mode("Interview at a creative agency tomorrow."), "create");
  // A question is asking for an opinion, and a general word is not an occasion.
  assert.equal(mode("Which colours go with olive for a wedding?"), "advice");
  assert.equal(mode("I like casual clothes."), "advice");
  assert.equal(mode("Thanks, that works!"), "advice");
  // An answer to a question Hanger asked still finishes that request.
  assert.equal(planHangerTurn({ wardrobe: b.map(toWardrobeItem), message: "for a wedding", pendingRequest: { message: "build me 5 outfits", count: 5 } }).outfitCount, 5);
});

// ── The benchmark measures what the route does ──────────────────────────────────────────────────

test("the benchmark's weather word is the route's, and snow is cold", () => {
  for (const spec of [...requests.values()].flatMap((request) => (request.forecast ? [request.forecast] : []))) {
    assert.equal(weatherWord(spec), forecastToOutfitWeather({ highF: Math.round((spec.highC * 9) / 5 + 32), precipitationChance: spec.precipitationChance }), spec.description);
  }
  assert.equal(weatherWord(requests.get("c-06")!.forecast!), "warm", "a tropical downpour at 29 °C is dressed for heat, as the route always did");
  assert.equal(weatherWord(requests.get("b-05")!.forecast!), "cold", "snow at −8 °C is not a day for a rain shell");
  assert.equal(forecastToOutfitWeather({ highF: 45, precipitationChance: 80 }), "wet", "cold rain above freezing is still rain");
});

test("validity and swap accuracy are counted from the run, apart from any rater", () => {
  const closet = closets.get("closet-a")!;
  const sample = [requests.get("a-01")!, requests.get("a-08")!, requests.get("a-09")!, requests.get("a-10")!];
  const checks = mechanicalChecks({
    "a-01": { hangerOutfit: ["a-05", "a-10"] },                       // no bottoms, no shoes
    "a-08": { hangerOutfit: ["a-01", "a-06", "a-15", "a-10"] },       // exact
    "a-09": { hangerOutfit: ["a-03", "a-07", "a-14", "a-11"] },       // changed the top, and added a coat
    "a-10": { hangerOutfit: null },                                   // impossible: not counted
  }, [closet], sample);
  assert.deepEqual(checks.outfits, { answerable: 3, offered: 3, noneOffered: 0, valid: 2, invalid: [{ id: "a-01", problems: ["has neither a dress nor a top and a bottom", "has no shoes"] }] });
  assert.deepEqual(checks.swaps, { requests: 2, exact: 1, inexact: [{ id: "a-09", problems: ["added a second piece (outerwear)"] }] });
  assert.doesNotMatch(JSON.stringify(checks), /Camel overcoat|Navy blazer/, "nothing published names a piece");
  const closetPieces = (ids: string[]) => ids.map((id) => closet.pieces.find((entry) => entry.id === id)!);
  assert.deepEqual(swapProblems(closetPieces(A08), [], "shoe"), ["offered no outfit"]);
  assert.deepEqual(swapProblems(closetPieces(A08), closetPieces(A08), "shoe"), ["did not change the shoe"]);
  assert.deepEqual(swapProblems(closetPieces(A08), closetPieces(["a-04", "a-06", "a-15", "a-10"]), "shoe"), ["dropped the top", "added a second piece (top)"]);
});

test("the agent called directly, as the first benchmark called it, no longer returns a partial card or a bare refusal", async () => {
  const wardrobe = b.map(toWardrobeItem);
  const input = (message: string, activeOutfit: WardrobeItem[] = []): AgentInput => ({ message, history: [], wardrobe, forecast: null, activeOutfit, remembered: "", rankingBase: {}, loadTrends: async () => null, today: new Date("2026-10-14T12:00:00Z") });
  const built = await quiet(() => runHangerAgent(input("I'm heading out for a long walk."), scripted(callTool("build_outfits", { request: "two pieces, warm", count: 3, include: ["Black puffer jacket"] }), say("Three options.")).call));
  for (const outfit of built!.outfits) assert.deepEqual(missingFoundation(outfit), [], outfit.map((item) => item.name).join(", "));
  const onScreen = ["b-03", "b-10", "b-20"].map((id) => wardrobe.find((item) => item.id === id)!);
  const refused = await quiet(() => runHangerAgent(input("Switch the shoes to something I can walk far in.", onScreen), scripted(say("You have nothing suitable.")).call));
  assert.equal(refused, null, "it falls back rather than answer with a refusal the closet contradicts");
});
