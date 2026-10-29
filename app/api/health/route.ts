import { NextResponse } from "next/server";
import { aiDailyCeiling, DAY_MS } from "@/lib/abuse-limits";
import { modelBudgetBand } from "@/lib/demo-health";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { readSecurityCounter } from "@/lib/server/production-store";

/**
 * Whether a live demo can run, without spending anything: the build that is running, whether the
 * AI is configured, and today's model-call budget as a band (plenty, low, exhausted). It calls no
 * model and writes nothing; the budget is one read of the counter the AI ceiling already keeps.
 * No account, key, or count leaves here. `pnpm verify:live` reads it before a demo.
 */
export const dynamic = "force-dynamic";

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export async function GET(request: Request) {
  const limit = consumeRateLimit(`health:${clientIdentifier(request)}`, RATE_LIMIT_RULES.health);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checks. Try again shortly." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const commit = (process.env.RACKED_BUILD_COMMIT ?? "").trim();
  const builtAt = (process.env.RACKED_BUILD_TIME ?? "").trim();
  const configured = (process.env.AI_PROVIDER ?? "").toLowerCase() === "bedrock";
  let used: number | null = null;
  try {
    used = (await readSecurityCounter("ai:site-calls", DAY_MS)).count;
  } catch (error) {
    console.error("Health check could not read the AI budget", { name: error instanceof Error ? error.name : "UnknownError" });
  }
  return NextResponse.json(
    {
      commit: COMMIT_PATTERN.test(commit) ? commit : "unknown",
      builtAt: Number.isNaN(Date.parse(builtAt)) ? null : builtAt,
      ai: { configured, budget: configured ? modelBudgetBand(used, aiDailyCeiling()) : "unknown" },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
