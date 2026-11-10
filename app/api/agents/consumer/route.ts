import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bedrockHangerConverse } from "@/lib/hanger-conversation";
import { bedrockAgentConverse, isAgentEnabled, summarizeCommunityTrends } from "@/lib/hanger-agent";
import { runConsumerHangerTurn } from "@/lib/hanger-consumer-turn";
import { preferenceSummary } from "@/lib/hanger-memory";
import { metered, meteredOrNull } from "@/lib/ai-budget";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { siteModelCallFor, spendAiAllowance } from "@/lib/server/abuse-guard";
import { clearHangerConversation, getConsumerInspirationProfile, getHomeCity, listCommunityPosts, listOutfits, listWardrobe, loadHangerConversation, saveHangerConversation } from "@/lib/server/production-store";
import { fetchForecast, validCoordinates, type Forecast } from "@/lib/weather";

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
  const limit = consumeRateLimit(`consumer-agent-clear:${session!.subject}`, RATE_LIMIT_RULES.consumerAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
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
  // A demo's model calls come from the demos' share of the day's ceiling (lib/ai-budget.ts).
  const spendModelCall = siteModelCallFor(session!);
  const limit = consumeRateLimit(`consumer-agent:${subject}`, RATE_LIMIT_RULES.consumerAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Hanger is receiving messages too quickly. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const parsedBody = await request.json().catch(() => ({})) as unknown;
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody as { message?: unknown; occasion?: unknown; weather?: unknown; location?: { latitude?: unknown; longitude?: unknown } } : {};
  const occasion = typeof body.occasion === "string" ? body.occasion.trim() : "my plans";
  const weather = typeof body.weather === "string" ? body.weather.trim() : "";
  const legacyMessage = `Build an outfit for ${occasion || "my plans"}${weather ? ` in ${weather}` : ""}.`;
  const message = (typeof body.message === "string" ? body.message.trim() : legacyMessage).slice(0, 1_000);
  if (!message) return NextResponse.json({ error: "Tell Hanger what you would like help with." }, { status: 400 });
  // Each message is spent from the account's daily allowance, and every model call it makes — up to
  // five agent rounds and a plain reply — from the site's ceiling. Past the account's allowance the
  // person is told; when the site's ceiling or the counter itself refuses, Hanger keeps answering —
  // from the wardrobe, without the model, saying why.
  const allowance = isAgentEnabled() ? await spendAiAllowance("hanger", subject) : { allowed: true as const };
  if (!allowance.allowed && allowance.scope === "account") return NextResponse.json({ error: allowance.message }, { status: 429, headers: { "retry-after": String(allowance.retryAfterSeconds) } });
  const aiPaused = !allowance.allowed;

  const [wardrobe, outfits, inspiration, stored, homeCity] = await Promise.all([listWardrobe(subject), listOutfits(subject), getConsumerInspirationProfile(subject), loadHangerConversation(subject), getHomeCity(subject).catch(() => null)]);
  // The phone's location, when the person chose to share it, wins for this one message and is never
  // stored; otherwise the home city from Settings. No location, no forecast — and Hanger then never
  // guesses the weather. The forecast has a short deadline, so it can only ever cost a reply its
  // forecast, never the reply.
  const shared = validCoordinates(body.location?.latitude, body.location?.longitude);
  const location = shared ? { ...shared, place: "your current location" } : homeCity ? { latitude: homeCity.latitude, longitude: homeCity.longitude, place: homeCity.name } : null;
  const forecast: Forecast | null = location ? await fetchForecast(location).catch(() => null) : null;
  // The turn itself — the agent, the grounded fallback, the outfit card and the conversation to
  // store — is lib/hanger-consumer-turn.ts, which the blind evaluation runs too. Both model callers
  // are metered here, where the session that pays for them is known.
  const turn = await runConsumerHangerTurn({
    message, wardrobe, outfits, inspiration, stored, forecast,
    agentEnabled: isAgentEnabled(), aiPaused, today: new Date(),
    loadTrends: async () => summarizeCommunityTrends(await listCommunityPosts()),
    agentCall: metered(spendModelCall, bedrockAgentConverse),
    plainCall: meteredOrNull(spendModelCall, bedrockHangerConverse),
  });
  try {
    await saveHangerConversation(subject, turn.nextState);
  } catch (reason) {
    // A reply the person can already see is worth more than a perfectly stored transcript.
    console.error("Hanger conversation could not be saved", { name: reason instanceof Error ? reason.name : "UnknownError" });
  }
  return NextResponse.json({ reply: turn.reply, remembered: turn.remembered });
}
