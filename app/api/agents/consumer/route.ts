import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { GARMENT_TAXONOMY } from "@/lib/garment-taxonomy";
import { consumerOutfitContract, generateConsumerHangerReply, hangerOutfitName, outfitCards, ownedSuggestionItemIds } from "@/lib/hanger-conversation";
import { describeAgentFailure, isAgentEnabled, plainReplyWorthTrying, runHangerAgent, summarizeCommunityTrends, type AgentFailure } from "@/lib/hanger-agent";
import { appendTurns, avoidedItemIds, conversationForPrompt, earlierConversationNote, extractPreferences, mergePreferences, preferenceSummary, rememberActiveOutfit, rememberPendingRequest, rememberSuggestedItemIds } from "@/lib/hanger-memory";
import { allowedOutfitActions, planHangerTurn, replyAsksBack } from "@/lib/hanger-turn";
import { MAX_OUTFIT_SET, rankOutfit, rankOutfitSet, readOutfitIntent, repeatedPiecesInSet, scoreOwnedPieces, STYLE_VOCABULARY } from "@/lib/outfit-ranking";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { clearHangerConversation, getConsumerInspirationProfile, getHomeCity, listCommunityPosts, listOutfits, listWardrobe, loadHangerConversation, saveHangerConversation } from "@/lib/server/production-store";
import { fetchForecast, validCoordinates, type Forecast } from "@/lib/weather";
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

/** The intent a request carries on its own, for remembering an agent-built outfit. */
function plan0Intent(message: string) {
  return readOutfitIntent(message);
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
    const homeCity = await getHomeCity(session!.subject).catch(() => null);
    return NextResponse.json({ turns: state.turns, remembered: preferenceSummary(state.preferences), earlierTurnCount: state.earlierTurnCount, weatherPlace: homeCity?.name ?? null });
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
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody as { message?: unknown; occasion?: unknown; weather?: unknown; location?: { latitude?: unknown; longitude?: unknown } } : {};
  const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "my plans";
  const weather = typeof body.weather === "string" ? body.weather.trim() : "";
  const legacyMessage = `Build an outfit for ${occasion || "my plans"}${weather ? ` in ${weather}` : ""}.`;
  const message = (typeof body.message === "string" ? body.message.trim() : legacyMessage).slice(0, 1_000);
  if (!message) return NextResponse.json({ error: "Tell Hanger what you would like help with." }, { status: 400 });

  const [wardrobe, outfits, inspiration, stored, homeCity] = await Promise.all([listWardrobe(subject), listOutfits(subject), getConsumerInspirationProfile(subject), loadHangerConversation(subject), getHomeCity(subject).catch(() => null)]);
  // The phone's location, when the person chose to share it, wins for this one message and is never
  // stored; otherwise the home city from Settings. No location, no forecast — and Hanger then never
  // guesses the weather. The forecast has a short deadline, so it can only ever cost a reply its
  // forecast, never the reply.
  const shared = validCoordinates(body.location?.latitude, body.location?.longitude);
  const location = shared ? { ...shared, place: "your current location" } : homeCity ? { latitude: homeCity.latitude, longitude: homeCity.longitude, place: homeCity.name } : null;
  const forecast: Forecast | null = location ? await fetchForecast(location).catch(() => null) : null;
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
  const agentAttempted = isAgentEnabled();
  // Why the agent did not answer, when it did not — shown with the reply so a live failure names itself.
  const agentOutcome: { failure: AgentFailure | null } = { failure: null };
  if (agentAttempted) {
    const onScreen = (stored.activeOutfit?.itemIds ?? []).map((id) => wardrobe.find((item) => item.id === id)).filter((item): item is WardrobeItem => Boolean(item));
    const agent = await runHangerAgent({
      message, history, wardrobe, forecast, activeOutfit: onScreen, remembered, today: new Date(),
      rankingBase: {
        history,
        excludedItemIds: avoidedItemIds(preferences, wardrobe),
        avoidItemIds: [...previousSuggestionItemIds, ...mostRecentSavedItemIds],
        rotatePriorSuggestions: onScreen.length > 0,
        inspirationStyleHints: inspiration.styleHints,
      },
      loadTrends: async () => summarizeCommunityTrends(await listCommunityPosts()),
      onFallback: (failure) => { agentOutcome.failure = failure; },
    }).catch(() => null);
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
          ...(agent.toolsUsed.includes("wardrobe search") ? ["Searched your wardrobe"] : []),
          ...(agent.toolsUsed.includes("weather") && forecast ? [`Forecast for ${forecast.place} from Open-Meteo`] : []),
          ...(agent.toolsUsed.includes("Racked trends") ? ["Trends from recent public Racked looks — anonymous totals"] : []),
          ...(agent.notFound.length ? [`Not found in your wardrobe: ${agent.notFound.join(", ")}`] : []),
          "The stylist model chose which tools to use and wrote this reply",
          "Only this signed-in account's wardrobe was available",
        ],
      };
      try {
        let nextState = appendTurns({ ...stored, preferences }, [{ role: "user", content: message }, { role: "assistant", content: agentReply.message }]);
        if (first.length) {
          nextState = rememberSuggestedItemIds(nextState, agent.offered);
          nextState = rememberActiveOutfit(nextState, first.map((item) => item.id), agent.intent ?? plan0Intent(message));
        }
        // The agent follows the conversation itself, so nothing is held open for the keyword rules.
        nextState = rememberPendingRequest(nextState, null);
        await saveHangerConversation(subject, nextState);
      } catch (reason) {
        console.error("Hanger conversation could not be saved", { name: reason instanceof Error ? reason.name : "UnknownError" });
      }
      return NextResponse.json({ reply: agentReply, remembered });
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
    allowModel: !agentAttempted || plainReplyWorthTrying(agentOutcome.failure),
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
  });
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
    message: generated.message,
    confidence: suggested.length >= 3 ? "high" : suggested.length ? "medium" : "low",
    toolsUsed: ["private wardrobe", "wear history", "saved outfits", ...(ranked?.intent.styleSource === "inspiration" ? ["saved Community inspiration"] : []), ...(remembered ? ["remembered preferences"] : []), "conversation memory"],
    actions,
    selection,
    ...(outfitSet ? { outfits: outfitSet } : {}),
    ...(agentOutcome.failure ? { degradedReason: describeAgentFailure(agentOutcome.failure) } : {}),
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

  try {
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
    await saveHangerConversation(subject, nextState);
  } catch (reason) {
    // A reply the person can already see is worth more than a perfectly stored transcript.
    console.error("Hanger conversation could not be saved", { name: reason instanceof Error ? reason.name : "UnknownError" });
  }
  return NextResponse.json({ reply, remembered });
}
