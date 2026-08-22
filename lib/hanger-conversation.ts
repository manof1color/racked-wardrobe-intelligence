import { BedrockRuntimeClient, ConverseCommand, type Message } from "@aws-sdk/client-bedrock-runtime";
import type { BrandMetrics } from "./metrics.ts";
import type { AgentChatTurn, BrandCommunityMetrics, BrandProductRegistration } from "./platform-types.ts";
import type { SavedOutfit, WardrobeItem } from "./types.ts";
import { rankOutfit } from "./outfit-ranking.ts";

const MAX_HISTORY_TURNS = 8;
const MAX_MESSAGE_LENGTH = 1_000;

function cleanText(value: unknown, maximum = MAX_MESSAGE_LENGTH) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function sanitizeAgentHistory(value: unknown): AgentChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is Record<string, unknown> => Boolean(turn) && typeof turn === "object")
    .map((turn) => ({
      role: turn.role === "assistant" ? "assistant" as const : "user" as const,
      content: cleanText(turn.content),
    }))
    .filter((turn) => turn.content.length > 0)
    .slice(-MAX_HISTORY_TURNS);
}

export function normalizeProviderHistory(value: unknown): AgentChatTurn[] {
  const normalized: AgentChatTurn[] = [];
  for (const turn of sanitizeAgentHistory(value)) {
    if (normalized.length === 0 && turn.role === "assistant") continue;
    const previous = normalized.at(-1);
    if (previous?.role === turn.role) {
      previous.content = `${previous.content}\n${turn.content}`.slice(-MAX_MESSAGE_LENGTH);
    } else {
      normalized.push({ ...turn });
    }
  }
  if (normalized.at(-1)?.role === "user") normalized.pop();
  return normalized;
}

export function selectGroundedOutfit(wardrobe: WardrobeItem[], message: string, history: AgentChatTurn[] = []) {
  return rankOutfit(wardrobe, message, { history }).pieces.map((piece) => piece.item);
}

/** Full ranking detail — score components and reasons — for evidence and prompting. */
export function explainGroundedOutfit(wardrobe: WardrobeItem[], message: string, history: AgentChatTurn[] = []) {
  return rankOutfit(wardrobe, message, { history });
}

export const MAX_PRIOR_SUGGESTION_IDS = 100;

export function ownedSuggestionItemIds(value: unknown, wardrobe: WardrobeItem[]) {
  if (!Array.isArray(value)) return [];
  const owned = new Set(wardrobe.map((item) => item.id));
  return [...new Set(value.slice(0, MAX_PRIOR_SUGGESTION_IDS * 4)
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 128 && owned.has(id)))]
    .slice(0, MAX_PRIOR_SUGGESTION_IDS);
}

export function hangerOutfitName(suggested: WardrobeItem[]) {
  const names = suggested.map((item) => item.name.trim()).filter(Boolean);
  if (!names.length) return "Hanger outfit";
  const completeName = `Hanger: ${names.join(" + ")}`;
  return completeName.length <= 80 ? completeName : `Hanger outfit · ${names.length} selected pieces`;
}

export function groundedSelectionText(suggested: WardrobeItem[]) {
  if (!suggested.length) return "";
  const lines = suggested.map((item) => `• ${item.name} (${item.category})`).join("\n");
  return `Selected outfit — these exact pieces appear in the photos and Save action:\n${lines}`;
}

/** Reject model prose that names a different owned garment than the ranked selection. */
export function consumerReplyPassesSelectionReview(text: string, wardrobe: WardrobeItem[], suggested: WardrobeItem[]) {
  const selectedIds = new Set(suggested.map((item) => item.id));
  const normalized = text.toLocaleLowerCase();
  return !wardrobe.some((item) => {
    if (selectedIds.has(item.id)) return false;
    const name = item.name.trim().toLocaleLowerCase();
    return name.length >= 4 && normalized.includes(name);
  });
}

function consumerContext(wardrobe: WardrobeItem[], outfits: SavedOutfit[], suggested: WardrobeItem[], required: WardrobeItem[] = []) {
  const requiredIds = new Set(required.map((item) => item.id));
  return {
    wardrobe: wardrobe.slice(0, 60).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color,
      style: item.style,
      wearCount: item.wearCount,
      lastWornDays: item.lastWornDays,
      brand: item.brand ?? null,
      identityStatus: item.identityStatus ?? "unverified",
    })),
    savedOutfits: outfits.slice(0, 20).map((outfit) => ({
      name: outfit.name,
      itemIds: outfit.itemIds,
      wears: outfit.wears,
    })),
    candidateOutfit: suggested.map((item) => ({ id: item.id, name: item.name, category: item.category, directlyRequested: requiredIds.has(item.id) })),
  };
}

export function buildConsumerHangerPrompt(input: {
  message: string;
  wardrobe: WardrobeItem[];
  outfits: SavedOutfit[];
  suggested: WardrobeItem[];
  required?: WardrobeItem[];
}) {
  return `Fresh private wardrobe context for this turn: ${JSON.stringify(consumerContext(input.wardrobe, input.outfits, input.suggested, input.required))}\nCustomer message: ${JSON.stringify(cleanText(input.message))}`;
}

function releasedBrandContext(product: BrandProductRegistration, metrics: BrandMetrics, communityMetrics?:BrandCommunityMetrics) {
  return {
    product: { name: product.name, sku: product.sku, category: product.category, brand: product.brand },
    privacyRelease: metrics.suppressed ? {
      released: false,
      rule: `No product-wear aggregates are released below ${metrics.minimumCohortSize} eligible opted-in owners.`,
    } : {
      released: true,
      eligibleOwners: metrics.segmentSize,
      actualWears: metrics.actualWears,
      activeOwners: metrics.activeOwners,
      engagementRate: metrics.engagementRate,
      repeatWearRate: metrics.repeatWearRate,
      averageWearsPerOwner: metrics.averageWearsPerOwner,
      medianWearsPerOwner: metrics.medianWearsPerOwner,
      zeroWearOwners: metrics.zeroWearOwners,
      highFrequencyOwners: metrics.highFrequencyOwners,
      lastWearAt: metrics.lastWearAt,
      wearDistribution: metrics.wearDistribution,
      weeklyTrend: metrics.weeklyTrend,
    },
    ...(communityMetrics?{publicCommunityActivity:{publicOutfitAppearances:communityMetrics.publicOutfitAppearances,consumerOutfitAppearances:communityMetrics.consumerOutfitAppearances,brandLookAppearances:communityMetrics.brandLookAppearances,inspirationCount:communityMetrics.inspirationCount,recreateLookRequests:communityMetrics.recreateLookRequests,outboundProductClicks:communityMetrics.outboundProductClicks,pairedCategories:communityMetrics.pairedCategories,pairedVerifiedProducts:communityMetrics.pairedVerifiedProducts,privacyBoundary:communityMetrics.privacyBoundary}}:{}),
  };
}

export function buildBrandHangerPrompt(input: {
  message: string;
  product: BrandProductRegistration;
  metrics: BrandMetrics;
  communityMetrics?: BrandCommunityMetrics;
}) {
  return `Fresh brand-owned, privacy-filtered context for this turn: ${JSON.stringify(releasedBrandContext(input.product, input.metrics,input.communityMetrics))}\nBrand message: ${JSON.stringify(cleanText(input.message))}`;
}

async function converse(system: string, history: AgentChatTurn[], prompt: string) {
  if ((process.env.AI_PROVIDER ?? "").toLowerCase() !== "bedrock") return null;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
  const modelId = process.env.AI_HANGER_MODEL ?? process.env.AI_MODEL ?? "amazon.nova-lite-v1:0";
  const messages: Message[] = [
    ...normalizeProviderHistory(history).map((turn): Message => ({ role: turn.role, content: [{ text: turn.content }] })),
    { role: "user", content: [{ text: prompt }] },
  ];
  try {
    const response = await new BedrockRuntimeClient({ region }).send(new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages,
      inferenceConfig: { maxTokens: 650, temperature: 0.25 },
    }));
    const text = response.output?.message?.content?.find((block) => "text" in block)?.text?.trim();
    return text ? formatHangerText(text).slice(0, 2_500) : null;
  } catch (error) {
    console.error("Hanger conversation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown provider failure",
      region,
      modelId,
    });
    return null;
  }
}

export function formatHangerText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^-\s+/gm, "• ")
    .trim();
}

export function brandReplyPassesPrivacyReview(text: string) {
  const prohibited = /\b(personali[sz]ed|send (?:an? )?(?:email|message|reminder)|email (?:owners|customers)|contact (?:owners|customers)|target (?:the )?\d+ owners|target (?:owners|customers)|owners who|discount code|special offer|survey|early access|we can assume|individual outreach|direct outreach)\b/i;
  return !prohibited.test(text);
}

export async function generateConsumerHangerReply(input: {
  message: string;
  history: AgentChatTurn[];
  wardrobe: WardrobeItem[];
  outfits: SavedOutfit[];
  suggested: WardrobeItem[];
  required?: WardrobeItem[];
}) {
  const system = "You are Hanger, Racked's conversational wardrobe stylist. Answer the customer's latest question naturally and use only the supplied current wardrobe as owned inventory. When candidateOutfit is present, those are the exact selected pieces: discuss those pieces only and do not substitute, add, or rename a garment. A candidate marked directlyRequested was explicitly required by the customer; acknowledge that it was kept for that reason and never claim it was chosen because it was underused. Refer to items by their supplied names, explain styling choices, and ask one useful follow-up when it would improve the result. Never infer body shape, gender, age, ethnicity, income, or health. Never claim live weather access. Clearly label any general shopping idea as not currently owned. Do not expose internal IDs or repeat the raw context JSON. Write plain text with short paragraphs or simple bullets; do not use Markdown headings, bold markers, tables, or code fences.";
  const generated = await converse(system, input.history, buildConsumerHangerPrompt(input));
  const groundedSelection = groundedSelectionText(input.suggested);
  if (generated && consumerReplyPassesSelectionReview(generated, input.wardrobe, input.suggested)) {
    return { message: `${generated}${groundedSelection ? `\n\n${groundedSelection}` : ""}`, usedModel: true };
  }
  if (generated) console.warn("Hanger rejected a consumer response that named a garment outside the canonical selection.");
  if (input.wardrobe.length === 0) return { message: "I can help you plan a wardrobe, but I do not see any saved garments yet. Add your front, back, and label photos first, then ask me for an outfit, rotation, or gap analysis. What kind of outfit do you want to build first?", usedModel: false };
  const names = input.suggested.map((item) => item.name);
  if (names.length === 0) return { message: "I can see your wardrobe, but I could not form a grounded outfit from the current item details. Tell me the occasion and the type of piece you want to start with.", usedModel: false };
  const requestedNames = (input.required ?? []).map((item) => item.name);
  const selectionReason = requestedNames.length
    ? `I kept ${requestedNames.join(", ")} because you explicitly asked to use ${requestedNames.length === 1 ? "that piece" : "those pieces"}, then built the rest of the outfit around ${requestedNames.length === 1 ? "it" : "them"}.`
    : "I prioritized lower-wear pieces to bring more of your closet into rotation.";
  return { message: `I pulled your latest wardrobe. ${selectionReason}\n\n${groundedSelection}\n\nWhat occasion, weather, or dress code should I refine this for?`, usedModel: false };
}

export async function generateBrandHangerReply(input: {
  message: string;
  history: AgentChatTurn[];
  product: BrandProductRegistration;
  metrics: BrandMetrics;
  communityMetrics?: BrandCommunityMetrics;
}) {
  const system = "You are Hanger, Racked's conversational brand strategist. Answer the latest question with practical product, retention, merchandising, and campaign strategy grounded only in the supplied brand-owned product and privacy-released aggregates. Never invent metrics or claim causation, revenue lift, purchase intent, identities, demographics, or individual customer behavior. The brand cannot identify cohort members: never recommend personalized outreach, contacting or targeting owners, messages or emails based on wear status, discounts for a wear cohort, or treating an aggregate count as a contact list. Strategies must operate through public content, general merchandising, product education, or anonymous aggregate measurement. If aggregates are not released, discuss only general strategy and explain that evidence-based conclusions must wait for the privacy threshold. Do not expose internal IDs or raw context JSON. Ask a focused follow-up when useful. Write plain text with short paragraphs or simple bullets; do not use Markdown headings, bold markers, tables, or code fences.";
  const generated = await converse(system, input.history, buildBrandHangerPrompt(input));
  if (generated && brandReplyPassesPrivacyReview(generated)) return { message: generated, usedModel: true };
  if (generated) console.warn("Hanger rejected a brand strategy response that crossed the aggregate-only boundary.");
  if (input.metrics.suppressed) return { message: `I can discuss general strategy for ${input.product.name}, but I cannot make evidence-based wear claims until the privacy-safe cohort reaches ${input.metrics.minimumCohortSize} eligible opted-in owners. We could work now on a launch, education, or styling strategy that makes no customer-behavior claims. Which goal matters most?`, usedModel: false };
  return { message: `${input.product.name} currently has ${input.metrics.actualWears ?? 0} confirmed wears across ${input.metrics.activeOwners ?? 0} active owners, with ${input.metrics.repeatWearRate ?? 0}% repeat wear.\n\nA privacy-safe 30-day plan:\n• Days 1–7: publish public styling education built around several ways to wear the product.\n• Days 8–14: feature aggregate repeat-wear evidence in general product storytelling, clearly labeled as measured usage.\n• Days 15–21: improve product-page pairings and community outfit inspiration without identifying cohort members.\n• Days 22–30: compare the next thresholded aggregate trend with this baseline and decide which public content to continue.\n\nDo not contact or target people based on wear status; Racked does not reveal who belongs to any frequency group. Which public channel should we shape this plan for?`, usedModel: false };
}
