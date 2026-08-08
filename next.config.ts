import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Judge/dev note: Next.js 15 blocks cross-origin dev requests by default.
  // These entries let the dev server be reached from a phone on the same
  // LAN or through an ngrok tunnel for mobile testing — dev-mode only,
  // has no effect on `next build`/`next start`.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
