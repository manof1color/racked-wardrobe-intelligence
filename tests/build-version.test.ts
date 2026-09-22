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
