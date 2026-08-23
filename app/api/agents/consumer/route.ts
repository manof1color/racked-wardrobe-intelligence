import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateConsumerHangerReply, hangerOutfitName, ownedSuggestionItemIds, sanitizeAgentHistory } from "@/lib/hanger-conversation";
import { asksForOutfitSuggestion, rankOutfit } from "@/lib/outfit-ranking";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getConsumerInspirationProfile, listOutfits, listWardrobe } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  const limit = consumeRateLimit(`consumer-agent:${session.subject}`, RATE_LIMIT_RULES.consumerAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Hanger is receiving messages too quickly. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const body = await request.json().catch(() => ({})) as { message?: string; history?: unknown; previousSuggestionItemIds?: unknown; occasion?: string; weather?: string };
  const legacyMessage = `Build an outfit for ${body.occasion?.trim() || "my plans"}${body.weather?.trim() ? ` in ${body.weather.trim()}` : ""}.`;
  const message = (body.message?.trim() || legacyMessage).slice(0, 1_000);

  const [wardrobe, outfits, inspiration] = await Promise.all([listWardrobe(session.subject), listOutfits(session.subject), getConsumerInspirationProfile(session.subject)]);
  const history = sanitizeAgentHistory(body.history);
  // History is passed in so a follow-up sets aside what was already suggested.
  const previousSuggestionItemIds = ownedSuggestionItemIds(body.previousSuggestionItemIds, wardrobe);
  const mostRecentSavedItemIds = outfits[0]?.itemIds ?? [];
  // Repeating an outfit-creation prompt inside the same conversation means
  // "show me another" even when the person did not type the word "another".
  // Advice questions remain deterministic and do not rotate implicitly.
  const rotatePriorSuggestions=previousSuggestionItemIds.length>0&&asksForOutfitSuggestion(message);
  const ranked = rankOutfit(wardrobe, message, { history, avoidItemIds: [...previousSuggestionItemIds, ...mostRecentSavedItemIds], rotatePriorSuggestions, inspirationStyleHints:inspiration.styleHints });
  const suggested = ranked.pieces.map((piece) => piece.item);
  const required = ranked.requiredPieceIds.map((itemId) => wardrobe.find((item) => item.id === itemId)).filter((item): item is typeof wardrobe[number] => Boolean(item));
  // One canonical selection feeds the visible cards and every action. Keeping
  // this as a single object prevents names, photos, and saved IDs from drifting.
  const selection = suggested.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
  }));
  const selectedItemIds = selection.map((item) => item.id).join(",");
  const generated = await generateConsumerHangerReply({
    message,
    history,
    wardrobe,
    outfits,
    suggested,
    required,
    inspiration,
  });
  const actions: AgentReply["actions"] = suggested.length ? [
    { label: "Save this exact outfit", type: "save-outfit", payload: { itemIds: selectedItemIds, name: hangerOutfitName(suggested) } },
    { label: "Record these exact pieces as worn", type: "record-outfit", payload: { itemIds: selectedItemIds } },
  ] : [];
  const reply: AgentReply = {
    agent: "consumer-stylist",
    provider: generated.usedModel ? "amazon-bedrock" : "grounded-wardrobe",
    message: generated.message,
    confidence: suggested.length >= 3 ? "high" : suggested.length ? "medium" : "low",
    toolsUsed: ["private wardrobe", "wear history", "saved outfits", ...(inspiration.lookCount?["saved Community inspiration"]:[]), "bounded conversation history"],
    actions,
    selection,
    evidence: [
      `${wardrobe.length} owned garments checked this turn`,
      `${outfits.length} saved outfits checked this turn`,
      ...(inspiration.lookCount?[`${inspiration.lookCount} intentionally saved Community Look${inspiration.lookCount===1?"":"s"} supplied private style signals; current instructions remained authoritative`]:[]),
      ...ranked.pieces.map((piece) => `${piece.item.name}: ${piece.reasons[0] ?? "scored against this request"}`),
      ...(required.length ? [`${required.map((item) => item.name).join(", ")} locked because the customer explicitly requested ${required.length === 1 ? "it" : "them"}`] : []),
      ...(ranked.setAside > 0 ? [`${ranked.setAside} piece${ranked.setAside === 1 ? "" : "s"} already suggested earlier in this conversation were set aside`] : []),
      "Only this signed-in account's wardrobe was available",
    ],
  };
  return NextResponse.json({ reply });
}
