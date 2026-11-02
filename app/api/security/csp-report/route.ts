import { NextResponse } from "next/server";
import { cspViolationSummary } from "@/lib/csp-report";
import { cspMode } from "@/lib/content-security-policy";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

// Where browsers report what the Content Security Policy blocked, or would have blocked in report
// mode (RACKED_CSP_MODE=report). Each report becomes one log line naming the directive and the
// blocked host — never a full URL, query string, or anything about the person.
export async function POST(request: Request) {
  const limit = consumeRateLimit(`csp-report:${clientIdentifier(request)}`, RATE_LIMIT_RULES.cspReport);
  if (!limit.allowed) return new NextResponse(null, { status: 204 });
  const text = await request.text().catch(() => "");
  const summary = cspViolationSummary(text);
  if (summary) console.warn(`CSP violation (${cspMode(process.env.RACKED_CSP_MODE) === "report" ? "reported, not blocked" : "blocked"})`, summary);
  return new NextResponse(null, { status: 204 });
}
