/**
 * Shared limits and the AI spending guard. The in-memory limiter lives in each server instance, so
 * these are counted in DynamoDB and hold across all of them; they are keyed on what an attack aims
 * at — an email address, an account, the site's AI budget — and stored only as keyed hashes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_DAILY_ALLOWANCE, aiAllowance, aiDailyCeiling, DAY_MS, DEFAULT_AI_DAILY_CEILING, DURABLE_LIMITS, durableDecision, SITE_PAUSE_MESSAGE, signInPausedMessage, windowStart } from "../lib/abuse-limits.ts";

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

test("an account past its AI allowance is told plainly, before the site ceiling is considered", () => {
  const refused = aiAllowance("hanger", 121, 5, noon, 1000);
  assert.equal(refused.allowed, false);
  assert.ok(!refused.allowed && refused.scope === "account");
  assert.ok(!refused.allowed && /120 messages today/.test(refused.message));
  assert.ok(!refused.allowed && refused.retryAfterSeconds === 12 * 60 * 60, "it resets at midnight UTC");
  assert.deepEqual(aiAllowance("scan", 40, 999, noon, 1000), { allowed: true }, "the 40th scan is still allowed");
});

test("the site's daily AI ceiling pauses the AI for everyone, with its own message", () => {
  const paused = aiAllowance("scan", 1, 1001, noon, 1000);
  assert.ok(!paused.allowed && paused.scope === "site" && paused.message === SITE_PAUSE_MESSAGE);
  assert.equal(aiDailyCeiling(undefined), DEFAULT_AI_DAILY_CEILING);
  assert.equal(aiDailyCeiling("250"), 250, "configurable with AI_DAILY_CEILING");
  assert.equal(aiDailyCeiling("-5"), DEFAULT_AI_DAILY_CEILING, "nonsense falls back to the default");
  assert.equal(aiDailyCeiling("abc"), DEFAULT_AI_DAILY_CEILING);
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

test("a storage failure never locks everyone out: the shared checks fail open", () => {
  const guard = read("lib/server/abuse-guard.ts");
  assert.equal((guard.match(/failOpen\(/g) ?? []).length, 6, "every check, plus the helper");
  assert.match(guard, /return \{ allowed: true \};\s*\}\s*\}\s*$/, "the AI allowance too");
});

test("sign-in checks the shared pause first, and counts every wrong password the same way", () => {
  const login = read("app/api/auth/login/route.ts");
  assert.ok(login.indexOf("await signInPause(body.email)") < login.indexOf("await authenticateAccount("), "paused emails never reach the password check");
  assert.match(login, /signInPausedMessage\(paused\.retryAfterSeconds\)/);
  assert.match(login, /if\(!account\)\{[\s\S]*?await Promise\.all\(\[countSignInFailure\(body\.email\),recordFailedSignIn\(body\.email,device\)/, "unknown email and wrong password do the same work");
});

test("every model-backed route spends its allowance before calling a model", () => {
  const detect = read("app/api/garments/detect/route.ts");
  assert.ok(detect.indexOf('spendAiAllowance("scan",session.subject)') < detect.indexOf("await detectLookOrManualReview("));
  const describe = read("app/api/brand/products/describe/route.ts");
  assert.ok(describe.indexOf('spendAiAllowance("brand-describe", session.subject)') < describe.indexOf("await detectLookOrManualReview("));
  const consumer = read("app/api/agents/consumer/route.ts");
  assert.ok(consumer.indexOf('spendAiAllowance("hanger", subject)') < consumer.indexOf("await runHangerAgent("));
  assert.match(consumer, /const agentAttempted = isAgentEnabled\(\) && !aiPaused;/, "past the site ceiling no agent runs");
  assert.match(consumer, /allowModel: !aiPaused && /, "and no plain model call either");
  assert.match(consumer, /aiPaused \? \{ degradedReason: SITE_PAUSE_REASON \}/, "and the reply says why");
  const brand = read("app/api/agents/brand/route.ts");
  assert.match(brand, /metrics\.suppressed \? \{ allowed: true as const \} : await spendAiAllowance\("brand-hanger", session\.subject\)/, "below the privacy threshold no model is called, so nothing is spent");
  assert.match(brand, /allowance\.allowed \? undefined : async \(\) => null\)/, "past the site ceiling, answered from released aggregates alone");
});

test("sign-ups and reset emails are capped across every instance", () => {
  const register = read("app/api/auth/register/route.ts");
  assert.ok(register.indexOf("await claimSignUp()") < register.indexOf("await createAccount("));
  const reset = read("app/api/auth/password-reset/request/route.ts");
  assert.match(reset, /\(await claimPasswordResetEmail\(body\.email\)\)\.allowed/);
  assert.equal((reset.match(/GENERIC_RESET_RESPONSE\},\{status:202\}/g) ?? []).length, 2, "every outcome answers the same way");
});

test("the table expires counters, activity, and reset tokens on its own", () => {
  assert.match(read("infra/template.yaml"), /TimeToLiveSpecification:\s*\n\s*AttributeName: ttl\s*\n\s*Enabled: true/);
});
