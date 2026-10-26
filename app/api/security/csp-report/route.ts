import { NextResponse } from "next/server";
import { cspViolationSummary } from "@/lib/csp-report";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

// Where browsers report what the report-only Content Security Policy would have blocked. Each
// report becomes one log line naming the directive and the blocked host — never a full URL, query
// string, or anything about the person — so the policy can be enforced once real use is clean.
export async function POST(request: Request) {
  const limit = consumeRateLimit(`csp-report:${clientIdentifier(request)}`, RATE_LIMIT_RULES.cspReport);
  if (!limit.allowed) return new NextResponse(null, { status: 204 });
  const text = await request.text().catch(() => "");
  const summary = cspViolationSummary(text);
  if (summary) console.warn("CSP violation (report-only)", summary);
  return new NextResponse(null, { status: 204 });
}
