/**
 * The AI budgets, exercised rather than read: an in-memory counter stands in for DynamoDB's atomic
 * `ADD`, and the real agent loop and scan fallback run against it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_PAUSED_REASON } from "../lib/abuse-limits.ts";
import { AiBudgetExhausted, chargeAccountAllowance, chargeSiteModelCall, metered, meteredOrNull, type CounterIncrement } from "../lib/ai-budget.ts";
import { describeAgentFailure, plainReplyWorthTrying, runHangerAgent, type AgentConverse, type AgentFailure, type AgentInput, type AgentModelResponse } from "../lib/hanger-agent.ts";
import { detectLookOrManualReview } from "../lib/look-scan-resilience.ts";
import type { WardrobeItem } from "../lib/types.ts";

const noon = Date.UTC(2026, 9, 21, 12, 0, 0);

/** An atomic counter, as DynamoDB's ADD is: every caller sees a distinct, increasing count. */
function counter() {
  const counts = new Map<string, number>();
  const increment: CounterIncrement = async (name, windowMs, now) => {
    await Promise.resolve();
    const start = Math.floor(now / windowMs) * windowMs;
    const key = `${name}@${start}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return { count, resetAt: start + windowMs };
  };
  return { increment, counts };
}
const broken: CounterIncrement = async () => { throw Object.assign(new Error("connect ETIMEDOUT"), { name: "TimeoutError" }); };
const quietly = async <T>(work: () => Promise<T>) => {
  const original = console.error;
  console.error = () => undefined;
  try { return await work(); } finally { console.error = original; }
};

test("an account's allowance counts requests and refuses the one past it", async () => {
  const { increment } = counter();
  for (let scan = 1; scan <= 40; scan++) assert.deepEqual(await chargeAccountAllowance(increment, "scan", "account-a", noon), { allowed: true }, `scan ${scan}`);
  const refused = await chargeAccountAllowance(increment, "scan", "account-a", noon);
  assert.ok(!refused.allowed && refused.scope === "account");
  assert.deepEqual(await chargeAccountAllowance(increment, "scan", "account-b", noon), { allowed: true }, "another account has its own allowance");
  assert.deepEqual(await chargeAccountAllowance(increment, "scan", "account-a", noon + 12 * 60 * 60 * 1000), { allowed: true }, "a new UTC day starts afresh");
});

test("REGRESSION: an unreadable counter refuses paid AI instead of allowing it", async () => {
  const account = await quietly(() => chargeAccountAllowance(broken, "hanger", "account-a", noon));
  assert.ok(!account.allowed && account.scope === "unavailable", "the account allowance fails closed");
  assert.equal(await quietly(() => chargeSiteModelCall(broken, noon, 1_500)), false, "and so does the site's ceiling");
});

test("concurrent model calls cannot overshoot the site's ceiling", async () => {
  const { increment } = counter();
  const results = await Promise.all(Array.from({ length: 50 }, () => chargeSiteModelCall(increment, noon, 10)));
  assert.equal(results.filter(Boolean).length, 10, "exactly the ceiling, however the calls interleave");
});

test("metered spends one unit per call and never calls the model once refused", async () => {
  let spent = 0, called = 0;
  const allowTwo = async () => ++spent <= 2;
  const model = metered(allowTwo, async (value: number) => { called += 1; return value * 2; });
  assert.equal(await model(1), 2);
  assert.equal(await model(2), 4);
  await assert.rejects(model(3), AiBudgetExhausted);
  assert.equal(called, 2, "the third call never reached the model");
  const reply = meteredOrNull(async () => false, async () => { called += 1; return "model text"; });
  assert.equal(await reply(), null, "a refused reply runner answers null, which means: no model reply");
  assert.equal(called, 2);
});

const make = (id: string, name: string, category: string, subtype: string, color: string): WardrobeItem => ({
  id, name, category, subtype, color, pattern: "solid", material: "cotton", style: ["casual"], season: "all-season",
  wearCount: 2, lastWornDays: 10, source: "ai-confirmed", art: "photo",
} as WardrobeItem);
const wardrobe = [make("tee", "Navy T Shirt", "top", "t-shirt", "navy"), make("jeans", "Blue Jeans", "bottom", "jeans", "blue"), make("sneakers", "White Sneakers", "shoe", "sneakers", "white")];
const agentInput = (overrides: Partial<AgentInput> = {}): AgentInput => ({
  message: "what goes with my jeans", history: [], wardrobe, forecast: null, activeOutfit: [], remembered: "", rankingBase: {},
  loadTrends: async () => null, today: new Date("2026-10-21T12:00:00Z"), ...overrides,
});
const search = (id: string): AgentModelResponse => ({ content: [{ toolUse: { toolUseId: id, name: "search_wardrobe", input: { color: "blue" } as never } }], stopReason: "tool_use" });
const say = (text: string): AgentModelResponse => ({ content: [{ text }], stopReason: "end_turn" });

test("REGRESSION: one Hanger message that runs four model rounds spends four model calls", async () => {
  const { increment, counts } = counter();
  const responses = [search("a"), search("b"), search("c"), say("The navy tee with the blue jeans.")];
  let calls = 0;
  const model: AgentConverse = async () => responses[calls++];
  const result = await runHangerAgent(agentInput(), metered(() => chargeSiteModelCall(increment, noon, 1_500), model));
  assert.equal(result?.message, "The navy tee with the blue jeans.");
  assert.equal([...counts.values()][0], 4, "the ceiling counts what Bedrock bills, not the one request");
});

test("a ceiling reached mid-conversation stops the agent where it is, and says why", async () => {
  const { increment } = counter();
  let calls = 0;
  const model: AgentConverse = async () => { calls += 1; return search(`round-${calls}`); };
  let failure: AgentFailure | null = null;
  const result = await quietly(async () => runHangerAgent(agentInput({ onFallback: (reason) => { failure = reason; } }), metered(() => chargeSiteModelCall(increment, noon, 2), model)));
  assert.equal(result, null, "the grounded reply answers instead");
  assert.equal(calls, 2, "two rounds fitted under the ceiling; the third never reached the model");
  assert.equal(failure!.kind, "budget");
  assert.equal(describeAgentFailure(failure!), AI_PAUSED_REASON);
  assert.equal(plainReplyWorthTrying(failure), false, "and no plain model reply is attempted after it");
});

test("a refused scan becomes an editable item, marked as paused rather than unreadable", async () => {
  let called = false;
  const recognition = await quietly(() => detectLookOrManualReview(
    { base64: "", contentType: "image/jpeg" },
    { detect: metered(async () => false, async () => { called = true; return []; }) },
  ));
  assert.equal(called, false, "no model call");
  assert.equal(recognition.providerFailed, true);
  assert.equal(recognition.aiPaused, true);
  assert.equal(recognition.detections.length, 1, "one item for the person to fill in by hand");
  const outage = await quietly(() => detectLookOrManualReview({ base64: "", contentType: "image/jpeg" }, { detect: async () => { throw new Error("ThrottlingException"); } }));
  assert.equal(outage.aiPaused, false, "a provider outage is not reported as a paused budget");
});
