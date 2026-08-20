import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { explainGroundedOutfit, generateConsumerHangerReply, sanitizeAgentHistory } from "@/lib/hanger-conversation";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { listOutfits, listWardrobe } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  const limit = consumeRateLimit(`consumer-agent:${session.subject}`, RATE_LIMIT_RULES.consumerAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Hanger is receiving messages too quickly. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const body = await request.json().catch(() => ({})) as { message?: string; history?: unknown; occasion?: string; weather?: string };
  const legacyMessage = `Build an outfit for ${body.occasion?.trim() || "my plans"}${body.weather?.trim() ? ` in ${body.weather.trim()}` : ""}.`;
  const message = (body.message?.trim() || legacyMessage).slice(0, 1_000);

  const [wardrobe, outfits] = await Promise.all([listWardrobe(session.subject), listOutfits(session.subject)]);
  const history = sanitizeAgentHistory(body.history);
  // History is passed in so a follow-up sets aside what was already suggested.
  const ranked = explainGroundedOutfit(wardrobe, message, history);
  const suggested = ranked.pieces.map((piece) => piece.item);
  const generated = await generateConsumerHangerReply({
    message,
    history,
    wardrobe,
    outfits,
    suggested,
  });
  const actions: AgentReply["actions"] = suggested.length ? [
    { label: "Save this outfit", type: "save-outfit", payload: { itemIds: suggested.map((item) => item.id).join(","), name: "Hanger outfit" } },
    { label: "Record these pieces as worn", type: "record-outfit", payload: { itemIds: suggested.map((item) => item.id).join(",") } },
  ] : [];
  const reply: AgentReply = {
    agent: "consumer-stylist",
    provider: generated.usedModel ? "amazon-bedrock" : "grounded-wardrobe",
    message: generated.message,
    confidence: suggested.length >= 3 ? "high" : suggested.length ? "medium" : "low",
    toolsUsed: ["private wardrobe", "wear history", "saved outfits", "bounded conversation history"],
    actions,
    evidence: [
      `${wardrobe.length} owned garments checked this turn`,
      `${outfits.length} saved outfits checked this turn`,
      ...ranked.pieces.map((piece) => `${piece.item.name}: ${piece.reasons[0] ?? "scored against this request"}`),
      ...(ranked.setAside > 0 ? [`${ranked.setAside} piece${ranked.setAside === 1 ? "" : "s"} already suggested earlier in this conversation were set aside`] : []),
      "Only this signed-in account's wardrobe was available",
    ],
  };
  return NextResponse.json({ reply });
}
