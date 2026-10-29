import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/version/route.ts");
const helper = read("scripts/write-amplify-env.mjs");

// A server-side change leaves every content-hashed asset identical and every gated route
// answering the same 401, so nothing observable proves a deployment carried it. This endpoint is
// the marker. Its whole value is that it cannot be answered from cache or from stale assets.
test("the version endpoint reports the running build and is never cached", () => {
  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /"cache-control": "no-store"/);
  assert.match(route, /RACKED_BUILD_COMMIT/);
  assert.match(route, /RACKED_BUILD_TIME/);
  assert.match(route, /commit: COMMIT_PATTERN\.test\(commit\) \? commit : "unknown"/, "a missing stamp is reported, not faked");
});

test("it exposes the commit and nothing else", () => {
  assert.doesNotMatch(route, /getSession|SESSION_SECRET|AI_API_KEY|RACKED_TABLE_NAME|RACKED_UPLOAD_BUCKET|AWS_/, "no credential, table, bucket, or account data is read here");
  const returned = /NextResponse\.json\(\s*\{([\s\S]*?)\},/.exec(route)?.[1] ?? "";
  const fields = [...returned.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
  assert.deepEqual(fields.sort(), ["builtAt", "commit"], "exactly two public fields");
});

test("the build stamp is written deliberately, not dumped from the environment", () => {
  assert.match(helper, /Never dump the complete build environment/, "the allowlist rule still stands");
  assert.match(helper, /const buildCommit = \(process\.env\.AWS_COMMIT_ID \?\? ""\)/, "one named AWS variable, copied on purpose");
  assert.match(helper, /\^\[0-9a-f\]\{7,40\}\$/, "and only when it actually looks like a commit");

  // The allowlist itself must not have grown an AWS or CI entry alongside it.
  const allowlist = /const allowlist = \[([\s\S]*?)\];/.exec(helper)?.[1] ?? "";
  assert.ok(allowlist.length > 0, "the allowlist is still there");
  assert.doesNotMatch(allowlist, /AWS_|CI_|CODEBUILD|AMPLIFY/, "no AWS or CI metadata is copied wholesale");
});

test("the health check reports readiness as a band and spends nothing", async () => {
  const { modelBudgetBand } = await import("../lib/demo-health.ts");
  assert.equal(modelBudgetBand(0, 1_500), "plenty");
  assert.equal(modelBudgetBand(1_400, 1_500), "low", "fewer than a tenth left");
  assert.equal(modelBudgetBand(1_480, 1_500), "low");
  assert.equal(modelBudgetBand(1_500, 1_500), "exhausted");
  assert.equal(modelBudgetBand(2_000, 1_500), "exhausted");
  assert.equal(modelBudgetBand(80, 100), "low", "at least 25 calls left, even on a small ceiling");
  assert.equal(modelBudgetBand(null, 1_500), "unknown", "an unreadable counter is not reported as fine");
  const health = read("app/api/health/route.ts");
  assert.match(health, /export const dynamic = "force-dynamic";/);
  assert.match(health, /"cache-control": "no-store"/);
  assert.match(health, /consumeRateLimit\(`health:\$\{clientIdentifier\(request\)\}`, RATE_LIMIT_RULES\.health\)/);
  assert.match(health, /readSecurityCounter\("ai:site-calls", DAY_MS\)/, "reads the same counter the ceiling charges, without adding to it");
  assert.doesNotMatch(health, /incrementSecurityCounter|spendSiteModelCall|Bedrock|Converse|getSession|SESSION_SECRET|AWS_/, "no model call, no write, no account, no secret");
  assert.match(health, /ai: \{ configured, budget: configured \? modelBudgetBand\(used, aiDailyCeiling\(\)\) : "unknown" \}/, "a band, never the counts");
});

test("verify:live only reads public pages", () => {
  const script = read("scripts/verify-live.mjs");
  assert.match(read("package.json"), /"verify:live": "node scripts\/verify-live\.mjs"/);
  assert.doesNotMatch(script, /method:\s*"(POST|PUT|PATCH|DELETE)"|password|cookie|Authorization|aws-sdk/i, "no writes, no sign-in, no AWS");
  assert.match(script, /git", \["ls-remote", "origin", "refs\/heads\/main"\]/, "main is read without changing the local checkout");
  for (const page of ["/", "/pricing", "/privacy", "/terms", "/login", "/community", "/api/version", "/api/health"]) assert.ok(script.includes(`"${page}"`), page);
  assert.match(read("docs/demo-checklist.md"), /## 30 minutes before\s+1\. Run `pnpm verify:live`/);
});
