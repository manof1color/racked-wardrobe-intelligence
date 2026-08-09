import test from "node:test";
import assert from "node:assert/strict";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES, resetRateLimits } from "../lib/rate-limit.ts";

const rule = { limit: 3, windowMs: 60_000 };

test("rate limiter allows requests under the limit and blocks the excess", () => {
  resetRateLimits();
  const now = 1_000_000;
  assert.equal(consumeRateLimit("k", rule, now).allowed, true);
  assert.equal(consumeRateLimit("k", rule, now + 1).allowed, true);
  assert.equal(consumeRateLimit("k", rule, now + 2).allowed, true);
  const blocked = consumeRateLimit("k", rule, now + 3);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.ok(blocked.retryAfterSeconds <= 60);
});

test("rate limiter frees capacity after the window slides", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let index = 0; index < rule.limit; index++) consumeRateLimit("k", rule, now + index);
  assert.equal(consumeRateLimit("k", rule, now + 10).allowed, false);
  assert.equal(consumeRateLimit("k", rule, now + rule.windowMs + 1).allowed, true);
});

test("rate limiter keys are isolated from each other", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let index = 0; index < rule.limit; index++) consumeRateLimit("first", rule, now);
  assert.equal(consumeRateLimit("first", rule, now).allowed, false);
  assert.equal(consumeRateLimit("second", rule, now).allowed, true);
});

test("every published rule has a positive limit and window", () => {
  for (const [name, value] of Object.entries(RATE_LIMIT_RULES)) {
    assert.ok(value.limit > 0, `${name} limit`);
    assert.ok(value.windowMs > 0, `${name} window`);
  }
});

test("client identifier uses the first forwarded address and never returns raw junk", () => {
  assert.equal(clientIdentifier(new Request("https://racked.test", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
  assert.equal(clientIdentifier(new Request("https://racked.test")), "unidentified-client");
  assert.equal(clientIdentifier(new Request("https://racked.test", { headers: { "x-forwarded-for": "x".repeat(200) } })), "unidentified-client");
});
