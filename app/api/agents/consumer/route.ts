import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GARMENT_TAXONOMY } from "@/lib/garment-taxonomy";
import { consumerOutfitContract, generateConsumerHangerReply, ownedSuggestionItemIds } from "@/lib/hanger-conversation";
import { appendTurns, avoidedItemIds, conversationForPrompt, earlierConversationNote, extractPreferences, mergePreferences, preferenceSummary, rememberActiveOutfit, rememberSuggestedItemIds } from "@/lib/hanger-memory";
import { allowedOutfitActions, planHangerTurn } from "@/lib/hanger-turn";
import { rankOutfit, scoreOwnedPieces, STYLE_VOCABULARY } from "@/lib/outfit-ranking";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { clearHangerConversation, getConsumerInspirationProfile, listOutfits, listWardrobe, loadHangerConversation, saveHangerConversation } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";
import type { WardrobeItem } from "@/lib/types";

/**
 * The words a standing preference may be stated in: the controlled taxonomy, the styles the ranker
 * understands, and the colours this person's own wardrobe actually contains. Anything outside this
 * vocabulary is never stored, so a sentence about a person leaves nothing behind.
 */
function preferenceVocabulary(wardrobe: WardrobeItem[]) {
  const subtypes = new Set<string>();
  for (const list of Object.values(GARMENT_TAXONOMY)) for (const subtype of list) subtypes.add(subtype.replace(/-/g, " "));
  return {
    subtypes: [...subtypes],
    categories: Object.keys(GARMENT_TAXONOMY),
    colors: [...new Set(wardrobe.map((item) => String(item.color ?? "").toLowerCase()).filter(Boolean))],
    styles: STYLE_VOCABULARY,
  };
}

async function consumerSession() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) };
  if (session.role !== "consumer") return { error: NextResponse.json({ error: "Consumer account required." }, { status: 403 }) };
  return { session };
}

/** Reopening Hanger continues the account's conversation rather than starting a new one. */
export async function GET() {
  const { session, error } = await consumerSession();
  if (error) return error;
  try {
    const state = await loadHangerConversation(session!.subject);
    return NextResponse.json({ turns: state.turns, remembered: preferenceSummary(state.preferences), earlierTurnCount: state.earlierTurnCount });
  } catch (reason) {
    console.error("Hanger conversation could not be loaded", { name: reason instanceof Error ? reason.name : "UnknownError" });
    return NextResponse.json({ turns: [], remembered: "", earlierTurnCount: 0 });
  }
}

/** Forgetting is the person's to do: the record is theirs, and clearing it removes it. */
export async function DELETE() {
  const { session, error } = await consumerSession();
  if (error) return error;
  try {
    await clearHangerConversation(session!.subject);
    return NextResponse.json({ cleared: true });
  } catch (reason) {
    console.error("Hanger conversation could not be cleared", { name: reason instanceof Error ? reason.name : "UnknownError" });
    return NextResponse.json({ error: "The conversation could not be cleared. Try again." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await consumerSession();
  if (error) return error;
  const subject = session!.subject;
  const limit = consumeRateLimit(`consumer-agent:${subject}`, RATE_LIMIT_RULES.consumerAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Hanger is receiving messages too quickly. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const parsedBody = await request.json().catch(() => ({})) as unknown;
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody as { message?: unknown; occasion?: unknown; weather?: unknown } : {};
  const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "my plans";
  const weather = typeof body.weather === "string" ? body.weather.trim() : "";
  const legacyMessage = `Build an outfit for ${occasion || "my plans"}${weather ? ` in ${weather}` : ""}.`;
  const message = (typeof body.message === "string" ? body.message.trim() : legacyMessage).slice(0, 1_000);
  if (!message) return NextResponse.json({ error: "Tell Hanger what you would like help with." }, { status: 400 });

  const [wardrobe, outfits, inspiration, stored] = await Promise.all([listWardrobe(subject), listOutfits(subject), getConsumerInspirationProfile(subject), loadHangerConversation(subject)]);
  // The conversation is the account's, not the browser's, and the context window is spent
  // deliberately: the newest turns that fit a character budget, with older ones counted, not faked.
  const { history, omittedTurnCount } = conversationForPrompt(stored);
  const preferences = mergePreferences(stored.preferences, extractPreferences(message, preferenceVocabulary(wardrobe)));
  const remembered = preferenceSummary(preferences);
  const previousSuggestionItemIds = ownedSuggestionItemIds(stored.suggestedItemIds, wardrobe);
  const mostRecentSavedItemIds = outfits[0]?.itemIds ?? [];
  const plan = planHangerTurn({ wardrobe, message, activeOutfit: stored.activeOutfit });
  const activeOwnedItems = plan.activeItemIds.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
  const producesOutfit = plan.mode === "create" || plan.mode === "revise";
  const ranked = producesOutfit ? rankOutfit(wardrobe, message, {
    history,
    intentOverride: plan.intent,
    maxPieces: plan.maxPieces,
    requiredItemIds: plan.requiredItemIds,
    excludedItemIds: [...plan.excludedItemIds, ...avoidedItemIds(preferences, wardrobe)],
    avoidItemIds: [...previousSuggestionItemIds, ...mostRecentSavedItemIds],
    rotatePriorSuggestions: plan.rotatePriorSuggestions,
    inspirationStyleHints: inspiration.styleHints,
  }) : null;
  const suggested = ranked
    ? ranked.pieces.map((piece) => piece.item)
    : (plan.mode === "explain" || plan.mode === "save-confirm" || plan.mode === "wear-confirm") ? activeOwnedItems : [];
  const required = (ranked?.requiredPieceIds ?? []).map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
  const actionMode = allowedOutfitActions(plan.mode, message);
  const contract = consumerOutfitContract(suggested, actionMode);
  const selection = contract.selection ?? [];
  const actions = contract.actions;
  const explainedPieces = ranked?.pieces ?? (plan.mode === "explain" ? scoreOwnedPieces(suggested, plan.intent) : []);
  const selectionReasons = Object.fromEntries(explainedPieces.map((piece) => [piece.item.id, piece.reasons]));
  const generated = await generateConsumerHangerReply({
    message,
    history,
    wardrobe,
    outfits,
    suggested,
    required,
    inspiration,
    remembered,
    earlierConversation: earlierConversationNote(omittedTurnCount),
    turnMode: plan.mode,
    activeBefore: activeOwnedItems,
    selectionReasons,
    styleSource: ranked?.intent.styleSource ?? plan.intent.styleSource,
  });
  const reply: AgentReply = {
    agent: "consumer-stylist",
    provider: generated.usedModel ? "amazon-bedrock" : "grounded-wardrobe",
    message: generated.message,
    confidence: suggested.length >= 3 ? "high" : suggested.length ? "medium" : "low",
    toolsUsed: ["private wardrobe", "wear history", "saved outfits", ...(ranked?.intent.styleSource === "inspiration" ? ["saved Community inspiration"] : []), ...(remembered ? ["remembered preferences"] : []), "conversation memory"],
    actions,
    selection,
    evidence: [
      `${wardrobe.length} owned garments checked this turn`,
      `${outfits.length} saved outfits checked this turn`,
      `Conversation mode: ${plan.mode}`,
      ...(plan.contextUsed ? ["Follow-up resolved against this account's current outfit"] : []),
      ...(history.length ? [`${history.length} earlier message${history.length === 1 ? "" : "s"} from this conversation were in context`] : []),
      ...(omittedTurnCount ? [`${omittedTurnCount} older message${omittedTurnCount === 1 ? "" : "s"} fell outside the context budget and were not quoted`] : []),
      ...(remembered ? [`Remembered preferences applied: ${remembered}`] : []),
      ...(ranked?.intent.styleSource === "inspiration" ? [`${inspiration.lookCount} intentionally saved Community Look${inspiration.lookCount === 1 ? "" : "s"} supplied private style signals; current instructions remained authoritative`] : []),
      ...explainedPieces.map((piece) => `${piece.item.name}: ${piece.reasons[0] ?? "scored against this request"}`),
      ...(required.length ? [`${required.map((item) => item.name).join(", ")} locked because the customer explicitly requested ${required.length === 1 ? "it" : "them"}`] : []),
      ...(ranked && ranked.setAside > 0 ? [`${ranked.setAside} piece${ranked.setAside === 1 ? "" : "s"} already suggested earlier in this conversation were set aside`] : []),
      "Only this signed-in account's wardrobe was available",
    ],
  };

  try {
    let nextState = appendTurns({ ...stored, preferences }, [{ role: "user", content: message }, { role: "assistant", content: reply.message }]);
    if (ranked && selection.length) {
      nextState = rememberSuggestedItemIds(nextState, selection.map((item) => item.id));
      nextState = rememberActiveOutfit(nextState, selection.map((item) => item.id), ranked.intent);
    }
    await saveHangerConversation(subject, nextState);
  } catch (reason) {
    // A reply the person can already see is worth more than a perfectly stored transcript.
    console.error("Hanger conversation could not be saved", { name: reason instanceof Error ? reason.name : "UnknownError" });
  }
  return NextResponse.json({ reply, remembered });
}
