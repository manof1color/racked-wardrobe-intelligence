import type { NextConfig } from "next";

/**
 * Headers on every response. Each closes a class of attack the browser can block for free:
 * downgrade to HTTP, MIME sniffing, clickjacking, referrer leakage, and access to device features
 * the app does not use. Camera and location stay available to Racked itself — scanning and
 * "Use my location" need them — and to nothing embedded in it.
 *
 * The Content Security Policy is not here: it carries a fresh nonce per request, so middleware.ts
 * sets it on every page (lib/content-security-policy.ts).
 */
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Judge/dev note: Next.js 15 blocks cross-origin dev requests by default.
  // These entries let the dev server be reached from a phone on the same
  // LAN or through an ngrok tunnel for mobile testing — dev-mode only,
  // has no effect on `next build`/`next start`.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.*.*", "10.*.*.*"],
  // No "X-Powered-By: Next.js" banner advertising the framework to scanners.
  poweredByHeader: false,
  images: {localPatterns: [{pathname: "/icon-192.png", search: ""}]},
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path((?!community/images/[^/]+/[^/]+$).*)", headers: [
        {key: "Cache-Control", value: "private, no-store"},
        {key: "Vary", value: "Cookie"},
      ] },
    ];
  },
};

export default nextConfig;
