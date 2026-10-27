import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bedrockHangerConverse, generateBrandHangerReply, sanitizeAgentHistory } from "@/lib/hanger-conversation";
import { meteredOrNull } from "@/lib/ai-budget";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { spendAiAllowance, spendSiteModelCall } from "@/lib/server/abuse-guard";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { getBrandCommunityMetrics, getRealProductMetrics, listOwnedBrandProducts } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Brand account required." }, { status: 403 });
  const limit = consumeRateLimit(`brand-agent:${session.subject}`, RATE_LIMIT_RULES.brandAgent);
  if (!limit.allowed) return NextResponse.json({ error: "Hanger is receiving messages too quickly. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const body = await request.json().catch(() => null) as { productId?: string; message?: string; history?: unknown } | null;
  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  if (!productId) return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  const message = ((typeof body?.message === "string" ? body.message.trim() : "") || "Analyze this product's actual wear and recommend the strongest next step.").slice(0, 1_000);

  try {
    const [metrics, products, communityMetrics] = await Promise.all([
      getRealProductMetrics(session.subject, productId),
      listOwnedBrandProducts(session.subject),
      getBrandCommunityMetrics(session.subject, productId),
    ]);
    const product = products.find((item) => item.id === productId);
    if (!product) throw new RequestRefused("Product not found for this brand account.", 404);
    // Below the privacy threshold no model is called, so nothing is spent. Above it, a question is
    // spent from the brand's daily allowance, and its model call from the site's ceiling; when the
    // ceiling or the counter refuses, the answer comes from the released aggregates alone.
    const allowance = metrics.suppressed ? { allowed: true as const } : await spendAiAllowance("brand-hanger", session.subject);
    if (!allowance.allowed && allowance.scope === "account") return NextResponse.json({ error: allowance.message }, { status: 429, headers: { "retry-after": String(allowance.retryAfterSeconds) } });
    const generated = await generateBrandHangerReply({
      message,
      // Prior questions retain conversational intent, but browser-supplied assistant prose can
      // replay old released metrics after a cohort changes. Never send that prose to the model.
      history: metrics.suppressed ? [] : sanitizeAgentHistory(body?.history).filter((turn) => turn.role === "user"),
      product,
      metrics,
      communityMetrics,
    }, allowance.allowed ? meteredOrNull(spendSiteModelCall, bedrockHangerConverse) : async () => null);
    const reply: AgentReply = {
      agent: "brand-wear-intelligence",
      provider: metrics.suppressed ? "privacy-threshold" : generated.usedModel ? "amazon-bedrock" : "grounded-aggregate",
      message: generated.message,
      confidence: metrics.suppressed ? "medium" : "high",
      toolsUsed: ["brand product registry", "verified product links", "consumer consent", "privacy threshold", "fresh aggregate metrics", "public community activity", "bounded conversation history"],
      actions: metrics.suppressed ? [] : [{
        label: "Create a strategy brief",
        type: "campaign",
        payload: { segment: "aggregate-wear", theme: "actual wear", recommendation: "Use only the released aggregate evidence shown in this conversation." },
      }],
      evidence: metrics.suppressed ? [
        `Aggregate release requires at least ${metrics.minimumCohortSize} eligible owners`,
        "No individual records or suppressed metrics sent to AI",
        "General strategy only until the threshold is reached",
      ] : [
        `${metrics.segmentSize} eligible opted-in owners`,
        metrics.actualWears === null ? "Confirmed wears withheld (small group)" : `${metrics.actualWears ?? 0} confirmed wears`,
        metrics.repeatWearRate === null ? "Repeat-wear rate withheld (small group)" : `${metrics.repeatWearRate ?? 0}% repeat-wear rate`,
        `${communityMetrics.publicOutfitAppearances} public outfit appearances`,
        "No names, photos, identifiers, or individual wardrobes sent to AI",
      ],
    };
    return NextResponse.json({ reply, retention: null });
  } catch (error) {
    return failureResponse(error, "Brand Hanger conversation failed", "Wear intelligence could not run.");
  }
}
