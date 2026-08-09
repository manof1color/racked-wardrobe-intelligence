import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateBrandHangerReply, sanitizeAgentHistory } from "@/lib/hanger-conversation";
import { getRealProductMetrics, listOwnedBrandProducts } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Brand account required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { productId?: string; message?: string; history?: unknown } | null;
  if (!body?.productId) return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  const message = (body.message?.trim() || "Analyze this product's actual wear and recommend the strongest next step.").slice(0, 1_000);

  try {
    const [metrics, products] = await Promise.all([
      getRealProductMetrics(session.subject, body.productId),
      listOwnedBrandProducts(session.subject),
    ]);
    const product = products.find((item) => item.id === body.productId);
    if (!product) throw new Error("Product not found.");
    const generated = await generateBrandHangerReply({
      message,
      history: sanitizeAgentHistory(body.history),
      product,
      metrics,
    });
    const reply: AgentReply = {
      agent: "brand-wear-intelligence",
      provider: metrics.suppressed ? "privacy-threshold" : generated.usedModel ? "amazon-bedrock" : "grounded-aggregate",
      message: generated.message,
      confidence: metrics.suppressed ? "medium" : "high",
      toolsUsed: ["brand product registry", "verified product links", "consumer consent", "privacy threshold", "fresh aggregate metrics", "bounded conversation history"],
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
        `${metrics.actualWears ?? 0} confirmed wears`,
        `${metrics.repeatWearRate ?? 0}% repeat-wear rate`,
        "No names, photos, identifiers, or individual wardrobes sent to AI",
      ],
    };
    return NextResponse.json({ reply, retention: null });
  } catch (error) {
    console.error("Brand Hanger conversation failed", error);
    return NextResponse.json({ error: "Wear intelligence could not run." }, { status: 500 });
  }
}
