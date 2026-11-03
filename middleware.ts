import { NextResponse, type NextRequest } from "next/server";
import { guardRequest } from "@/lib/request-guard";
import { contentSecurityPolicy, createNonce, cspHeaderName, cspMode, uploadImageSource } from "@/lib/content-security-policy";

// Every API request passes the request guard first: state-changing requests must come from an
// origin on Racked's explicit allowlist, and bodies are capped at what the app actually sends.
// Every page gets a Content Security Policy with its own nonce (lib/content-security-policy.ts).
// The environment is passed key by key so each value is fixed when the middleware is built.
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
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
  const nonce = createNonce();
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV !== "production",
    imageSource: uploadImageSource(process.env.RACKED_UPLOAD_BUCKET, process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2"),
  });
  // On the request, for Next.js to find the nonce while rendering; never sent to the browser.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(cspHeaderName(cspMode(process.env.RACKED_CSP_MODE)), policy);
  return response;
}

// API routes, and every page. Static files carry no script, so they skip the work: Next.js build
// output, image optimisation, the manifest, the service worker, and the icons and images in public/.
export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|icon|apple-touch-icon|og\\.png|demo-products/|test-cohort/).*)",
  ],
};
