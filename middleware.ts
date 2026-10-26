import { NextResponse, type NextRequest } from "next/server";
import { guardRequest } from "@/lib/request-guard";

// Every API request passes the request guard first: state-changing requests must come from an
// origin on Racked's explicit allowlist, and bodies are capped at what the app actually sends.
// The environment is passed key by key so each value is fixed when the middleware is built.
export function middleware(request: NextRequest) {
  const decision = guardRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    headers: request.headers,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      RACKED_PUBLIC_ORIGIN: process.env.RACKED_PUBLIC_ORIGIN,
      RACKED_ALLOWED_ORIGINS: process.env.RACKED_ALLOWED_ORIGINS,
    },
  });
  if (!decision.allowed) return NextResponse.json({ error: decision.error }, { status: decision.status });
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
