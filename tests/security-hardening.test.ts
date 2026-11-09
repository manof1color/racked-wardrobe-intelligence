/**
 * Request hardening: browser security headers, a guard in front of every API route against
 * cross-site requests and oversized bodies, a privacy-safe log of policy violations, photographs
 * stored without the location and camera metadata a phone writes into them, and a sign-in that
 * takes as long for an unknown email as for a known one.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import nextConfig from "../next.config.ts";
import { ANY_S3_IMAGE_SOURCE, contentSecurityPolicy, createNonce, cspHeaderName, cspMode, uploadImageSource } from "../lib/content-security-policy.ts";
import { guardRequest, MAX_JSON_BODY_BYTES, MAX_UPLOAD_BODY_BYTES, type GuardRequest } from "../lib/request-guard.ts";
import type { OriginEnvironment } from "../lib/site-origin.ts";
import { cspViolationSummary } from "../lib/csp-report.ts";
import { stripImageMetadata } from "../lib/image-sanitize.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Production, as deployed: nothing configured beyond the built-in production address.
const production: OriginEnvironment = { NODE_ENV: "production" };
const request = (method: string, headers: Record<string, string>, pathname = "/api/consumer/outfits", environment: OriginEnvironment = production): GuardRequest => ({
  method, pathname, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null }, environment,
});
const site = { host: "main.d2iv0khybuuaeh.amplifyapp.com" };
const ownOrigin = "https://main.d2iv0khybuuaeh.amplifyapp.com";

test("every response carries the browser security headers", async () => {
  const [rule, apiRule] = await nextConfig.headers!();
  const privateHeaders=Object.fromEntries(apiRule.headers.map(({key,value})=>[key,value]));
  assert.equal(privateHeaders["Cache-Control"],"private, no-store");
  assert.equal(privateHeaders.Vary,"Cookie");
  // A save's count update on a post that has just gone answers 404, never a new item with a count.
  assert.match(read("lib/server/production-store.ts"), /async incrementLikes\(postId\)\{[^]*?ConditionExpression:"attribute_exists\(PK\)"[^\n]*conditionFailed\(error\)\)throw new RequestRefused\("Community post not found\.",404\)/);
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
  assert.equal(headers["Content-Security-Policy-Report-Only"], undefined, "the policy is per request now, set by middleware");
  assert.equal(headers["Content-Security-Policy"], undefined, "a static copy would have no nonce and block every script");
  assert.equal(nextConfig.poweredByHeader, false, "no framework banner for scanners");
});

const BUCKET = "racked-uploads-fixture";
const policy = contentSecurityPolicy({ nonce: "Zml4dHVyZS1ub25jZQ==", development: false, imageSource: uploadImageSource(BUCKET, "us-east-2") });
const directive = (text: string, name: string) => text.split("; ").find((part) => part.startsWith(`${name} `));

test("the content policy blocks framing, plugins, and foreign scripts, and reports violations", () => {
  for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'", "report-uri /api/security/csp-report"]) {
    assert.ok(policy.split("; ").includes(part), part);
  }
  assert.doesNotMatch(policy, /script-src[^;]*https?:/, "no outside script host is allowed");
});

test("scripts run only with this request's nonce: no 'unsafe-inline', and 'unsafe-eval' in development only", () => {
  assert.equal(directive(policy, "script-src"), "script-src 'self' 'nonce-Zml4dHVyZS1ub25jZQ==' 'strict-dynamic'");
  assert.doesNotMatch(directive(policy, "script-src")!, /unsafe-inline|unsafe-eval/);
  const development = contentSecurityPolicy({ nonce: "bg==", development: true, imageSource: ANY_S3_IMAGE_SOURCE });
  assert.equal(directive(development, "script-src"), "script-src 'self' 'nonce-bg==' 'strict-dynamic' 'unsafe-eval'");
  // Styles keep 'unsafe-inline' for now; SECURITY.md lists it as still open.
  assert.equal(directive(policy, "style-src"), "style-src 'self' 'unsafe-inline'");
});

test("a nonce is fresh for every request and unguessable", () => {
  const nonces = new Set(Array.from({ length: 200 }, () => createNonce()));
  assert.equal(nonces.size, 200);
  for (const nonce of nonces) {
    assert.match(nonce, /^[A-Za-z0-9+/]+=*$/, "base64, safe inside 'nonce-…'");
    assert.match(Buffer.from(nonce, "base64").toString(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "122 random bits");
  }
});

test("private photos may load only from the upload bucket's own host, when it is known", () => {
  assert.equal(uploadImageSource(BUCKET, "us-east-2"), "https://racked-uploads-fixture.s3.us-east-2.amazonaws.com");
  assert.equal(directive(policy, "img-src"), "img-src 'self' data: blob: https://racked-uploads-fixture.s3.us-east-2.amazonaws.com");
  // Unknown or path-style buckets fall back to the old wildcard rather than block every photo.
  for (const [bucket, region] of [[undefined, "us-east-2"], ["", "us-east-2"], ["has.dots.bucket", "us-east-2"], ["Upper", "us-east-2"], ["ab", "us-east-2"], [BUCKET, undefined], [BUCKET, ""], [BUCKET, "not a region"], ["evil.example/x", "us-east-2"]] as const) {
    assert.equal(uploadImageSource(bucket, region), ANY_S3_IMAGE_SOURCE, `${bucket} ${region}`);
  }
  assert.equal(uploadImageSource(` ${BUCKET} `, " eu-west-1 "), "https://racked-uploads-fixture.s3.eu-west-1.amazonaws.com");
  assert.equal(uploadImageSource(BUCKET, "us-gov-west-1"), "https://racked-uploads-fixture.s3.us-gov-west-1.amazonaws.com");
  // The presigner is built with a region alone, so it signs virtual-hosted URLs on that host.
  assert.match(read("lib/server/production-store.ts"), /const s3 = new S3Client\(\{ region \}\);/);
});

test("the policy is enforced by default; only RACKED_CSP_MODE=report rolls it back to report-only", () => {
  assert.equal(cspMode(undefined), "enforce");
  for (const value of ["", "enforce", "REPORT", " report", "off", "false"]) assert.equal(cspMode(value), "enforce", value);
  assert.equal(cspMode("report"), "report");
  assert.equal(cspHeaderName("enforce"), "Content-Security-Policy");
  assert.equal(cspHeaderName("report"), "Content-Security-Policy-Report-Only");
  assert.match(read("scripts/write-amplify-env.mjs"), /"RACKED_CSP_MODE"/, "the switch reaches the deployed runtime");
  assert.match(read(".env.example"), /^RACKED_CSP_MODE=$/m);
  // The log says which: a violation in report mode was only reported, in enforce mode it was blocked.
  assert.match(read("app/api/security/csp-report/route.ts"), /console\.warn\(`CSP violation \(\$\{cspMode\(process\.env\.RACKED_CSP_MODE\) === "report" \? "reported, not blocked" : "blocked"\}\)`, summary\);/);
});

test("middleware gives every page its own nonce, and Next.js and the layout use it", () => {
  const middleware = read("middleware.ts");
  assert.match(middleware, /const nonce = createNonce\(\);/);
  assert.match(middleware, /headers\.set\("x-nonce", nonce\);\s*headers\.set\("Content-Security-Policy", policy\);/, "on the request, where Next.js reads the nonce");
  assert.match(middleware, /NextResponse\.next\(\{ request: \{ headers \} \}\)/);
  assert.match(middleware, /response\.headers\.set\(cspHeaderName\(cspMode\(process\.env\.RACKED_CSP_MODE\)\), policy\);/);
  assert.match(middleware, /development: process\.env\.NODE_ENV !== "production"/);
  assert.match(middleware, /uploadImageSource\(process\.env\.RACKED_UPLOAD_BUCKET, process\.env\.AWS_REGION \?\? process\.env\.AWS_DEFAULT_REGION \?\? "us-east-2"\)/, "the same region fallback as the presigner");
  // Every page, not static files.
  const matcher = middleware.slice(middleware.indexOf("matcher:"));
  assert.match(matcher, /"\/api\/:path\*"/);
  // The page pattern as Next.js matches it: the source string, unescaped, anchored.
  const pages = new RegExp(`^${JSON.parse(matcher.match(/"\/\(\(\?![^"]+"/)![0])}$`);
  for (const path of ["/", "/login", "/consumer", "/brand", "/settings", "/pricing", "/privacy", "/terms", "/community", "/brands/judge-demo-atelier", "/demo-store/x/y", "/a11y-harness", "/not-a-page"]) assert.ok(pages.test(path), `${path} gets a policy`);
  for (const path of ["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icon-192.png", "/icon.svg", "/apple-touch-icon.png", "/og.png", "/demo-products/a.png", "/test-cohort/a.png", "/api/version"]) assert.ok(!pages.test(path), `${path} is skipped`);
  const layout = read("app/layout.tsx");
  assert.match(layout, /const nonce = \(await headers\(\)\)\.get\("x-nonce"\) \?\? undefined;/);
  assert.match(layout, /<Script id="capture-install-prompt" strategy="beforeInteractive" nonce=\{nonce\}>/);
  // No other inline script anywhere in the app would get past the policy without the nonce.
  for (const dir of ["app", "components"]) {
    for (const file of readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))) {
      const code = readFileSync(join(file.parentPath, file.name), "utf8");
      assert.doesNotMatch(code, /dangerouslySetInnerHTML|<script\b/, `${file.name} adds an inline script`);
      if (file.name !== "layout.tsx") assert.doesNotMatch(code, /from "next\/script"/, `${file.name} must pass the nonce to next/script`);
    }
  }
});

test("a state-changing request from another site is refused", () => {
  const blocked = guardRequest(request("POST", { ...site, origin: "https://evil.example", "content-length": "20" }));
  assert.deepEqual(blocked, { allowed: false, status: 403, error: "This request must come from Racked itself." });
  assert.equal(guardRequest(request("DELETE", { ...site, origin: "null" })).allowed, false, "an opaque origin is refused");
  assert.equal(guardRequest(request("PATCH", { ...site, "sec-fetch-site": "cross-site", "content-length": "2" })).allowed, false, "no Origin, but the browser says cross-site");
});

test("Racked's own pages, non-browser clients, and reads pass", () => {
  assert.equal(guardRequest(request("POST", { ...site, origin: ownOrigin, "content-length": "20" })).allowed, true);
  assert.equal(guardRequest(request("POST", { host: "internal.lambda", origin: ownOrigin, "content-length": "2" })).allowed, true, "the production origin is trusted whatever host the platform forwards under");
  assert.equal(guardRequest(request("POST", { origin: "https://shop.racked.example", "content-length": "2" }, "/api/consumer/outfits", { NODE_ENV: "production", RACKED_ALLOWED_ORIGINS: "https://shop.racked.example" })).allowed, true, "a configured custom domain is trusted");
  assert.equal(guardRequest(request("POST", { origin: "http://localhost:3000", "content-length": "2" }, "/api/consumer/outfits", { NODE_ENV: "development" })).allowed, true, "a local development server is trusted in development");
  assert.equal(guardRequest(request("POST", { origin: "http://localhost:3000", "content-length": "2" })).allowed, false, "but never in production");
  assert.equal(guardRequest(request("POST", { ...site, "sec-fetch-site": "same-origin", "content-length": "2" })).allowed, true);
  assert.equal(guardRequest(request("POST", { ...site, "content-length": "2" })).allowed, true, "a client with no cookies to forge is not a forgery");
  assert.equal(guardRequest(request("GET", { ...site, origin: "https://evil.example" })).allowed, true, "reads change nothing");
  assert.equal(guardRequest(request("POST", { ...site, origin: "https://evil.example", "content-length": "200" }, "/api/security/csp-report")).allowed, true, "violation reports are exempt");
});

// REGRESSION: the guard used to trust whatever the request's own Host or X-Forwarded-Host said, so
// a request that forged both the host and a matching Origin was accepted as Racked's own.
test("REGRESSION: a forged Host or X-Forwarded-Host grants no trust", () => {
  assert.equal(guardRequest(request("POST", { host: "evil.example", origin: "https://evil.example", "content-length": "2" })).allowed, false);
  assert.equal(guardRequest(request("POST", { host: site.host, "x-forwarded-host": "evil.example", origin: "https://evil.example", "content-length": "2" })).allowed, false);
  assert.equal(guardRequest(request("POST", { origin: "https://main.d2iv0khybuuaeh.amplifyapp.com.evil.example", "content-length": "2" })).allowed, false, "a lookalike host is not the host");
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
  assert.match(middleware, /guardRequest\(\{\s*method: request\.method,\s*pathname: request\.nextUrl\.pathname,\s*headers: request\.headers,\s*environment: \{/);
  assert.doesNotMatch(middleware, /siteUrl|x-forwarded-host/i, "trust comes from configuration only");
  assert.match(middleware, /if \(request\.nextUrl\.pathname\.startsWith\("\/api\/"\)\) \{\s*const decision = guardRequest/, "the guard is for the API only");
  assert.match(middleware, /matcher: \[\s*"\/api\/:path\*",/);
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
  assert.ok(route.indexOf("stripImageMetadata(") < route.indexOf("putBrandImage("), "cleaned first");
  assert.match(route, /cleaned\.map\(image=>putBrandImage\(session\.subject,image\.bytes,image\.contentType\)\)/);
  assert.doesNotMatch(route, /putPrivateImage\([^)]*file\.arrayBuffer/, "the raw upload is never stored");
});

test("a failed brand enrollment deletes every photo it had already stored", () => {
  const route = read("app/api/brand/products/route.ts");
  assert.match(route, /Promise\.allSettled\(cleaned\.map\(/, "every upload settles before deciding, so none finishes after the cleanup");
  assert.match(route, /if\(failedUpload\)\{await discardBrandImages\(session\.subject,storedKeys\);throw failedUpload\.reason;\}/);
  assert.match(route, /try\{await saveBrandProduct\(session\.subject,product\);\}\s*catch\(error\)\{await discardBrandImages\(session\.subject,storedKeys\);throw error;\}/);
  const store = read("lib/server/production-store.ts");
  const discard = store.slice(store.indexOf("export async function discardBrandImages"), store.indexOf("export async function putScanImage"));
  assert.match(discard, /\(key\.startsWith\(`brand\/\$\{ownerId\}\/`\)\|\|key\.startsWith\(`\$\{PENDING_SCAN_PREFIX\}brand\/\$\{ownerId\}\/`\)\)&&!key\.includes\("\.\."\)/, "only this brand's own photos, a demo's under temp/ included");
});

test("session, role, and consent checks read the current record, not a replica", () => {
  const store = read("lib/server/production-store.ts");
  const account = store.slice(store.indexOf("export async function getAccount"), store.indexOf("export async function putPrivateImage"));
  assert.match(account, /new GetCommand\(\{TableName:requireTable\(\),Key:\{PK:`USER#\$\{id\}`,SK:"PROFILE"\},ConsistentRead:true\}\)/);
  const metrics = store.slice(store.indexOf("export async function getRealProductMetrics"), store.indexOf("export async function loadHangerConversation"));
  assert.match(metrics, /BatchGetCommand\(\{RequestItems:\{\[requireTable\(\)\]:\{Keys:chunk\.map\(PK=>\(\{PK,SK:"PROFILE"\}\)\),ConsistentRead:true\}\}\}\)/);
});

test("REGRESSION: an unknown email takes as long to reject as a wrong password", () => {
  const store = read("lib/server/production-store.ts");
  const signIn = store.slice(store.indexOf("export async function authenticateAccount"), store.indexOf("export async function verifyAccountPassword"));
  // The same check runs whether or not the email has an account; password-hash.test.ts shows it does
  // the same derivation work either way.
  assert.match(signIn, /const account=await findAccountByEmail\(email\);\s*const checked=await checkPassword\(password,account\);\s*if\(!account\|\|!checked\.ok\)return null;/);
});

test("the README's security section keeps its evidence and its limits, and nothing from the private report", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const start = readme.indexOf("## Security Testing and Hardening");
  assert.ok(start > 0);
  const text = readme.slice(start, readme.indexOf("## Testing and CI"));
  assert.match(text, /github\.com\/cloudflare\/security-audit-skill/);
  for (const merged of [211, 214, 215, 216]) assert.ok(text.includes(`pull/${merged})`), `links the fix in #${merged}`);
  assert.match(text, /\*\*63 of 63 checks passed\*\*/);
  const verification = readFileSync(new URL("../docs/security-verification.md", import.meta.url), "utf8");
  assert.match(verification, /63 of 63 checks passed/, "the number the README quotes is on record");
  assert.match(text, /This was not a hired penetration test/);
  assert.match(text, /not the live site/);
  assert.match(text, /Edge rate limiting and upload malware scanning are not in place/);
  assert.doesNotMatch(text, /racked-security-audit|confirmed issues|needs-validation|\b\d+ (medium|low)\b/i, "REGRESSION guard: the audit report is confidential");
});
