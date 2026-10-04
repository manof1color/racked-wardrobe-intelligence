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
 */
import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool } from "@aws-sdk/client-bedrock-runtime";
import { BEDROCK_CHAT_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";
import { formatHangerText, hangerModelCandidates, mayTryAnotherHangerModel, normalizeProviderHistory, replyInventsOutfits } from "./hanger-conversation.ts";
import { MAX_OUTFIT_SET, rankOutfit, rankOutfitSet, readOutfitIntent, type OutfitIntent } from "./outfit-ranking.ts";
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
  remembered: string;
  /** Ranking settings the route already applies: history, preferences, rotation, inspiration. */
  rankingBase: Parameters<typeof rankOutfit>[2];
  /** Loaded only if the model asks for trends. */
  loadTrends: () => Promise<TrendSummary | null>;
  today: Date;
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
}

export interface AgentModelResponse { content: ContentBlock[]; stopReason?: string }
export type AgentConverse = (request: { system: string; messages: Message[]; tools: Tool[]; timeoutMs: number }) => Promise<AgentModelResponse | null>;

const text = (value: unknown, maximum: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "");
const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase();

export const AGENT_TOOLS: Tool[] = [
  { toolSpec: {
    name: "search_wardrobe",
    description: "Look up pieces the person owns by colour, category, or words from the name or type. Use it before saying they do or do not own something.",
    inputSchema: { json: { type: "object", properties: {
      color: { type: "string", description: "A colour, e.g. green" },
      category: { type: "string", enum: CATEGORIES },
      text: { type: "string", description: "Words from the piece's name or type, e.g. henley, timbs" },
    } } },
  } },
  { toolSpec: {
    name: "build_outfits",
    description: "Build complete outfits from the person's own wardrobe. The only way to propose an outfit: results appear as cards with photos and Save and Record buttons below your reply.",
    inputSchema: { json: { type: "object", properties: {
      request: { type: "string", description: "What the outfit is for, in the person's words: occasion, style, weather" },
      count: { type: "integer", minimum: 1, maximum: MAX_OUTFIT_SET, description: "How many different outfits" },
      include: { type: "array", items: { type: "string" }, description: "Names of owned pieces that must be in every outfit" },
      exclude: { type: "array", items: { type: "string" }, description: "Names of owned pieces to leave out" },
    }, required: ["request"] } },
  } },
  { toolSpec: {
    name: "get_weather",
    description: "Today's and tomorrow's forecast for where the person is.",
    inputSchema: { json: { type: "object", properties: {} } },
  } },
  { toolSpec: {
    name: "get_trends",
    description: "What people on Racked have been wearing in recent public looks: the most common colours, styles, and pieces. Anonymous totals only.",
    inputSchema: { json: { type: "object", properties: {} } },
  } },
];

/** One line per piece: enough for the model to know what exists without a JSON dump. */
function wardrobeIndex(wardrobe: WardrobeItem[]) {
  const lines = wardrobe.slice(0, WARDROBE_INDEX_LIMIT).map((item) =>
    `- ${item.name} · ${item.category}${item.customType ? ` (${item.customType})` : ""} · ${item.color} · worn ${item.wearCount}×`);
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

export function searchWardrobe(input: unknown, wardrobe: WardrobeItem[]) {
  const query = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const color = lower(text(query.color, 40));
  const category = lower(text(query.category, 20));
  const words = lower(text(query.text, 60)).split(" ").filter((word) => word.length >= 2);
  const matches = wardrobe.filter((item) => {
    if (color && !lower(item.color).includes(color)) return false;
    if (category && lower(item.category) !== category) return false;
    const haystack = lower(`${item.name} ${item.subtype ?? ""} ${item.customType ?? ""} ${item.brand ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
  return {
    count: matches.length,
    pieces: matches.slice(0, 25).map((item) => ({
      name: item.name, category: item.category, type: item.customType ?? item.subtype ?? null, color: item.color,
      wears: item.wearCount, lastWorn: item.lastWornDays > 365 ? "never" : `${item.lastWornDays} days ago`,
    })),
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

/** Why a turn fell back, for the server log. Never includes what the person wrote. */
function fallBack(reason: string): null {
  console.warn("Hanger agent fell back to the grounded reply", { reason });
  return null;
}

/** Runs one turn. Null means "fall back to the grounded reply". */
export async function runHangerAgent(input: AgentInput, call: AgentConverse = bedrockAgentConverse, clock: () => number = Date.now): Promise<AgentResult | null> {
  const started = clock();
  const system = agentSystemPrompt(input);
  const messages: Message[] = [
    ...normalizeProviderHistory(input.history).map((turn): Message => ({ role: turn.role, content: [{ text: turn.content }] })),
    { role: "user", content: [{ text: input.message.slice(0, 1_000) }] },
  ];
  const toolsUsed = new Set<string>();
  const offered = new Set<string>();
  const notFound = new Set<string>();
  let outfits: WardrobeItem[][] = [];
  let intent: OutfitIntent | null = null;
  let corrected = false;

  const runTool = async (name: string | undefined, raw: unknown): Promise<unknown> => {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (name === "search_wardrobe") {
      toolsUsed.add("wardrobe search");
      return searchWardrobe(args, input.wardrobe);
    }
    if (name === "build_outfits") {
      toolsUsed.add("outfit builder");
      const request = text(args.request, 300) || input.message;
      const count = Math.max(1, Math.min(MAX_OUTFIT_SET, Math.round(Number(args.count) || 1)));
      const names = (value: unknown) => (Array.isArray(value) ? value.slice(0, 8).map((entry) => text(entry, 100)).filter(Boolean) : []);
      const include = names(args.include).map((name) => ({ name, item: resolvePieceName(name, input.wardrobe) }));
      const exclude = names(args.exclude).map((name) => resolvePieceName(name, input.wardrobe)).filter((item): item is WardrobeItem => Boolean(item));
      for (const entry of include) if (!entry.item) notFound.add(entry.name);
      const requested = readOutfitIntent(request);
      // The person's own words decide the weather; the forecast fills in only when they said none.
      intent = !requested.weather && input.forecast?.outfitWeather ? { ...requested, weather: input.forecast.outfitWeather } : requested;
      const options = {
        ...input.rankingBase,
        intentOverride: intent,
        requiredItemIds: include.flatMap((entry) => (entry.item ? [entry.item.id] : [])),
        excludedItemIds: [...(input.rankingBase?.excludedItemIds ?? []), ...exclude.map((item) => item.id)],
      };
      outfits = count > 1
        ? rankOutfitSet(input.wardrobe, request, { ...options, count }).map((entry) => entry.outfit.pieces.map((piece) => piece.item))
        : [rankOutfit(input.wardrobe, request, options).pieces.map((piece) => piece.item)].filter((outfit) => outfit.length);
      for (const outfit of outfits) for (const item of outfit) offered.add(item.id);
      return {
        outfits: outfits.map((outfit, index) => ({ number: index + 1, pieces: outfit.map((item) => ({ name: item.name, category: item.category, color: item.color })) })),
        ...(count > outfits.length ? { note: `Only ${outfits.length} distinct outfit${outfits.length === 1 ? "" : "s"} could be made from this wardrobe.` } : {}),
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
    if (remaining < MIN_CALL_MS) return fallBack("out of time");
    const response = await call({ system, messages, tools: AGENT_TOOLS, timeoutMs: Math.min(BEDROCK_CHAT_TIMEOUT_MS, remaining) }).catch(() => null);
    if (!response || !response.content.length) return fallBack("no model response");
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
    if (!reply) return fallBack("empty reply");
    // An outfit list the builder never made: ask once for the tool instead, then give up on it.
    if (!outfits.length && replyInventsOutfits(reply, input.wardrobe)) {
      if (corrected) return fallBack("invented outfits twice");
      corrected = true;
      messages.push({ role: "user", content: [{ text: "Do not write outfit lists yourself. Call build_outfits if outfits are wanted; otherwise answer without listing outfits." }] });
      continue;
    }
    return { message: formatHangerText(reply).slice(0, 2_500), outfits, offered: [...offered], intent, toolsUsed: [...toolsUsed], notFound: [...notFound] };
  }
  return fallBack("too many tool rounds");
}

/** The real model call: Nova Pro first, the next candidate only for a configuration error. */
export async function bedrockAgentConverse(request: Parameters<AgentConverse>[0]): Promise<AgentModelResponse | null> {
  if ((process.env.AI_PROVIDER ?? "").toLowerCase() !== "bedrock") return null;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
  const client = new BedrockRuntimeClient({ region });
  for (const modelId of hangerModelCandidates()) {
    try {
      const response = await client.send(new ConverseCommand({
        modelId,
        system: [{ text: request.system }],
        messages: request.messages,
        toolConfig: { tools: request.tools },
        // Low temperature keeps tool calls well formed; variety comes from the conversation itself.
        inferenceConfig: { maxTokens: 800, temperature: 0.2 },
      }), bedrockRequestOptions(request.timeoutMs));
      return { content: response.output?.message?.content ?? [], stopReason: response.stopReason };
    } catch (error) {
      console.error("Hanger agent model call failed", { name: error instanceof Error ? error.name : "UnknownError", modelId });
      if (!mayTryAnotherHangerModel(error)) return null;
    }
  }
  return null;
}
