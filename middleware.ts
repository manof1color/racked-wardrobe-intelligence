import { NextResponse, type NextRequest } from "next/server";
import { guardRequest } from "@/lib/request-guard";

// Every API request passes the request guard first: state-changing requests must come from Racked's
// own pages, and bodies are capped at what the app actually sends. See lib/request-guard.ts.
export function middleware(request: NextRequest) {
  const decision = guardRequest({ method: request.method, pathname: request.nextUrl.pathname, headers: request.headers, siteUrl: process.env.NEXT_PUBLIC_SITE_URL });
  if (!decision.allowed) return NextResponse.json({ error: decision.error }, { status: decision.status });
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
