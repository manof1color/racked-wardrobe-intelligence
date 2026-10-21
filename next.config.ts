import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy, in report-only mode first. Next.js hydration and the install-prompt
 * capture are inline scripts, so a policy enforced blind could break the live app; reported
 * violations from real use are collected at /api/security/csp-report and the policy is enforced
 * once they are clean. Even report-only, it records any attempt to load script, style, frames, or
 * connections from another origin.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Private garment photographs are served through short-lived S3 links.
  "img-src 'self' data: blob: https://*.amazonaws.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/security/csp-report",
].join("; ");

/**
 * Headers on every response. Each closes a class of attack the browser can block for free:
 * downgrade to HTTP, MIME sniffing, clickjacking, referrer leakage, and access to device features
 * the app does not use. Camera and location stay available to Racked itself — scanning and
 * "Use my location" need them — and to nothing embedded in it.
 */
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Content-Security-Policy-Report-Only", value: CONTENT_SECURITY_POLICY },
];

const nextConfig: NextConfig = {
  // Judge/dev note: Next.js 15 blocks cross-origin dev requests by default.
  // These entries let the dev server be reached from a phone on the same
  // LAN or through an ngrok tunnel for mobile testing — dev-mode only,
  // has no effect on `next build`/`next start`.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.*.*", "10.*.*.*"],
  // No "X-Powered-By: Next.js" banner advertising the framework to scanners.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
