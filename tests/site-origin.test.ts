/**
 * Which addresses Racked trusts as itself — from explicit configuration only, never from a request.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTrustedOrigin, PRODUCTION_ORIGIN, publicOrigin, trustedOrigins } from "../lib/site-origin.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("production is trusted even when nothing is configured — production had no site URL set", () => {
  assert.deepEqual([...trustedOrigins({ NODE_ENV: "production" })], [PRODUCTION_ORIGIN]);
  assert.equal(isTrustedOrigin("https://main.d2iv0khybuuaeh.amplifyapp.com", { NODE_ENV: "production" }), true);
});

test("configuration adds origins and cannot be tricked by lookalikes", () => {
  const environment = { NODE_ENV: "production", RACKED_ALLOWED_ORIGINS: "https://racked.example, https://staging.racked.example/" };
  assert.equal(isTrustedOrigin("https://racked.example", environment), true);
  assert.equal(isTrustedOrigin("https://staging.racked.example", environment), true, "a trailing slash in config is normalised");
  assert.equal(isTrustedOrigin("https://racked.example.evil.example", environment), false);
  assert.equal(isTrustedOrigin("http://racked.example", environment), false, "the scheme must match");
  assert.equal(isTrustedOrigin("javascript:alert(1)", environment), false);
  assert.equal(isTrustedOrigin("not a url", environment), false);
  assert.equal(trustedOrigins({ NODE_ENV: "production", RACKED_ALLOWED_ORIGINS: "ftp://files.example, nonsense" }).size, 1, "non-web and malformed values are ignored");
});

test("local development hosts are trusted only outside production", () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:3101", "http://192.168.1.20:3000", "https://abc-123.ngrok-free.app"]) {
    assert.equal(isTrustedOrigin(origin, { NODE_ENV: "development" }), true, origin);
    assert.equal(isTrustedOrigin(origin, { NODE_ENV: "production" }), false, origin);
  }
});

test("emailed links use the configured origin, falling back to production — never localhost", () => {
  assert.equal(publicOrigin({}), PRODUCTION_ORIGIN);
  assert.equal(publicOrigin({ NEXT_PUBLIC_SITE_URL: "https://racked.example/" }), "https://racked.example");
  assert.equal(publicOrigin({ RACKED_PUBLIC_ORIGIN: "https://mail.racked.example", NEXT_PUBLIC_SITE_URL: "https://racked.example" }), "https://mail.racked.example");
  assert.equal(publicOrigin({ RACKED_PUBLIC_ORIGIN: "not a url" }), PRODUCTION_ORIGIN);
});

// REGRESSION: with no public origin configured, the reset link was built from the request's own
// host, so a reset requested with a forged host would email the victim a valid token on another site.
test("REGRESSION: password-reset links never come from the request", () => {
  const route = read("app/api/auth/password-reset/request/route.ts");
  assert.match(route, /const resetUrl=`\$\{publicOrigin\(\)\}\$\{safeResetPath\(issued\.token\)\}`/);
  assert.doesNotMatch(route, /request\.url/);
  assert.match(read("app/layout.tsx"), /metadataBase: new URL\(publicOrigin\(\)\)/, "and link previews no longer point at localhost");
});
