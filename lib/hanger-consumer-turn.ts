/**
 * One Consumer Hanger turn, from the message to the reply and the conversation to store.
 *
 * This is the body of POST /api/agents/consumer, moved out of the route so that it can be run
 * without a session, a table or a network: the route loads the account's data and calls this; the
 * blind evaluation (scripts/run-hanger-evaluation.mjs) calls this with a synthetic closet. Before
 * the move the evaluation called the agent directly with empty ranking settings and recorded
 * "no outfit" whenever the agent fell back — two things a person using the app never sees, because
 * the route supplies the settings and answers a fallback from the wardrobe. What is measured is now
 * what is shipped.
 *
 * It does no input or output of its own. The model callers are handed in, already metered by
 * whoever is paying for them, so nothing here can reach a model without a meter.
 */
import { GARMENT_TAXONOMY } from "./garment-taxonomy.ts";
import { AI_PAUSED_REASON } from "./abuse-limits.ts";
import { consumerOutfitContract, generateConsumerHangerReply, hangerOutfitName, outfitCards, ownedSuggestionItemIds, type ConsumerInspirationContext } from "./hanger-conversation.ts";
import { describeAgentFailure, plainReplyWorthTrying, runHangerAgent, type AgentConverse, type AgentFailure, type TrendSummary } from "./hanger-agent.ts";
import { appendTurns, avoidedItemIds, conversationForPrompt, earlierConversationNote, extractPreferences, mergePreferences, preferenceSummary, rememberActiveOutfit, rememberPendingRequest, rememberSuggestedItemIds, type HangerConversationState } from "./hanger-memory.ts";
import { allowedOutfitActions, planHangerTurn, replyAsksBack } from "./hanger-turn.ts";
import { MAX_OUTFIT_SET, rankOutfit, rankOutfitSet, readOutfitIntent, repeatedPiecesInSet, scoreOwnedPieces, STYLE_VOCABULARY } from "./outfit-ranking.ts";
import type { Forecast } from "./weather.ts";
import type { AgentChatTurn, AgentReply } from "./platform-types.ts";
import type { SavedOutfit, WardrobeItem } from "./types.ts";

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

/** The intent a request carries on its own, for remembering an agent-built outfit. */
function plan0Intent(message: string) {
  return readOutfitIntent(message);
}

export interface ConsumerHangerTurnInput {
  message: string;
  wardrobe: WardrobeItem[];
  /** The account's saved outfits, newest first. */
  outfits: SavedOutfit[];
  inspiration: ConsumerInspirationContext;
  /** The conversation as stored on the account before this message. */
  stored: HangerConversationState;
  forecast: Forecast | null;
  /** Whether a model provider is configured at all. */
  agentEnabled: boolean;
  /** True when the day's AI allowance refused this message: Hanger answers from the wardrobe alone. */
  aiPaused: boolean;
  today: Date;
  loadTrends: () => Promise<TrendSummary | null>;
  /** The tool-using model call, already metered. */
  agentCall: AgentConverse;
  /** The plain model reply of the grounded pipeline, already metered; null means "no model answer". */
  plainCall: (system: string, history: AgentChatTurn[], prompt: string) => Promise<string | null>;
}

export interface ConsumerHangerTurn {
  reply: AgentReply;
  remembered: string;
  /** The conversation to store. Saving it is the caller's job, and may fail without losing the reply. */
  nextState: HangerConversationState;
}

export async function runConsumerHangerTurn(input: ConsumerHangerTurnInput): Promise<ConsumerHangerTurn> {
  const { message, wardrobe, outfits, inspiration, stored, forecast, aiPaused } = input;
  // The conversation is the account's, not the browser's, and the context window is spent
  // deliberately: the newest turns that fit a character budget, with older ones counted, not faked.
  const { history, omittedTurnCount } = conversationForPrompt(stored);
  const preferences = mergePreferences(stored.preferences, extractPreferences(message, preferenceVocabulary(wardrobe)));
  const remembered = preferenceSummary(preferences);
  const previousSuggestionItemIds = ownedSuggestionItemIds(stored.suggestedItemIds, wardrobe);
  const mostRecentSavedItemIds = outfits[0]?.itemIds ?? [];
  // Hanger as an agent first: the model reads the message and calls the tools it needs — wardrobe
  // search, the outfit builder, the forecast, Racked trends. If it cannot answer inside its time
  // budget, or the model is unavailable, the grounded pipeline below answers instead.
  const agentAttempted = input.agentEnabled && !aiPaused;
  // Why the agent did not answer, when it did not — shown with the reply so a live failure names itself.
  const agentOutcome: { failure: AgentFailure | null } = { failure: null };
  if (agentAttempted) {
    const onScreen = (stored.activeOutfit?.itemIds ?? []).map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
    const agent = await runHangerAgent({
      message, history, wardrobe, forecast, activeOutfit: onScreen, activeIntent: stored.activeOutfit?.intent ?? null, remembered, today: input.today,
      rankingBase: {
        history,
        excludedItemIds: avoidedItemIds(preferences, wardrobe),
        avoidItemIds: [...previousSuggestionItemIds, ...mostRecentSavedItemIds],
        rotatePriorSuggestions: onScreen.length > 0,
        inspirationStyleHints: inspiration.styleHints,
      },
      loadTrends: input.loadTrends,
      onFallback: (failure) => { agentOutcome.failure = failure; },
    }, input.agentCall).catch(() => null);
    if (agent) {
      const agentActions = allowedOutfitActions("create", message);
      const first = agent.outfits[0] ?? [];
      const agentContract = consumerOutfitContract(first, agentActions);
      const agentSet = agent.outfits.length > 1 ? outfitCards(agent.outfits, agentActions) : undefined;
      const built = agent.toolsUsed.includes("outfit builder");
      const agentReply: AgentReply = {
        agent: "consumer-stylist",
        provider: "amazon-bedrock",
        message: agent.message,
        confidence: first.length >= 3 ? "high" : "medium",
        toolsUsed: ["private wardrobe", ...agent.toolsUsed, ...(remembered ? ["remembered preferences"] : []), "conversation memory"],
        actions: agentContract.actions,
        selection: agentContract.selection ?? [],
        ...(agentSet ? { outfits: agentSet } : {}),
        evidence: [
          `${wardrobe.length} owned garments available this turn`,
          ...(built ? [`${agent.outfits.length} outfit${agent.outfits.length === 1 ? "" : "s"} built from your own wardrobe by the outfit builder`] : []),
          // What the builder had to say about its own result: a slot the closet could not fill, a
          // piece it left out, the swap it made. Shown whether or not the model repeated it.
          ...agent.notes,
          ...(agent.toolsUsed.includes("wardrobe search") ? ["Searched your wardrobe"] : []),
          ...(agent.toolsUsed.includes("weather") && forecast ? [`Forecast for ${forecast.place} from Open-Meteo`] : []),
          ...(agent.toolsUsed.includes("Racked trends") ? ["Trends from recent public Racked looks — anonymous totals"] : []),
          ...(agent.notFound.length ? [`Not found in your wardrobe: ${agent.notFound.join(", ")}`] : []),
          "The stylist model chose which tools to use and wrote this reply",
          "Only this signed-in account's wardrobe was available",
        ],
      };
      let nextState = appendTurns({ ...stored, preferences }, [{ role: "user", content: message }, { role: "assistant", content: agentReply.message }]);
      if (first.length) {
        nextState = rememberSuggestedItemIds(nextState, agent.offered);
        nextState = rememberActiveOutfit(nextState, first.map((item) => item.id), agent.intent ?? plan0Intent(message));
      }
      // The agent follows the conversation itself, so nothing is held open for the keyword rules.
      nextState = rememberPendingRequest(nextState, null);
      return { reply: agentReply, remembered, nextState };
    }
  }

  const plan = planHangerTurn({ wardrobe, message, activeOutfit: stored.activeOutfit, pendingRequest: stored.pendingRequest });
  // Weather the person states always wins. Only when they said nothing about it does the forecast
  // decide — "something for tonight" on a cold, wet evening should not come back in linen shorts.
  const turnIntent = !plan.intent.weather && forecast?.outfitWeather ? { ...plan.intent, weather: forecast.outfitWeather } : plan.intent;
  // What this turn is really answering: the latest message, or the request it completes.
  const requestText = plan.effectiveMessage;
  const activeOwnedItems = plan.activeItemIds.map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
  const producesOutfit = plan.mode === "create" || plan.mode === "revise";
  const requestedCount = plan.outfitCount;
  const rankingOptions = {
    history,
    intentOverride: turnIntent,
    maxPieces: plan.maxPieces,
    requiredItemIds: plan.requiredItemIds,
    excludedItemIds: [...plan.excludedItemIds, ...avoidedItemIds(preferences, wardrobe)],
    avoidItemIds: [...previousSuggestionItemIds, ...mostRecentSavedItemIds],
    rotatePriorSuggestions: plan.rotatePriorSuggestions,
    inspirationStyleHints: inspiration.styleHints,
  };
  const set = producesOutfit && requestedCount > 1 ? rankOutfitSet(wardrobe, requestText, { ...rankingOptions, count: requestedCount }) : [];
  const ranked = set.length ? set[0].outfit : producesOutfit ? rankOutfit(wardrobe, requestText, rankingOptions) : null;
  const suggested = ranked
    ? ranked.pieces.map((piece) => piece.item)
    : (plan.mode === "explain" || plan.mode === "save-confirm" || plan.mode === "wear-confirm") ? activeOwnedItems : [];
  const required = (ranked?.requiredPieceIds ?? []).map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
  const actionMode = allowedOutfitActions(plan.mode, message);
  const contract = consumerOutfitContract(suggested, actionMode);
  const selection = contract.selection ?? [];
  const actions = contract.actions;
  const explainedPieces = ranked?.pieces ?? (plan.mode === "explain" ? scoreOwnedPieces(suggested, turnIntent) : []);
  const selectionReasons = Object.fromEntries(explainedPieces.map((piece) => [piece.item.id, piece.reasons]));
  const generated = await generateConsumerHangerReply({
    message: requestText,
    // After a fast rejection of the tool-using call, the plain model reply still gets its turn;
    // after a slow or throttled one it does not, so the wait never doubles.
    allowModel: !aiPaused && (!agentAttempted || plainReplyWorthTrying(agentOutcome.failure)),
    outfitCount: set.length || (ranked ? 1 : 0),
    alsoShown: set.slice(1).flatMap(({ outfit }) => outfit.pieces.map((piece) => piece.item)),
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
    forecast,
    clarification: plan.clarification,
  }, input.plainCall);
  // What the reply owes the person about this outfit, whoever wrote the words: a slot the closet
  // could not fill, or a swap that could only come close to what was asked.
  const honestNotes = [...(ranked?.missing ?? []).map((gap) => gap.note), ...(plan.swapNote && ranked ? [plan.swapNote] : [])];
  const outfitSet: AgentReply["outfits"] = set.length > 1 ? set.map(({ index, outfit }): NonNullable<AgentReply["outfits"]>[number] => {
    const pieces = outfit.pieces.map((piece) => ({
      id: piece.item.id,
      name: piece.item.name,
      category: piece.item.category,
      ...(piece.item.imageUrl ? { imageUrl: piece.item.imageUrl } : {}),
    }));
    const itemIds = pieces.map((piece) => piece.id).join(",");
    return {
      title: `Outfit ${index}`,
      pieces,
      actions: [
        ...(actionMode === "both" || actionMode === "save" ? [{ label: `Save outfit ${index}`, type: `save-outfit-${index}`, payload: { itemIds, name: hangerOutfitName(outfit.pieces.map((piece) => piece.item)) } }] : []),
        ...(actionMode === "both" || actionMode === "record" ? [{ label: `Record outfit ${index} as worn`, type: `record-outfit-${index}`, payload: { itemIds } }] : []),
      ],
    };
  }) : undefined;
  const reply: AgentReply = {
    agent: "consumer-stylist",
    provider: generated.usedModel ? "amazon-bedrock" : "grounded-wardrobe",
    message: honestNotes.length ? `${generated.message}\n\n${honestNotes.join(" ")}`.slice(0, 2_500) : generated.message,
    confidence: suggested.length >= 3 ? "high" : suggested.length ? "medium" : "low",
    toolsUsed: ["private wardrobe", "wear history", "saved outfits", ...(ranked?.intent.styleSource === "inspiration" ? ["saved Community inspiration"] : []), ...(remembered ? ["remembered preferences"] : []), "conversation memory"],
    actions,
    selection,
    ...(outfitSet ? { outfits: outfitSet } : {}),
    ...(aiPaused ? { degradedReason: AI_PAUSED_REASON } : agentOutcome.failure ? { degradedReason: describeAgentFailure(agentOutcome.failure) } : {}),
    evidence: [
      `${wardrobe.length} owned garments checked this turn`,
      ...(forecast ? [`Forecast for ${forecast.place} from Open-Meteo${turnIntent.weather && !plan.intent.weather ? ` — dressed for ${turnIntent.weather} weather` : ""}`] : []),
      ...(repeatedPiecesInSet(set) > 0 ? [`${repeatedPiecesInSet(set)} piece${repeatedPiecesInSet(set) === 1 ? "" : "s"} appear in more than one outfit — your closet has fewer of those than the set needed`] : []),
      ...(plan.effectiveMessage !== message ? ["This answered the request still open from an earlier message"] : []),
      ...(requestedCount > 1 ? [set.length >= requestedCount
        ? `${set.length} outfits built, sharing no pieces`
        : `${set.length} outfit${set.length === 1 ? "" : "s"} built of the ${requestedCount} asked for — your closet ran out of unused pieces${turnIntent.occasion ? ` that suit ${turnIntent.occasion}` : ""}${requestedCount >= MAX_OUTFIT_SET ? `, and a set stops at ${MAX_OUTFIT_SET}` : ""}`] : []),
      `${outfits.length} saved outfits checked this turn`,
      `Conversation mode: ${plan.mode}`,
      ...(plan.contextUsed ? ["Follow-up resolved against this account's current outfit"] : []),
      ...(plan.changedCategories.length && ranked ? [`Changed only the ${plan.changedCategories.join(" and ")} and kept the rest of the outfit`] : []),
      ...honestNotes,
      ...(history.length ? [`${history.length} earlier message${history.length === 1 ? "" : "s"} from this conversation were in context`] : []),
      ...(omittedTurnCount ? [`${omittedTurnCount} older message${omittedTurnCount === 1 ? "" : "s"} fell outside the context budget and were not quoted`] : []),
      ...(remembered ? [`Remembered preferences applied: ${remembered}`] : []),
      ...(ranked?.intent.styleSource === "inspiration" ? [`${inspiration.lookCount} intentionally saved Community Look${inspiration.lookCount === 1 ? "" : "s"} supplied private style signals; current instructions remained authoritative`] : []),
      ...explainedPieces.map((piece) => `${piece.item.name}: ${piece.reasons[0] ?? "scored against this request"}`),
      ...(required.length ? [`${required.map((item) => item.name).join(", ")} locked because the customer explicitly requested ${required.length === 1 ? "it" : "them"}`] : []),
      ...(ranked && ranked.setAside > 0 ? [`${ranked.setAside} piece${ranked.setAside === 1 ? "" : "s"} already suggested earlier in this conversation were set aside`] : []),
      ...(agentOutcome.failure ? [`Hanger's tool-using stylist did not answer: ${describeAgentFailure(agentOutcome.failure)}`] : []),
      generated.usedModel
        ? "The stylist model wrote this reply from the selection above"
        : "The stylist model did not answer this turn, so this reply is composed from your wardrobe alone",
      "Only this signed-in account's wardrobe was available",
    ],
  };

  let nextState = appendTurns({ ...stored, preferences }, [{ role: "user", content: message }, { role: "assistant", content: reply.message }]);
  if (ranked && selection.length) {
    // Every piece offered this turn is remembered, so a follow-up rotates past the whole set,
    // while the active outfit — what "those" and "keep the shoes" refer to — stays the first one.
    const offered = (outfitSet ?? [{ pieces: selection }]).flatMap((entry) => entry.pieces).map((item) => item.id);
    nextState = rememberSuggestedItemIds(nextState, offered);
    nextState = rememberActiveOutfit(nextState, selection.map((item) => item.id), ranked.intent);
  }
  // Held open only when this reply actually asked something back.
  nextState = rememberPendingRequest(nextState, replyAsksBack(reply.message) ? plan.pendingRequest : null);
  return { reply, remembered, nextState };
}
