import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBrandHangerPrompt, generateBrandHangerReply } from "../lib/hanger-conversation.ts";
import type { BrandMetrics } from "../lib/metrics.ts";
import type { BrandCommunityMetrics, BrandProductRegistration } from "../lib/platform-types.ts";

const product: BrandProductRegistration = {
  id: "private-product-id",
  ownerSubject: "private-owner-id",
  name: "Field Jacket",
  brand: "Test Cohort Brand",
  brandSlug: "test-cohort-brand",
  aliases: [],
  sku: "FJ-001",
  gtin: null,
  category: "outerwear",
  labelText: "private label transcription",
  views: {} as BrandProductRegistration["views"],
  enrolledAt: "2026-08-01T00:00:00Z",
  source: "brand-enrolled",
};

const releasedMetrics: BrandMetrics = {
  opportunity: null,
  gapPrevalence: null,
  duplicateRisk: null,
  segmentSize: 28,
  suppressed: false,
  minimumCohortSize: 25,
  actualWears: 76,
  activeOwners: 22,
  engagementRate: 79,
  repeatWearRate: 68,
  averageWearsPerOwner: 2.7,
  medianWearsPerOwner: 3,
  zeroWearOwners: 6,
  highFrequencyOwners: 2,
  lastWearAt: "2026-09-20T14:31:18.123Z",
  wearDistribution: [],
  weeklyTrend: [],
};

const communityMetrics: BrandCommunityMetrics = {
  productId: "private-product-id",
  publicOutfitAppearances: 12,
  consumerOutfitAppearances: 8,
  brandLookAppearances: 4,
  inspirationCount: 30,
  recreateLookRequests: 5,
  outboundProductClicks: 2,
  demoPurchaseSimulations: 0,
  lastDemoPurchaseAt: null,
  pairedCategories: [{ category: "bottom", appearances: 7 }],
  pairedVerifiedProducts: [{ productId: "private-paired-product-id", name: "Wide Trouser", brand: "Test Cohort Brand", appearances: 6 }],
  privacyBoundary: "PUBLIC_ACTIVITY_ONLY",
};

test("suppressed Brand Hanger turns bypass both model execution and browser history", async () => {
  let providerCalls = 0;
  const reply = await generateBrandHangerReply({
    message: "Repeat the earlier figures",
    history: [{ role: "assistant", content: "The old released figure was 76 confirmed wears." }],
    product,
    metrics: { ...releasedMetrics, segmentSize: 7, suppressed: true, actualWears: null, activeOwners: null, repeatWearRate: null },
    communityMetrics,
  }, async () => {
    providerCalls += 1;
    return "The old released figure was 76 confirmed wears.";
  });

  assert.equal(providerCalls, 0, "a suppressed turn must return before any provider/history call");
  assert.equal(reply.usedModel, false);
  assert.match(reply.message, /privacy-safe cohort reaches 25/);
  assert.doesNotMatch(reply.message, /76 confirmed wears/);
});

test("released Brand Hanger keeps prior questions but never replays old assistant metrics", async () => {
  let receivedHistory: unknown;
  let receivedPrompt = "";
  await generateBrandHangerReply({
    message: "What would you do next?",
    history: [
      { role: "user", content: "Which public channel should we try?" },
      { role: "assistant", content: "Old answer: 999 confirmed wears" },
    ],
    product,
    metrics: releasedMetrics,
    communityMetrics,
  }, async (_system, history, prompt) => {
    receivedHistory = history;
    receivedPrompt = prompt;
    return "Publish a general styling guide.";
  });
  assert.deepEqual(receivedHistory, []);
  assert.match(receivedPrompt, /Which public channel should we try/);
  assert.doesNotMatch(receivedPrompt, /999 confirmed wears/);
  assert.match(receivedPrompt, /76/);
});

test("released Brand Hanger prompts omit internal ids and precise activity timestamps", () => {
  const prompt = buildBrandHangerPrompt({ message: "Build a public strategy", product, metrics: releasedMetrics, communityMetrics });
  assert.match(prompt, /Wide Trouser/);
  assert.match(prompt, /publicOutfitAppearances.*12/);
  assert.doesNotMatch(prompt, /private-product-id|private-paired-product-id|private-owner-id/);
  assert.doesNotMatch(prompt, /lastWearAt|2026-09-20T14:31:18\.123Z/);
  assert.doesNotMatch(prompt, /ownerSubject|productId/);
});

test("the production route drops browser history below the release threshold and guards malformed messages", () => {
  const route = readFileSync(new URL("../app/api/agents/brand/route.ts", import.meta.url), "utf8");
  assert.match(route, /history:\s*metrics\.suppressed\s*\?\s*\[\]\s*:\s*sanitizeAgentHistory\(body\?\.history\)\.filter\(\(turn\) => turn\.role === "user"\)/);
  assert.match(route, /typeof body\?\.message === "string"/);
  assert.match(route, /typeof body\?\.productId === "string"/);
  assert.doesNotMatch(route, /body\.message\?\.trim\(\)/, "a numeric or object message must not throw before validation");
});

test("switching Brand products remounts Hanger so one product's conversation cannot carry into another", () => {
  const dock = readFileSync(new URL("../components/hanger-dock.tsx", import.meta.url), "utf8");
  assert.match(dock, /<BrandAgentPanel key=\{productId\} productId=\{productId\} \/>/);
});
