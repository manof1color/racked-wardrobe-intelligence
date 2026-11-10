/**
 * Hanger as an agent: the model reads the message first and decides what it needs.
 *
 * Before this, keyword rules sorted every message into a turn type before the model saw it, and the
 * model then wrote inside that box. When the rules guessed wrong — a colour question read as an
 * outfit request, "will this or that look better" read as advice — the model was stuck answering the
 * wrong question. That is what "it keeps roadblocking itself" was.
 *
 * Now the model is given tools, the way a stylist has a closet, a window, and a feel for what people
 * are wearing: it can search the wardrobe, build outfits, check the weather, and look at Racked
 * trends. It calls what it needs, as many times as it needs, inside a hard time budget.
 *
 * What does not change is grounding. Outfits come only from `build_outfits`, which runs the same
 * deterministic ranker over pieces the person owns; the model can describe them but never assemble
 * one itself, and a reply that lists outfits it did not build is corrected once and then refused.
 * If the agent cannot answer in time — or the model is unavailable — it returns null and the route
 * falls back to the grounded reply, so a person always gets an answer.
 *
 * The person's own words outrank the model's tool arguments. The blind evaluation of 2026-11-10
 * showed what happens otherwise: the model's free-text `request` was parsed for piece counts and
 * named pieces, its `include` list could fill an outfit with three jackets and no trousers, and
 * "swap the shoes" was whatever the model chose to do about it — including a search for the word
 * "casual" that matched no shoe name and ended in "you don't own any casual shoes". Now the request
 * is read from the person's message, the model's arguments only add what the person did not say, a
 * swap is resolved against the outfit on screen before the builder runs, and a turn that ends
 * without the swap that was asked for, or with a reply describing an outfit no card shows, is
 * corrected once and then handed to the grounded reply.
 */
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import { BEDROCK_CHAT_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";
import { AI_PAUSED_REASON } from "./abuse-limits.ts";
import { garmentFormality, weatherFit } from "./garment-knowledge.ts";
import { formatHangerText, hangerModelCandidates, mayTryAnotherHangerModel, normalizeProviderHistory, replyDescribesUnshownOutfit, replyInventsOutfits } from "./hanger-conversation.ts";
import { categoryForWord, planHangerTurn } from "./hanger-turn.ts";
import { AESTHETIC_KEYS, BRIEF_KEYS, aestheticByKey, briefByKey, briefsNamed, isSportyPiece } from "./occasion-knowledge.ts";
import { MAX_OUTFIT_SET, intentBrief, rankOutfit, rankOutfitSet, readOutfitIntent, type GroundedOutfit, type OutfitIntent } from "./outfit-ranking.ts";
import type { Forecast } from "./weather.ts";
import type { AgentChatTurn, OutfitPost } from "./platform-types.ts";
import type { WardrobeItem } from "./types.ts";

/** The whole turn, all model calls and tools included, must finish inside this. */
export const AGENT_DEADLINE_MS = 22_000;
/** A model call is not started with less time than this left; the grounded reply is faster. */
const MIN_CALL_MS = 2_500;
export const MAX_AGENT_ROUNDS = 5;
const WARDROBE_INDEX_LIMIT = 60;
const CATEGORIES = ["top", "bottom", "outerwear", "shoe", "dress", "bag", "jewelry", "accessory"];

export interface TrendSummary {
  postCount: number;
  colors: string[];
  styles: string[];
  pieces: string[];
}

export interface AgentInput {
  message: string;
  history: AgentChatTurn[];
  wardrobe: WardrobeItem[];
  forecast: Forecast | null;
  /** The outfit already on screen, which "those" and "swap the shoes" refer to. */
  activeOutfit: WardrobeItem[];
  /** What that outfit was built for, so "make it warmer" keeps the occasion it already had. */
  activeIntent?: OutfitIntent | null;
  remembered: string;
  /** Ranking settings the route already applies: history, preferences, rotation, inspiration. */
  rankingBase: Parameters<typeof rankOutfit>[2];
  /** Loaded only if the model asks for trends. */
  loadTrends: () => Promise<TrendSummary | null>;
  today: Date;
  /** Told why a turn fell back, so the reply can say so instead of only the server log. */
  onFallback?: (failure: AgentFailure) => void;
}

/**
 * Why the agent did not answer. `model-error` carries the provider's error name (never its message
 * or anything the person wrote), which is what identifies a live misconfiguration.
 */
export interface AgentFailure {
  kind: "model-error" | "no-response" | "out-of-time" | "too-many-rounds" | "invented-outfits" | "empty-reply" | "budget" | "declined-swap" | "reply-off-card";
  errorName?: string;
  elapsedMs: number;
}

/** Plain words for the reply, e.g. "the model returned an error (ValidationException)". */
export function describeAgentFailure(failure: AgentFailure) {
  switch (failure.kind) {
    case "model-error": return `the model returned an error${failure.errorName ? ` (${failure.errorName})` : ""}`;
    case "out-of-time": return "it ran out of time";
    case "too-many-rounds": return "it needed too many steps";
    case "invented-outfits": return "it kept writing outfits it had not built";
    case "declined-swap": return "it did not make the change that was asked for, so the wardrobe made it";
    case "reply-off-card": return "it kept describing an outfit that was not the one shown";
    case "empty-reply": return "it returned an empty reply";
    case "budget": return AI_PAUSED_REASON;
    default: return "it returned nothing";
  }
}

/** Errors the provider raises on a timeout or a throttle: retrying with another model would only add to the wait. */
const SLOW_FAILURES = new Set(["TimeoutError", "AbortError", "ThrottlingException", "ServiceUnavailableException", "ModelTimeoutException"]);

/**
 * Whether the plain, tool-free model reply is still worth trying after the agent failed. A tool-use
 * call can be rejected while an ordinary one is accepted, and a fast rejection leaves time for it;
 * a slow or throttled provider does not, and would only double the wait.
 */
export function plainReplyWorthTrying(failure: AgentFailure | null) {
  if (!failure || failure.elapsedMs > 8_000) return false;
  if (failure.kind === "model-error") return !SLOW_FAILURES.has(failure.errorName ?? "");
  return failure.kind === "invented-outfits" || failure.kind === "empty-reply";
}

export interface AgentResult {
  message: string;
  /** Outfits from the last build_outfits call this turn — the ones shown as cards. */
  outfits: WardrobeItem[][];
  /** Every piece offered in any build this turn, so follow-ups rotate past them. */
  offered: string[];
  intent: OutfitIntent | null;
  toolsUsed: string[];
  /** Pieces the model asked to include that the person does not own. */
  notFound: string[];
  /** Plain sentences about what was built: a slot the closet could not fill, a piece left out, a swap made. */
  notes: string[];
}

/**
 * `usage` and `modelId` are what Bedrock reported for the call; the route ignores them, and the
 * Hanger evaluation (scripts/run-hanger-evaluation.mjs) counts its spending from them.
 */
export interface AgentModelResponse { content: ContentBlock[]; stopReason?: string; usage?: { inputTokens?: number; outputTokens?: number }; modelId?: string }
export type AgentConverse = (request: { system: string; messages: Message[]; tools: Tool[]; timeoutMs: number }) => Promise<AgentModelResponse | null>;

const text = (value: unknown, maximum: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "");
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase();

export const AGENT_TOOLS: Tool[] = [
  { toolSpec: {
    name: "search_wardrobe",
    description: "Look up pieces the person owns by colour, category, or words from the name or type. Words like casual, dressy, warm, light, waterproof and sporty are understood as what a piece is like, not as words in its name. Use it before saying they do or do not own something. When nothing matches in a category it lists what they do own there: read that list before saying they have none.",
    inputSchema: { json: { type: "object", properties: {
      color: { type: "string", description: "A colour, e.g. green" },
      category: { type: "string", description: `One of: ${CATEGORIES.join(", ")}` },
      text: { type: "string", description: "Words from the piece's name or type (henley, timbs), or what it is like (casual, dressy, warm)" },
    } } },
  } },
  { toolSpec: {
    name: "build_outfits",
    description: "Build complete outfits from the person's own wardrobe, or change the outfit on screen. The only way to propose an outfit: results appear as cards with photos and Save and Record buttons below your reply. To swap or change one piece of the outfit on screen, call this with what they asked for: it keeps every other piece and changes only that one, choosing from what they own.",
    inputSchema: { json: { type: "object", properties: {
      request: { type: "string", description: "What the outfit is for, in the person's words: occasion, style, weather" },
      // The choices are listed in words, not as an enum: Nova's tool validator rejects enum, and the
      // server checks the value against the curated list anyway, ignoring anything else.
      occasion: { type: "string", description: `The dress code or activity closest to what they are dressing for; leave it out if they named none. One of: ${BRIEF_KEYS.join(", ")}` },
      look: { type: "string", description: `A named look or aesthetic they asked for, if any. One of: ${AESTHETIC_KEYS.join(", ")}` },
      count: { type: "integer", description: `How many different outfits, 1 to ${MAX_OUTFIT_SET}` },
      include: { type: "array", items: { type: "string" }, description: "Names of owned pieces they asked to have in the outfit" },
      exclude: { type: "array", items: { type: "string" }, description: "Names of owned pieces to leave out" },
    }, required: ["request"] } },
  } },
  { toolSpec: {
    name: "get_weather",
    description: "Today's and tomorrow's forecast for where the person is.",
    inputSchema: { json: { type: "object", properties: { day: { type: "string", description: "today or tomorrow" } } } },
  } },
  { toolSpec: {
    name: "get_trends",
    description: "What people on Racked have been wearing in recent public looks: the most common colours, styles, and pieces. Anonymous totals only.",
    inputSchema: { json: { type: "object", properties: { focus: { type: "string", description: "colours, styles, or pieces" } } } },
  } },
];

/** One line per piece: enough for the model to know what exists without a JSON dump. */
function wardrobeIndex(wardrobe: WardrobeItem[]) {
  const lines = wardrobe.slice(0, WARDROBE_INDEX_LIMIT).map((item) =>
    `- ${item.name} · ${item.category}${item.customType ? ` (${item.customType})` : ""} · ${item.color} · ${garmentFormality(item).label} · worn ${item.wearCount}×`);
  const more = wardrobe.length > WARDROBE_INDEX_LIMIT ? `\n…and ${wardrobe.length - WARDROBE_INDEX_LIMIT} more — use search_wardrobe.` : "";
  return lines.join("\n") + more;
}

export function agentSystemPrompt(input: Pick<AgentInput, "wardrobe" | "forecast" | "activeOutfit" | "remembered" | "today">) {
  const date = input.today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const onScreen = input.activeOutfit.length ? input.activeOutfit.map((item) => item.name).join(", ") : "nothing yet";
  return [
    "You are Hanger, a personal stylist working with the clothes this person owns. Talk like a person: warm, direct, specific, brief — two to five sentences unless they ask for more. Answer the question they asked, first.",
    "Use your tools the way a stylist uses a closet and a window. Look things up instead of guessing: call search_wardrobe before saying they do or do not own something; call get_weather when the weather affects what to wear; call get_trends when they ask what is in or popular.",
    "Outfits come only from build_outfits, which uses pieces they own and shows each outfit as a card with photos below your reply. Never write an outfit list yourself — no numbered outfits, no pieces joined with plus signs. After building, introduce the outfits in a sentence or two and say why they work; do not repeat every piece.",
    "When they ask a general styling question — which colours go together, what pairs with what, how something should fit — answer from fashion knowledge with a clear opinion and the reason. When they ask which of two options is better, pick one and say why; never answer 'either'. When they say you missed their question, find it earlier in the conversation and answer it.",
    "Only build outfits when they want outfits. Refer to pieces by their exact names. Label any shopping idea as something they do not own.",
    "Read what they are dressing for and pass it to build_outfits as `occasion`: the dress code or activity, as specifically as they said it. A black-tie-optional wedding, a client presentation, casual Friday and dinner with a partner's parents are four different levels of dress; a run, a hike, a long walk and a beach day each need different shoes. If they ask for a named look — streetwear, quiet luxury, coastal, dark academia — pass it as `look`. When their words fit none of the choices, pick the closest and say what you assumed.",
    "When they ask to swap, change or replace one piece of the outfit on screen, call build_outfits: it keeps the rest and changes only that piece. Never tell them they own nothing suitable unless search_wardrobe has just shown you that; a word like casual or dressy describes a piece and will not be in its name.",
    "Every outfit you build this turn is shown as a card, in order. Describe only the outfits on the cards. If the builder says an outfit is missing something — no shoes in the closet, say — tell them so plainly.",
    "Know your formality ladder: athletic or lounge, casual, smart casual, business, formal. Each piece in their wardrobe is labelled with its level. A graphic tee, ripped jeans, sneakers, and a beanie are casual; a henley or polo is smart casual; an oxford shirt, chinos, loafers, or a blazer dress an outfit up. When they ask for something more formal, dressier, or more casual than what is on screen, call build_outfits with that word in the request — the builder ranks by formality — and then say honestly how formal their wardrobe can go.",
    "Never state or guess the weather without get_weather. Never claim access to news, Pinterest, or other outside sources. Never infer body shape, gender, age, ethnicity, income, or health.",
    "Write plain text: short paragraphs, no markdown headings, bold, tables, or code.",
    "",
    `Today is ${date}.`,
    `Weather: ${input.forecast ? `available for ${input.forecast.place} — call get_weather` : "no location set — if weather matters, they can add a home city in Settings or tap Use my location"}.`,
    `Outfit currently on screen: ${onScreen}.`,
    ...(input.remembered ? [`Standing preferences from earlier: ${input.remembered}.`] : []),
    `Their wardrobe (${input.wardrobe.length} pieces):`,
    wardrobeIndex(input.wardrobe),
  ].join("\n");
}

/** The owned piece a name refers to: an exact name first, then the longest overlapping name. */
export function resolvePieceName(name: string, wardrobe: WardrobeItem[]): WardrobeItem | null {
  const wanted = lower(name).trim();
  if (wanted.length < 2) return null;
  const exact = wardrobe.find((item) => lower(item.name) === wanted);
  if (exact) return exact;
  const candidates = wardrobe
    .filter((item) => lower(item.name).includes(wanted) || wanted.includes(lower(item.name)))
    .sort((a, b) => b.name.length - a.name.length);
  return candidates[0] ?? null;
}

/**
 * Words that say what a piece is like rather than what it is called. Searched literally, "casual"
 * matched no shoe named "White leather sneakers" and the model concluded there were no casual
 * shoes; here each is a test against the same knowledge the outfit builder uses.
 */
const DESCRIPTORS: Array<{ words: string[]; test: (item: WardrobeItem) => boolean }> = [
  { words: ["casual", "relaxed", "everyday", "laid-back", "informal", "comfy", "comfortable"], test: (item) => garmentFormality(item).level <= 2.5 },
  { words: ["dressy", "dressier", "formal", "smart", "smarter", "elegant", "fancy", "business", "professional", "polished"], test: (item) => garmentFormality(item).level >= 3.5 },
  { words: ["warm", "warmer", "cozy", "cosy", "winter", "cold"], test: (item) => weatherFit(item, "cold").score >= 85 },
  { words: ["cool", "cooler", "light", "lighter", "lightweight", "summer", "breathable", "hot"], test: (item) => weatherFit(item, "warm").score >= 85 },
  { words: ["waterproof", "rain", "rainy", "wet"], test: (item) => weatherFit(item, "wet").score >= 85 },
  { words: ["athletic", "sporty", "gym", "workout", "exercise", "sport", "sports", "activewear"], test: (item) => isSportyPiece(item) },
];
const FILLER_WORDS = new Set(["a", "an", "the", "and", "or", "for", "to", "with", "of", "in", "my", "some", "something", "anything", "more", "less", "very", "that", "this", "other", "another", "different", "pair", "piece", "pieces", "item", "items", "clothes", "option", "options"]);

export function searchWardrobe(input: unknown, wardrobe: WardrobeItem[]) {
  const query = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const color = lower(text(query.color, 40));
  const rawCategory = lower(text(query.category, 20));
  let category = rawCategory ? categoryForWord(rawCategory) : null;
  // A category the taxonomy does not know ("knitwear") is still worth searching for as a word.
  const words = [...(rawCategory && !category ? [rawCategory] : []), ...lower(text(query.text, 60)).split(/[\s,]+/)].filter((word) => word.length >= 2 && !FILLER_WORDS.has(word));
  const tests: Array<(item: WardrobeItem) => boolean> = [];
  const literal: string[] = [];
  for (const word of words) {
    const descriptor = DESCRIPTORS.find((entry) => entry.words.includes(word));
    const names = categoryForWord(word);
    if (descriptor) tests.push(descriptor.test);
    // "casual shoes" in the text names the category as well as the quality.
    else if (names && !category && !wardrobe.some((item) => lower(item.name).includes(word))) category = names;
    else literal.push(word);
  }
  const describe = (item: WardrobeItem) => ({
    name: item.name, category: item.category, type: item.customType ?? item.subtype ?? null, color: item.color, formality: garmentFormality(item).label,
    season: item.season ?? null, style: (item.style ?? []).slice(0, 4),
    wears: item.wearCount, lastWorn: item.lastWornDays > 365 ? "never" : `${item.lastWornDays} days ago`,
  });
  const inCategory = wardrobe.filter((item) => !category || lower(item.category) === category);
  const matches = inCategory.filter((item) => {
    if (color && !lower(item.color).includes(color)) return false;
    if (!tests.every((test) => test(item))) return false;
    const haystack = lower(`${item.name} ${item.subtype ?? ""} ${item.customType ?? ""} ${item.brand ?? ""} ${item.color ?? ""} ${item.material ?? ""} ${item.pattern ?? ""} ${(item.style ?? []).join(" ")} ${item.season ?? ""}`);
    return literal.every((word) => haystack.includes(word));
  });
  return {
    count: matches.length,
    pieces: matches.slice(0, 25).map(describe),
    // Nothing matched, but the category is not empty: show it, so "none like that" is never
    // mistaken for "none at all".
    ...(!matches.length && category && inCategory.length ? {
      ownedInCategory: inCategory.slice(0, 25).map(describe),
      note: `Nothing matched those words exactly, but they own ${inCategory.length} ${inCategory.length === 1 ? "piece" : "pieces"} in this category, listed in ownedInCategory. Choose from those before saying they have none.`,
    } : {}),
  };
}

/** Anonymous totals over recent public looks. No handle, account, or post id leaves this function. */
export function summarizeCommunityTrends(posts: OutfitPost[], limit = 5): TrendSummary {
  const tally = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
  };
  const garments = posts.flatMap((post) => post.garments ?? []);
  return {
    postCount: posts.length,
    colors: tally(garments.map((garment) => lower(garment.color))),
    styles: tally(garments.flatMap((garment) => (garment.style ?? []).map(lower))),
    pieces: tally(garments.map((garment) => lower(garment.subtype ?? garment.category).replace(/-/g, " "))),
  };
}

/** The agent needs the model; without a provider configured the grounded pipeline answers alone. */
export function isAgentEnabled() {
  return (process.env.AI_PROVIDER ?? "").toLowerCase() === "bedrock";
}

/**
 * Nova models reason aloud in <thinking> tags beside a tool call, and sometimes before a final
 * answer. That is working, not conversation, and is never shown to the person.
 */
export function stripThinking(reply: string) {
  return reply.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").replace(/<\/?thinking>/gi, "").trim();
}

/** Sent back to the model, once per turn, when its reply listed outfits the builder never made. */
export const INVENTED_OUTFIT_CORRECTION = "Do not write outfit lists yourself. Call build_outfits if outfits are wanted; otherwise answer without listing outfits.";
/** Sent once when the reply describes an outfit that is on no card. */
export const UNSHOWN_OUTFIT_CORRECTION = "Your reply describes an outfit that is not on the cards. Describe only the outfits build_outfits returned this turn, or call build_outfits again for the one you mean.";
/** Sent once when they asked for a swap, the closet can make it, and the turn was about to end without it. */
export const swapCorrection = (slot: string, options: string[]) =>
  `They asked you to change the ${slot} of the outfit on screen, and they own other options: ${options.join("; ")}. Call build_outfits now with their request; it keeps the rest of the outfit and changes only the ${slot}.`;

const NEUTRAL_INTENT: OutfitIntent = { mode: "outfit", occasion: null, weather: null, styleHints: [], styleSource: "none", alternativeRequested: false };
const SLOT_WORDS: Record<string, string> = { top: "top", bottom: "bottoms", shoe: "shoes", outerwear: "jacket", dress: "dress", bag: "bag", jewelry: "jewelry", accessory: "accessory" };
/** "Should I swap the shoes?" asks for an opinion; "can you swap the shoes?" asks for the swap. */
const asksAnOpinion = (message: string) => /^\s*(?:should|shall|would it|do you think|is it|what if|does|will it|why|which)\b/i.test(message)
  || (/\?\s*$/.test(message) && !/^\s*(?:can|could|would|will) you\b|\bplease\b/i.test(message));
const outfitKey = (outfit: WardrobeItem[]) => outfit.map((item) => item.id).sort().join("|");

/**
 * The model's reading of the request, used only where the person's own words said nothing. Their
 * message is read first; the model's `occasion` and `look` — chosen from the curated lists — and
 * then the words of its `request` fill what is left, and the forecast fills the weather last.
 */
export function completeIntent(person: OutfitIntent, model: { occasion?: unknown; look?: unknown; request: string }, forecastWeather: OutfitIntent["weather"], message = ""): OutfitIntent {
  const said = readOutfitIntent(model.request);
  const chosenBrief = briefByKey(model.occasion);
  const chosenLook = aestheticByKey(model.look);
  const intent: OutfitIntent = { ...person };
  // When their message names more than one thing — a run, then breakfast — the model may build for
  // each in turn. Its choice is honoured only among the occasions their own words named.
  const alsoNamed = briefByKey([chosenBrief?.key, said.brief].find((key) => key && key !== person.brief && briefsNamed(message).includes(key)));
  if (alsoNamed) { intent.occasion = alsoNamed.family; intent.brief = alsoNamed.key; delete intent.briefShift; }
  else if (!person.occasion && !person.brief) {
    if (chosenBrief) { intent.occasion = chosenBrief.family; intent.brief = chosenBrief.key; delete intent.briefShift; }
    else if (said.occasion || said.brief) { intent.occasion = said.occasion; intent.brief = said.brief ?? null; if (said.briefShift) intent.briefShift = said.briefShift; }
  }
  if (!person.aesthetic && !person.styleHints.length) {
    const look = chosenLook?.key ?? said.aesthetic ?? null;
    if (look) intent.aesthetic = look;
    if (said.styleHints.length) { intent.styleHints = said.styleHints; intent.styleSource = "request"; }
  }
  intent.weather = person.weather ?? said.weather ?? forecastWeather ?? null;
  if (said.mode === "rotation") intent.mode = "rotation";
  intent.alternativeRequested = person.alternativeRequested || said.alternativeRequested;
  return intent;
}

/** Runs one turn. Null means "fall back to the grounded reply". */
export async function runHangerAgent(input: AgentInput, call: AgentConverse = bedrockAgentConverse, clock: () => number = Date.now): Promise<AgentResult | null> {
  const started = clock();
  /** Why a turn fell back, for the server log and the reply. Never includes what the person wrote. */
  const fallBack = (kind: AgentFailure["kind"], errorName?: string): null => {
    const failure: AgentFailure = { kind, ...(errorName ? { errorName } : {}), elapsedMs: clock() - started };
    console.warn("Hanger agent fell back to the grounded reply", failure);
    input.onFallback?.(failure);
    return null;
  };
  const system = agentSystemPrompt(input);
  const messages: Message[] = [
    ...normalizeProviderHistory(input.history).map((turn): Message => ({ role: turn.role, content: [{ text: turn.content }] })),
    { role: "user", content: [{ text: input.message.slice(0, 1_000) }] },
  ];
  const toolsUsed = new Set<string>();
  const offered = new Set<string>();
  const notFound = new Set<string>();
  const notes = new Set<string>();
  // Every outfit built this turn, grouped by what it was built for. A second build for the same
  // thing replaces the first (the model tried again); a build for something else is added to it
  // ("for the run… and for breakfast"), so nothing the reply may describe is missing from the cards.
  const builds = new Map<string, { outfits: WardrobeItem[][]; intent: OutfitIntent }>();
  const shownOutfits = () => {
    const seen = new Set<string>();
    return [...builds.values()].flatMap((build) => build.outfits).filter((outfit) => {
      const key = outfitKey(outfit);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_OUTFIT_SET);
  };
  let correctedInvented = false, correctedSwap = false, correctedUnshown = false;

  // What the person asked of the outfit on screen, read from their own words before the model acts.
  const activeIds = input.activeOutfit.map((item) => item.id);
  const plan = planHangerTurn({ wardrobe: input.wardrobe, message: input.message, activeOutfit: activeIds.length ? { itemIds: activeIds, intent: input.activeIntent ?? NEUTRAL_INTENT } : null });
  const revising = plan.mode === "revise";
  const swapping = revising && plan.changedCategories.length > 0;
  const swapBlocked = plan.swapBlocked && plan.changedCategories.length > 0 ? plan.swapBlocked : null;
  const byId = new Map(input.wardrobe.map((item) => [item.id, item]));

  const runTool = async (name: string | undefined, raw: unknown): Promise<unknown> => {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (name === "search_wardrobe") {
      toolsUsed.add("wardrobe search");
      return searchWardrobe(args, input.wardrobe);
    }
    if (name === "build_outfits") {
      toolsUsed.add("outfit builder");
      if (swapBlocked) {
        notes.add(swapBlocked);
        return { outfits: [], unchanged: true, note: swapBlocked, shown: "No new card: the outfit on screen is unchanged. Tell them exactly why, in your own words." };
      }
      const request = text(args.request, 300) || input.message;
      const names = (value: unknown) => (Array.isArray(value) ? value.slice(0, 8).map((entry) => text(entry, 100)).filter(Boolean) : []);
      const include = names(args.include).map((name) => ({ name, item: resolvePieceName(name, input.wardrobe) }));
      const exclude = names(args.exclude).map((name) => resolvePieceName(name, input.wardrobe)).filter((item): item is WardrobeItem => Boolean(item));
      for (const entry of include) if (!entry.item) notFound.add(entry.name);
      // The person's own words decide the occasion, the look and the weather; the model's reading
      // and then the forecast fill in only what they did not say.
      const intent = completeIntent(revising ? plan.intent : readOutfitIntent(input.message), { occasion: args.occasion, look: args.look, request }, input.forecast?.outfitWeather ?? null, input.message);
      const kept = new Set(revising ? plan.requiredItemIds : []);
      const ruledOut = new Set([...(input.rankingBase?.excludedItemIds ?? []), ...(revising ? plan.excludedItemIds : [])]);
      // The model may leave a piece out, but not one the person asked to keep; and it may propose
      // pieces, but in a swap only for the slot being changed — everything else is already decided.
      for (const item of exclude) if (!kept.has(item.id)) ruledOut.add(item.id);
      const proposed = include.flatMap((entry) => (entry.item ? [entry.item] : []))
        .filter((item) => !ruledOut.has(item.id) && !kept.has(item.id))
        .filter((item) => !swapping || plan.changedCategories.includes(lower(item.category)));
      // One outfit answers a swap. How many pieces it has is the person's to say, never the model's.
      const count = swapping ? 1 : Math.max(1, Math.min(MAX_OUTFIT_SET, Math.round(Number(args.count) || 1)));
      const options = {
        ...input.rankingBase,
        intentOverride: intent,
        requiredItemIds: [...kept],
        excludedItemIds: [...ruledOut],
        suggestedItemIds: proposed.map((item) => item.id),
        preferDress: /\b(?:dress|gown|jumpsuit|romper)\b/i.test(`${input.message} ${request}`),
        ...(revising ? { maxPieces: plan.maxPieces, rotatePriorSuggestions: plan.rotatePriorSuggestions || Boolean(input.rankingBase?.rotatePriorSuggestions) } : {}),
      };
      // The person's message, not the model's paraphrase, is what named pieces and piece counts are read from.
      const ranked: GroundedOutfit[] = (count > 1
        ? rankOutfitSet(input.wardrobe, input.message, { ...options, count }).map((entry) => entry.outfit)
        : [rankOutfit(input.wardrobe, input.message, options)]).filter((outfit) => outfit.pieces.length);
      const built = ranked.map((outfit) => outfit.pieces.map((piece) => piece.item));
      for (const outfit of built) for (const item of outfit) offered.add(item.id);
      const brief = intentBrief(intent);
      builds.set(swapping ? "swap" : `${intent.brief ?? intent.occasion ?? ""}|${intent.aesthetic ?? ""}`, { outfits: built, intent });
      const shown = shownOutfits();
      const numberOf = (outfit: WardrobeItem[]) => shown.findIndex((entry) => outfitKey(entry) === outfitKey(outfit)) + 1;
      const leftOut = [...new Set(ranked.flatMap((outfit) => outfit.leftOut))].map((id) => byId.get(id)?.name).filter((name): name is string => Boolean(name));
      if (leftOut.length) notes.add(`Left out ${leftOut.join(", ")}: an outfit needs a top, bottoms and shoes before a second piece of the same kind.`);
      for (const outfit of ranked) for (const gap of outfit.missing) notes.add(gap.note);
      if (plan.swapNote && swapping) notes.add(plan.swapNote);
      const swapped = swapping && built[0] ? input.activeOutfit.filter((item) => !built[0].some((piece) => piece.id === item.id)) : [];
      const arrived = swapping && built[0] ? built[0].filter((piece) => !activeIds.includes(piece.id)) : [];
      if (swapped.length && arrived.length) notes.add(`Swapped ${swapped.map((item) => item.name).join(", ")} for ${arrived.map((item) => item.name).join(", ")} and kept the rest of the outfit.`);
      return {
        outfits: ranked.map((outfit, index) => ({
          number: numberOf(built[index]) || index + 1,
          pieces: built[index].map((item) => ({ name: item.name, category: item.category, color: item.color })),
          ...(outfit.missing.length ? { incomplete: outfit.missing.map((gap) => gap.note).join(" ") } : {}),
        })),
        ...(brief ? { dressedFor: brief.label } : {}),
        ...(swapped.length && arrived.length ? { changed: `Replaced ${swapped.map((item) => item.name).join(", ")} with ${arrived.map((item) => item.name).join(", ")}; every other piece is the same.` } : {}),
        ...(plan.swapNote && swapping ? { note: plan.swapNote } : count > built.length ? { note: intent.occasion
          ? `Only ${built.length} outfit${built.length === 1 ? "" : "s"} in this wardrobe suit ${brief?.label ?? intent.occasion}. Say so plainly rather than padding the set.`
          : `Only ${built.length} distinct outfit${built.length === 1 ? "" : "s"} could be made from this wardrobe.` } : {}),
        ...(leftOut.length ? { leftOut, leftOutBecause: "Adding them would have left the outfit without a top, bottoms or shoes, or doubled a piece. Do not describe them as part of the outfit." } : {}),
        ...(notFound.size ? { notOwned: [...notFound] } : {}),
        shown: "These appear as cards with photos and Save/Record buttons below your reply. Describe them briefly; do not list every piece.",
      };
    }
    if (name === "get_weather") {
      toolsUsed.add("weather");
      return input.forecast
        ? { place: input.forecast.place, summary: input.forecast.summary, today: input.forecast.today, tomorrow: input.forecast.tomorrow, source: "Open-Meteo" }
        : { available: false, howToEnable: "They can add a home city in Settings, or tap Use my location in this chat." };
    }
    if (name === "get_trends") {
      toolsUsed.add("Racked trends");
      const trends = await input.loadTrends().catch(() => null);
      return trends && trends.postCount ? { ...trends, basis: `the ${trends.postCount} most recent public looks on Racked` } : { available: false };
    }
    return { error: `No tool called ${String(name)}.` };
  };

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    const remaining = AGENT_DEADLINE_MS - (clock() - started);
    if (remaining < MIN_CALL_MS) return fallBack("out-of-time");
    let errorName = "";
    const response = await call({ system, messages, tools: AGENT_TOOLS, timeoutMs: Math.min(BEDROCK_CHAT_TIMEOUT_MS, remaining) })
      .catch((error: unknown) => { errorName = error instanceof Error ? error.name : "UnknownError"; return null; });
    // A refused budget stops the loop where it is: rounds already run were spent, none more are.
    if (errorName === "AiBudgetExhausted") return fallBack("budget");
    if (errorName) return fallBack(SLOW_FAILURES.has(errorName) ? "out-of-time" : "model-error", errorName);
    if (!response || !response.content.length) return fallBack("no-response");
    messages.push({ role: "assistant", content: response.content });

    const uses = response.content.flatMap((block) => (block.toolUse ? [block.toolUse] : []));
    if (uses.length) {
      const results: ContentBlock[] = [];
      for (const use of uses) {
        const result = await runTool(use.name, use.input);
        results.push({ toolResult: { toolUseId: use.toolUseId, content: [{ text: JSON.stringify(result) }] } });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const reply = stripThinking(response.content.map((block) => block.text ?? "").join(""));
    if (!reply) return fallBack("empty-reply");
    const outfits = shownOutfits();
    // An outfit list the builder never made: ask once for the tool instead, then give up on it.
    if (!outfits.length && replyInventsOutfits(reply, input.wardrobe)) {
      if (correctedInvented) return fallBack("invented-outfits");
      correctedInvented = true;
      messages.push({ role: "user", content: [{ text: INVENTED_OUTFIT_CORRECTION }] });
      continue;
    }
    // They asked for a swap the closet can make, and the turn is ending without one. Say what they
    // own for that slot and ask once; a second refusal goes to the grounded reply, which makes it.
    if (swapping && !builds.size && !asksAnOpinion(input.message)) {
      if (correctedSwap) return fallBack("declined-swap");
      correctedSwap = true;
      const category = plan.changedCategories[0];
      const setAside = new Set(plan.excludedItemIds);
      const options = input.wardrobe
        .filter((item) => lower(item.category) === category && !activeIds.includes(item.id) && !setAside.has(item.id))
        .slice(0, 8).map((item) => `${item.name} (${garmentFormality(item).label})`);
      messages.push({ role: "user", content: [{ text: swapCorrection(SLOT_WORDS[category] ?? category, options) }] });
      continue;
    }
    // A reply about an outfit that is on no card: what Save would store is not what was recommended.
    if (outfits.length && replyDescribesUnshownOutfit(reply, input.wardrobe, outfits)) {
      if (correctedUnshown) return fallBack("reply-off-card");
      correctedUnshown = true;
      messages.push({ role: "user", content: [{ text: UNSHOWN_OUTFIT_CORRECTION }] });
      continue;
    }
    const lead = [...builds.values()].find((build) => build.outfits.length);
    return { message: formatHangerText(reply).slice(0, 2_500), outfits, offered: [...offered], intent: lead?.intent ?? null, toolsUsed: [...toolsUsed], notFound: [...notFound], notes: [...notes] };
  }
  return fallBack("too-many-rounds");
}

/**
 * The real model call: Nova Pro first, the next candidate only for a configuration error. A
 * failure is thrown, not swallowed, so the turn can say which error it was — the first live run of
 * the agent fell back with nothing on screen to say why.
 */
export async function bedrockAgentConverse(request: Parameters<AgentConverse>[0]): Promise<AgentModelResponse | null> {
  if ((process.env.AI_PROVIDER ?? "").toLowerCase() !== "bedrock") return null;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
  const client = new BedrockRuntimeClient({ region });
  let lastError: unknown = null;
  for (const modelId of hangerModelCandidates()) {
    try {
      const response = await client.send(new ConverseCommand({
        modelId,
        system: [{ text: request.system }],
        messages: request.messages,
        toolConfig: { tools: request.tools },
        // Amazon recommends near-greedy decoding for Nova tool use: sampled tool calls are where
        // "Model produced invalid sequence as part of ToolUse" comes from. Variety comes from the
        // conversation itself.
        inferenceConfig: { maxTokens: 900, temperature: 0.1 },
      }), bedrockRequestOptions(request.timeoutMs));
      return {
        content: response.output?.message?.content ?? [],
        stopReason: response.stopReason,
        modelId,
        ...(response.usage ? { usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens } } : {}),
      };
    } catch (error) {
      // Provider messages name the field or rule that failed and never echo the conversation.
      console.error("Hanger agent model call failed", { name: error instanceof Error ? error.name : "UnknownError", detail: error instanceof Error ? error.message.slice(0, 300) : "", modelId });
      lastError = error;
      if (!mayTryAnotherHangerModel(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  return null;
}
