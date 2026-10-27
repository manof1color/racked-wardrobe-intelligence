/**
 * Shared limits and the AI spending guard. The in-memory limiter lives in each server instance, so
 * these are counted in DynamoDB and hold across all of them; they are keyed on what an attack aims
 * at — an email address, an account, the site's AI budget — and stored only as keyed hashes.
 * The budgets' behaviour is tested in ai-budget.test.ts; this file checks the rules and the wiring.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_DAILY_ALLOWANCE, AI_UNAVAILABLE_MESSAGE, aiAllowance, aiDailyCeiling, aiUnavailable, DAY_MS, DEFAULT_AI_DAILY_CEILING, DURABLE_LIMITS, durableDecision, signInPausedMessage, siteModelCallAllowed, windowStart } from "../lib/abuse-limits.ts";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const noon = Date.UTC(2026, 9, 21, 12, 0, 0);

test("a counter is allowed up to its limit and refused past it, until the window resets", () => {
  assert.deepEqual(durableDecision(8, 8, noon + 60_000, noon), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(durableDecision(9, 8, noon + 60_000, noon), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(durableDecision(9, 8, noon, noon).retryAfterSeconds, 1, "never asks to wait zero seconds");
  assert.equal(windowStart(noon + 123_456, DAY_MS), Date.UTC(2026, 9, 21), "windows align, so every instance agrees");
});

test("the limits sit far above real use and well below an attack", () => {
  assert.deepEqual(DURABLE_LIMITS.signInFailuresPerEmail, { limit: 8, windowMs: 15 * 60 * 1000 });
  assert.equal(DURABLE_LIMITS.passwordResetsPerEmail.limit, 3, "nobody's inbox can be flooded through Racked");
  assert.equal(DURABLE_LIMITS.signUpsSiteWide.limit, 100);
  assert.deepEqual(AI_DAILY_ALLOWANCE, { scan: 40, hanger: 120, "brand-describe": 40, "brand-hanger": 60 });
});

test("an account past its AI allowance — counted in requests — is told plainly", () => {
  const refused = aiAllowance("hanger", 121, noon);
  assert.ok(!refused.allowed && refused.scope === "account");
  assert.ok(!refused.allowed && /120 messages today/.test(refused.message));
  assert.ok(!refused.allowed && refused.retryAfterSeconds === 12 * 60 * 60, "it resets at midnight UTC");
  assert.deepEqual(aiAllowance("scan", 40, noon), { allowed: true }, "the 40th scan is still allowed");
});

test("the site's ceiling counts model calls, and is configurable", () => {
  assert.equal(DEFAULT_AI_DAILY_CEILING, 1_500);
  assert.equal(siteModelCallAllowed(1_500, 1_500), true, "the 1,500th call is allowed");
  assert.equal(siteModelCallAllowed(1_501, 1_500), false);
  assert.equal(aiDailyCeiling(undefined), DEFAULT_AI_DAILY_CEILING);
  assert.equal(aiDailyCeiling("250"), 250, "configurable with AI_DAILY_CEILING");
  assert.equal(aiDailyCeiling("-5"), DEFAULT_AI_DAILY_CEILING, "nonsense falls back to the default");
  assert.equal(aiDailyCeiling("abc"), DEFAULT_AI_DAILY_CEILING);
});

test("an unreadable budget refuses without blaming the person", () => {
  const refused = aiUnavailable();
  assert.ok(!refused.allowed && refused.scope === "unavailable" && refused.message === AI_UNAVAILABLE_MESSAGE);
  assert.doesNotMatch(AI_UNAVAILABLE_MESSAGE, /you've|your/i);
});

test("a paused email is told how long, and pointed at password reset", () => {
  assert.equal(signInPausedMessage(61), "Too many sign-in attempts for this email address. Try again in 2 minutes, or reset your password.");
  assert.match(signInPausedMessage(5), /1 minute,/);
});

test("counters and failed sign-ins are stored under keyed hashes, never a raw email", () => {
  const store = read("lib/server/production-store.ts");
  assert.match(store, /function securityKey\(value:string\)\{return createHmac\("sha256",requireAccountSecuritySecret\(\)\)/);
  assert.match(store, /Key:\{PK:`LIMIT#\$\{securityKey\(name\)\}`,SK:`WINDOW#\$\{start\}`\}/);
  assert.match(store, /UpdateExpression:"ADD #count :one SET #ttl = if_not_exists\(#ttl, :ttl\)"/, "atomic, and each window expires on its own");
  assert.match(store, /PK:`SIGNIN#\$\{securityKey\(normalizeEmail\(email\)\)\}`/);
});

test("sign-in checks fail open; AI budgets fail closed", () => {
  const guard = read("lib/server/abuse-guard.ts");
  assert.equal((guard.match(/failOpen\(/g) ?? []).length, 8, "the six sign-in, known-device, sign-up and reset checks, the per-address check, plus the helper");
  assert.match(guard, /return chargeAccountAllowance\(incrementSecurityCounter, action, accountId, now\);/, "the account allowance uses the fail-closed charge");
  assert.match(guard, /return chargeSiteModelCall\(incrementSecurityCounter\);/, "and so does the site's ceiling");
});

test("sign-in checks the shared pause first, and counts every wrong password the same way", () => {
  const login = read("app/api/auth/login/route.ts");
  assert.ok(login.indexOf("await signInPause(email)") < login.indexOf("await authenticateAccount("), "paused emails never reach the password check");
  assert.match(login, /signInPausedMessage\(paused\.retryAfterSeconds\)/);
  assert.match(login, /if\(!account\)\{[\s\S]*?await Promise\.all\(\[countSignInFailure\(email\),\.\.\.\(deviceSigned\?\[countKnownDeviceFailure\(deviceToken!\)\]:\[\]\),recordFailedSignIn\(email,device\)/, "unknown email and wrong password do the same work");
});

test("REGRESSION: a known-device cookie has its own failure budget, so a copied cookie cannot guess without limit", () => {
  const login = read("app/api/auth/login/route.ts");
  assert.match(login, /const knownDevice=deviceSigned&&\(await knownDevicePause\(deviceToken!\)\)\.allowed;/, "past its budget the cookie exempts nothing");
  assert.match(login, /deviceSigned\?\[countKnownDeviceFailure\(deviceToken!\)\]:\[\]/, "every wrong password with a signed cookie is counted against the cookie");
  const guard = read("lib/server/abuse-guard.ts");
  assert.match(guard, /readSecurityCounter\(`sign-in-failures-device:\$\{deviceToken\}`, rule\.windowMs, now\)/);
  assert.match(guard, /incrementSecurityCounter\(`sign-in-failures-device:\$\{deviceToken\}`, DURABLE_LIMITS\.signInFailuresPerEmail\.windowMs, now\)/);
});

test("a known device is exempt from the per-email pauses, and only those", () => {
  const login = read("app/api/auth/login/route.ts");
  assert.match(login, /const client=clientIdentifier\(request\);\s*const byClient=consumeRateLimit\(`login:\$\{client\}`/, "the per-client limit always applies");
  assert.match(login, /const byAddress=byClient\.allowed&&byEmail\.allowed\?await claimAddressRequest\("sign-in",client\):byClient;/, "and the same address across every instance");
  assert.match(login, /const byEmail=knownDevice\?byClient:consumeRateLimit\(`login-email:/);
  assert.match(login, /if\(!knownDevice\)\{\s*const paused=await signInPause\(email\);/);
  assert.match(login, /const known=knownDeviceCookie\(email,secret,production\);\s*response\.cookies\.set\(known\.name,known\.value,known\.options\);/, "issued on a successful sign-in");
  assert.match(read("app/api/auth/password-reset/confirm/route.ts"), /knownDeviceCookie\(email,secret,/, "and on a completed password reset, which proves the inbox");
});

test("every model-backed route spends its allowance first, and meters each model call", () => {
  const detect = read("app/api/garments/detect/route.ts");
  assert.ok(detect.indexOf('spendAiAllowance("scan",session.subject)') < detect.indexOf("await detectLookOrManualReview("));
  assert.match(detect, /\{detect:metered\(spendSiteModelCall,detectGarmentsInLook\)\}/);
  const describe = read("app/api/brand/products/describe/route.ts");
  assert.ok(describe.indexOf('spendAiAllowance("brand-describe", session.subject)') < describe.indexOf("await detectLookOrManualReview("));
  assert.match(describe, /\{ detect: metered\(spendSiteModelCall, detectGarmentsInLook\) \}/);
  assert.match(describe, /if \(recognition\.aiPaused\) return/, "a paused budget is not described as an unreadable photo");
  const consumer = read("app/api/agents/consumer/route.ts");
  assert.ok(consumer.indexOf('spendAiAllowance("hanger", subject)') < consumer.indexOf("await runHangerAgent("));
  assert.match(consumer, /\}, metered\(spendSiteModelCall, bedrockAgentConverse\)\)\.catch\(\(\) => null\);/, "every agent round is metered");
  assert.match(consumer, /\}, meteredOrNull\(spendSiteModelCall, bedrockHangerConverse\)\);/, "and the plain reply");
  assert.match(consumer, /const agentAttempted = isAgentEnabled\(\) && !aiPaused;/, "an unreadable allowance runs no agent");
  assert.match(consumer, /allowModel: !aiPaused && /, "and no plain model call either");
  assert.match(consumer, /aiPaused \? \{ degradedReason: AI_PAUSED_REASON \}/, "and the reply says why");
  const brand = read("app/api/agents/brand/route.ts");
  assert.match(brand, /metrics\.suppressed \? \{ allowed: true as const \} : await spendAiAllowance\("brand-hanger", session\.subject\)/, "below the privacy threshold no model is called, so nothing is spent");
  assert.match(brand, /allowance\.allowed \? meteredOrNull\(spendSiteModelCall, bedrockHangerConverse\) : async \(\) => null\)/, "a refused budget answers from released aggregates alone");
});

test("no route reaches a Bedrock runner without the meter", () => {
  // The four runners that call a paid model in production. Anything else that calls Bedrock is
  // reachable only from scripts and tests (bedrock-timeout.test.ts lists every call site).
  for (const path of ["app/api/garments/detect/route.ts", "app/api/brand/products/describe/route.ts", "app/api/agents/consumer/route.ts", "app/api/agents/brand/route.ts"]) {
    const code = read(path).split("\n").filter((line) => !line.startsWith("import ")).join("\n");
    for (const runner of ["detectGarmentsInLook", "bedrockAgentConverse", "bedrockHangerConverse"]) {
      const uses = code.match(new RegExp(`\\b${runner}\\b`, "g")) ?? [];
      const metered = code.match(new RegExp(`metered(?:OrNull)?\\(spendSiteModelCall,\\s*${runner}\\)`, "g")) ?? [];
      assert.equal(uses.length, metered.length, `${path}: every use of ${runner} is metered`);
    }
  }
});

test("sign-ups and reset emails are capped across every instance", () => {
  const register = read("app/api/auth/register/route.ts");
  assert.ok(register.indexOf("await claimSignUp()") < register.indexOf("await createAccount("));
  const reset = read("app/api/auth/password-reset/request/route.ts");
  assert.match(reset, /\(await claimPasswordResetEmail\(body\.email\)\)\.allowed/);
  assert.equal((reset.match(/GENERIC_RESET_RESPONSE\},\{status:202\}/g) ?? []).length, 2, "every outcome answers the same way");
});

test("every write endpoint that had no limit now has one, keyed on the account", () => {
  const checks: Array<[string, RegExp]> = [
    ["app/api/wears/route.ts", /consumeRateLimit\(`wear:\$\{session\.subject\}`,RATE_LIMIT_RULES\.wearRecord\)/],
    ["app/api/consumer/consent/route.ts", /consumeRateLimit\(`consent:\$\{session\.subject\}`,RATE_LIMIT_RULES\.consentChange\)/],
    ["app/api/brand/products/route.ts", /consumeRateLimit\(`brand-enroll:\$\{session\.subject\}`,RATE_LIMIT_RULES\.brandProductEnroll\)/],
    ["app/api/brand/looks/route.ts", /consumeRateLimit\(`brand-look:\$\{session\.subject\}`,RATE_LIMIT_RULES\.brandLookPublish\)/],
    ["app/api/consumer/wardrobe/route.ts", /consumeRateLimit\(`wardrobe-save:\$\{session\.subject\}`,RATE_LIMIT_RULES\.wardrobeWrite\)/],
  ];
  for (const [path, pattern] of checks) assert.match(read(path), pattern, path);
  const outfits = read("app/api/consumer/outfits/route.ts");
  assert.equal((outfits.match(/`outfit-write:\$\{session\.subject\}`/g) ?? []).length, 3, "saving, editing, and deleting outfits");
});

test("the table expires counters, activity, and reset tokens on its own", () => {
  assert.match(read("infra/template.yaml"), /TimeToLiveSpecification:\s*\n\s*AttributeName: ttl\s*\n\s*Enabled: true/);
});

test("signed-out routes also limit each address across every instance, never a missing one", () => {
  assert.deepEqual(DURABLE_LIMITS.signInsPerAddress, { limit: 30, windowMs: 5 * 60 * 1000 });
  assert.deepEqual(DURABLE_LIMITS.signUpsPerAddress, { limit: 20, windowMs: 60 * 60 * 1000 });
  assert.deepEqual(DURABLE_LIMITS.resetRequestsPerAddress, { limit: 10, windowMs: 60 * 60 * 1000 });
  for (const [name, local] of [["signInsPerAddress", RATE_LIMIT_RULES.login], ["signUpsPerAddress", RATE_LIMIT_RULES.register], ["resetRequestsPerAddress", RATE_LIMIT_RULES.passwordResetRequest]] as const) {
    const shared = DURABLE_LIMITS[name];
    assert.ok(shared.limit / shared.windowMs >= local.limit / local.windowMs, `${name} never undercuts the per-instance limit, so a venue's shared Wi-Fi is not locked out by it`);
  }
  const guard = read("lib/server/abuse-guard.ts");
  const claim = guard.slice(guard.indexOf("export async function claimAddressRequest"), guard.indexOf("export async function claimTwoStepAttempt"));
  assert.match(claim, /if \(address === UNIDENTIFIED_CLIENT\) return OPEN;/, "one key for every unreadable address would let a script lock everyone out");
  assert.match(claim, /incrementSecurityCounter\(`address:\$\{action\}:\$\{address\}`, rule\.windowMs, now\)/);
  assert.match(claim, /failOpen\(/);
  assert.match(read("app/api/auth/register/route.ts"), /const limit=local\.allowed\?await claimAddressRequest\("sign-up",client\):local;/);
  assert.match(read("app/api/auth/password-reset/request/route.ts"), /const limit=local\.allowed\?await claimAddressRequest\("reset-request",client\):local;/);
});
