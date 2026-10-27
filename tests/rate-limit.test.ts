import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES, resetClientCalibration, resetRateLimits, trackedRateLimitKeys } from "../lib/rate-limit.ts";

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

const from = (forwarded?: string) => new Request("https://racked.test", forwarded === undefined ? {} : { headers: { "x-forwarded-for": forwarded } });

test("client identifier never returns raw junk", () => {
  resetClientCalibration();
  assert.equal(clientIdentifier(from(), undefined), "unidentified-client");
  assert.equal(clientIdentifier(from("x".repeat(200)), undefined), "unidentified-client");
  assert.equal(clientIdentifier(from("not-an-address"), undefined), "unidentified-client");
});

// REGRESSION: the first X-Forwarded-For entry is whatever the client wrote, so a script rotating
// made-up addresses got a fresh sign-in budget every time.
test("REGRESSION: addresses a client writes into X-Forwarded-For are ignored", () => {
  resetClientCalibration();
  // Behind CloudFront and one more proxy, an ordinary browser's request arrives with two entries.
  assert.equal(clientIdentifier(from("198.51.100.7, 130.176.1.1"), undefined), "198.51.100.7");
  // A script prepends made-up addresses; the platform's two entries still end the chain.
  for (const spoofed of ["1.1.1.1", "2.2.2.2, 3.3.3.3", "9.9.9.9"]) {
    assert.equal(clientIdentifier(from(`${spoofed}, 203.0.113.50, 130.176.1.1`), undefined), "203.0.113.50", spoofed);
  }
  resetRateLimits();
  let allowed = 0;
  for (let attempt = 0; attempt < 25; attempt++) {
    if (consumeRateLimit(`login:${clientIdentifier(from(`10.0.${attempt}.1, 203.0.113.50, 130.176.1.1`), undefined)}`, RATE_LIMIT_RULES.login).allowed) allowed += 1;
  }
  assert.equal(allowed, RATE_LIMIT_RULES.login.limit, "rotating made-up addresses no longer resets the budget");
});

test("with one platform hop, the last entry is the client; a configured hop count wins", () => {
  resetClientCalibration();
  assert.equal(clientIdentifier(from("198.51.100.7"), undefined), "198.51.100.7");
  assert.equal(clientIdentifier(from("6.6.6.6, 198.51.100.7"), undefined), "198.51.100.7");
  resetClientCalibration();
  assert.equal(clientIdentifier(from("6.6.6.6, 198.51.100.7, 130.176.1.1"), "2"), "198.51.100.7", "RACKED_TRUSTED_PROXY_HOPS=2");
  assert.equal(clientIdentifier(from("130.176.1.1"), "2"), "unidentified-client", "fewer entries than the platform adds");
});

test("REGRESSION: a flood of new keys never resets the counter of a key in use", () => {
  // The limiter used to clear every counter once it tracked 10,000 keys, so an attacker guessing
  // passwords could reset their own budget by sending requests under thousands of new keys.
  resetRateLimits();
  const now = 1_000_000;
  for (let index = 0; index < rule.limit; index++) consumeRateLimit("guessing", rule, now);
  for (let index = 0; index < 15_000; index++) {
    consumeRateLimit(`flood-${index}`, rule, now + 1);
    if (index % 100 === 0) assert.equal(consumeRateLimit("guessing", rule, now + 1).allowed, false, `still limited after ${index} new keys`);
    assert.ok(trackedRateLimitKeys() <= 10_000, "memory stays bounded");
  }
});

test("when room is needed, only the least recently used key is dropped", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let index = 0; index < 10_000; index++) consumeRateLimit(`key-${index}`, rule, now);
  for (let index = 0; index < rule.limit - 1; index++) consumeRateLimit("key-0", rule, now);
  consumeRateLimit("newcomer", rule, now);
  assert.equal(trackedRateLimitKeys(), 10_000);
  assert.equal(consumeRateLimit("key-0", rule, now).allowed, false, "key-0 was used most recently, so it keeps its count");
  for (let index = 0; index < rule.limit - 1; index++) assert.equal(consumeRateLimit("key-1", rule, now).allowed, true, "key-1 was dropped and starts again");
});

test("account changes are limited per account, not per account and address", () => {
  const route = readFileSync(new URL("../app/api/account/route.ts", import.meta.url), "utf8");
  assert.match(route, /consumeRateLimit\(`account:\$\{session\.subject\}`,RATE_LIMIT_RULES\.accountSettings\)/);
  assert.match(route, /consumeRateLimit\(`account-delete:\$\{session\.subject\}`,RATE_LIMIT_RULES\.accountDeletion\)/);
  assert.doesNotMatch(route, /clientIdentifier/, "a new address must not mean a new budget");
});
