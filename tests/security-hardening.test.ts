/**
 * Request hardening: browser security headers, a guard in front of every API route against
 * cross-site requests and oversized bodies, a privacy-safe log of policy violations, photographs
 * stored without the location and camera metadata a phone writes into them, and a sign-in that
 * takes as long for an unknown email as for a known one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import nextConfig, { CONTENT_SECURITY_POLICY } from "../next.config.ts";
import { guardRequest, MAX_JSON_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, type GuardRequest } from "../lib/request-guard.ts";
import { cspViolationSummary } from "../lib/csp-report.ts";
import { stripImageMetadata } from "../lib/image-sanitize.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const request = (method: string, headers: Record<string, string>, pathname = "/api/consumer/outfits"): GuardRequest => ({
  method, pathname, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
});
const site = { host: "main.d2iv0khybuuaeh.amplifyapp.com" };
const ownOrigin = "https://main.d2iv0khybuuaeh.amplifyapp.com";

test("every response carries the browser security headers", async () => {
  const [rule] = await nextConfig.headers!();
  assert.equal(rule.source, "/:path*");
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Permissions-Policy"], /camera=\(self\)/, "scanning needs the camera");
  assert.match(headers["Permissions-Policy"], /geolocation=\(self\)/, "Use my location needs it");
  assert.match(headers["Permissions-Policy"], /microphone=\(\)/, "nothing uses the microphone");
  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin");
  assert.equal(headers["Content-Security-Policy-Report-Only"], CONTENT_SECURITY_POLICY);
  assert.equal(nextConfig.poweredByHeader, false, "no framework banner for scanners");
});

test("the content policy blocks framing, plugins, and foreign scripts, and reports violations", () => {
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'", "report-uri /api/security/csp-report"]) {
    assert.ok(CONTENT_SECURITY_POLICY.includes(directive), directive);
  }
  assert.match(CONTENT_SECURITY_POLICY, /img-src 'self' data: blob: https:\/\/\*\.amazonaws\.com/, "private photos load from short-lived S3 links");
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /script-src[^;]*https?:/, "no outside script host is allowed");
});

test("a state-changing request from another site is refused", () => {
  const blocked = guardRequest(request("POST", { ...site, origin: "https://evil.example", "content-length": "20" }));
  assert.deepEqual(blocked, { allowed: false, status: 403, error: "This request must come from Racked itself." });
  assert.equal(guardRequest(request("DELETE", { ...site, origin: "null" })).allowed, false, "an opaque origin is refused");
  assert.equal(guardRequest(request("PATCH", { ...site, "sec-fetch-site": "cross-site", "content-length": "2" })).allowed, false, "no Origin, but the browser says cross-site");
});

test("Racked's own pages, non-browser clients, and reads pass", () => {
  assert.equal(guardRequest(request("POST", { ...site, origin: ownOrigin, "content-length": "20" })).allowed, true);
  assert.equal(guardRequest(request("POST", { host: "internal.lambda", "x-forwarded-host": site.host, origin: ownOrigin, "content-length": "2" })).allowed, true, "the forwarded host counts");
  assert.equal(guardRequest({ ...request("POST", { host: "internal.lambda", origin: ownOrigin, "content-length": "2" }), siteUrl: ownOrigin }).allowed, true, "and so does the configured site address");
  assert.equal(guardRequest(request("POST", { ...site, "sec-fetch-site": "same-origin", "content-length": "2" })).allowed, true);
  assert.equal(guardRequest(request("POST", { ...site, "content-length": "2" })).allowed, true, "a client with no cookies to forge is not a forgery");
  assert.equal(guardRequest(request("GET", { ...site, origin: "https://evil.example" })).allowed, true, "reads change nothing");
  assert.equal(guardRequest(request("POST", { ...site, origin: "https://evil.example", "content-length": "200" }, "/api/security/csp-report")).allowed, true, "violation reports are exempt");
});

test("bodies are capped at what the app actually sends", () => {
  const json = (length: number) => guardRequest(request("POST", { ...site, origin: ownOrigin, "content-type": "application/json", "content-length": String(length) }));
  const upload = (length: number) => guardRequest(request("POST", { ...site, origin: ownOrigin, "content-type": "multipart/form-data; boundary=x", "content-length": String(length) }));
  assert.equal(json(MAX_JSON_BODY_BYTES).allowed, true);
  assert.deepEqual(json(MAX_JSON_BODY_BYTES + 1), { allowed: false, status: 413, error: "That request is too large." });
  assert.equal(upload(15 * 1024 * 1024).allowed, true, "three 5 MB product photos fit");
  assert.deepEqual(upload(MAX_UPLOAD_BODY_BYTES + 1), { allowed: false, status: 413, error: "That upload is too large." });
  assert.equal(guardRequest(request("POST", { ...site, origin: ownOrigin, "transfer-encoding": "chunked" })).allowed, false, "a streamed body of unknown size is refused");
  assert.equal(guardRequest(request("POST", { ...site, origin: ownOrigin, "content-length": "-1" })).allowed, false);
});

test("the guard runs in front of every API route", () => {
  const middleware = read("middleware.ts");
  assert.match(middleware, /guardRequest\(\{ method: request\.method, pathname: request\.nextUrl\.pathname, headers: request\.headers, siteUrl: process\.env\.NEXT_PUBLIC_SITE_URL \}\)/);
  assert.match(middleware, /matcher: \["\/api\/:path\*"\]/);
});

test("a violation report keeps the directive, blocked host, and page path — never a full URL", () => {
  const legacy = JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://tracker.example/pixel.gif?user=42", "document-uri": "https://racked.example/consumer?tab=closet" } });
  assert.deepEqual(cspViolationSummary(legacy), { directive: "img-src", blockedHost: "tracker.example", pagePath: "/consumer" });
  const reportingApi = JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "script-src-elem", blockedURL: "inline", documentURL: "https://racked.example/community" } }]);
  assert.deepEqual(cspViolationSummary(reportingApi), { directive: "script-src-elem", blockedHost: "inline", pagePath: "/community" });
  assert.equal(cspViolationSummary("not json"), null);
  assert.equal(cspViolationSummary("x".repeat(20_000)), null, "oversized reports are ignored");
  assert.equal(cspViolationSummary(JSON.stringify({ "csp-report": {} })), null);
});

test("uploaded photos are stored without GPS or camera metadata", async () => {
  const withLocation = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#cfc5ff" } })
    .withExif({ IFD0: { Make: "PhoneMaker", Model: "Phone 15", Copyright: "Studio at 12 Example Street" }, IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "W" } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(withLocation).metadata()).exif, "the fixture really carries EXIF");
  const cleaned = await stripImageMetadata(withLocation);
  const metadata = await sharp(cleaned.bytes).metadata();
  assert.equal(metadata.exif, undefined, "no EXIF, so no GPS, device, or owner text");
  assert.equal(metadata.orientation, undefined);
  assert.deepEqual([metadata.width, metadata.height], [20, 40], "orientation is applied to the pixels before the tag is dropped");
  assert.equal(cleaned.contentType, "image/jpeg");
});

test("a file that is not a real JPEG, PNG, or WebP is refused, whatever it claims", async () => {
  await assert.rejects(stripImageMetadata(Buffer.from("<html><script>alert(1)</script></html>")), /not a readable image/);
  const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
  await assert.rejects(stripImageMetadata(gif), /JPG, PNG, or WebP/);
  const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#0000" } }).png().toBuffer();
  assert.equal((await stripImageMetadata(png)).contentType, "image/png", "PNG stays PNG, transparency intact");
});

test("brand product photos are re-encoded before anything is stored", () => {
  const route = read("app/api/brand/products/route.ts");
  assert.ok(route.indexOf("stripImageMetadata(") < route.indexOf("putPrivateImage("), "cleaned first");
  assert.match(route, /putPrivateImage\(session\.subject,"brand",cleaned\[index\]\.bytes,cleaned\[index\]\.contentType\)/);
  assert.doesNotMatch(route, /putPrivateImage\([^)]*file\.arrayBuffer/, "the raw upload is never stored");
});

test("REGRESSION: an unknown email takes as long to reject as a wrong password", () => {
  const store = read("lib/server/production-store.ts");
  const signIn = store.slice(store.indexOf("export async function authenticateAccount"), store.indexOf("export async function verifyAccountPassword"));
  assert.match(signIn, /if \(!account\) \{\s*await passwordDigest\(password,TIMING_EQUALIZER_SALT\);\s*return null;\s*\}/);
});
