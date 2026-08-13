import test from "node:test";
import assert from "node:assert/strict";
import { brandReplyPassesPrivacyReview, buildBrandHangerPrompt, buildConsumerHangerPrompt, formatHangerText, normalizeProviderHistory, sanitizeAgentHistory, selectGroundedOutfit } from "../lib/hanger-conversation.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const wardrobe: WardrobeItem[] = [
  { id: "top-1", name: "Blue Oxford", category: "top", color: "blue", style: ["classic"], season: "all-season", wearCount: 1, lastWornDays: 21, source: "ai-confirmed", art: "photo", imageKey: "private/account/photo.png", brand: "Example Brand", identityStatus: "verified" },
  { id: "bottom-1", name: "Black Trouser", category: "bottom", color: "black", style: ["tailored"], season: "all-season", wearCount: 5, lastWornDays: 2, source: "ai-confirmed", art: "photo", identityStatus: "user-labeled" },
  { id: "shoe-1", name: "White Sneaker", category: "shoe", color: "white", style: ["casual"], season: "all-season", wearCount: 0, lastWornDays: 999, source: "manual", art: "photo", identityStatus: "unverified" },
];

test("Hanger bounds and cleans client-provided conversation history", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: ` turn ${index} ` }));
  const clean = sanitizeAgentHistory(history);
  assert.equal(clean.length, 8);
  assert.equal(clean[0].content, "turn 4");
  assert.equal(clean.at(-1)?.role, "assistant");
});

test("provider history starts with a user, alternates roles, and leaves room for the latest user prompt", () => {
  const history = normalizeProviderHistory([
    { role: "assistant", content: "UI introduction" },
    { role: "user", content: "First question" },
    { role: "user", content: "Extra detail" },
    { role: "assistant", content: "First answer" },
    { role: "user", content: "Orphaned draft" },
  ]);
  assert.deepEqual(history.map((turn) => turn.role), ["user", "assistant"]);
  assert.match(history[0].content, /First question\nExtra detail/);
});

test("consumer Hanger context includes useful wardrobe facts but excludes storage keys", () => {
  const suggested = selectGroundedOutfit(wardrobe, "Build a casual outfit");
  const prompt = buildConsumerHangerPrompt({ message: "Build a casual outfit", wardrobe, outfits: [], suggested });
  assert.match(prompt, /Blue Oxford/);
  assert.match(prompt, /candidateOutfitItemIds/);
  assert.doesNotMatch(prompt, /private\/account|imageKey|imageUrl/);
  assert.ok(suggested.every((item) => wardrobe.some((owned) => owned.id === item.id)));
});

test("brand Hanger receives only brand product fields and released aggregate metrics", () => {
  const product: BrandProductRegistration = {
    id: "internal-product-id", ownerSubject: "private-brand-owner", name: "Field Jacket", brand: "Test Cohort Brand", brandSlug: "test-cohort-brand", aliases: [], sku: "FJ-001", gtin: null, category: "outerwear", labelText: "private label transcription", views: {
      front: { view: "front", fileName: "front.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/front.jpg" },
      back: { view: "back", fileName: "back.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/back.jpg" },
      label: { view: "label", fileName: "label.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/label.jpg" },
    }, enrolledAt: "2026-08-01T00:00:00Z", source: "brand-enrolled",
  };
  const prompt = buildBrandHangerPrompt({ message: "Build a strategy", product, metrics: { opportunity: null, gapPrevalence: null, duplicateRisk: null, segmentSize: 28, suppressed: false, minimumCohortSize: 25, actualWears: 76, activeOwners: 22, engagementRate: 79, repeatWearRate: 68, averageWearsPerOwner: 2.7, medianWearsPerOwner: 3, zeroWearOwners: 6, highFrequencyOwners: 2, lastWearAt: null, wearDistribution: [], weeklyTrend: [] },communityMetrics:{productId:"internal-product-id",publicOutfitAppearances:12,consumerOutfitAppearances:8,brandLookAppearances:4,inspirationCount:30,recreateLookRequests:5,outboundProductClicks:2,pairedCategories:[{category:"bottom",appearances:7}],pairedVerifiedProducts:[],privacyBoundary:"PUBLIC_ACTIVITY_ONLY"} });
  assert.match(prompt, /76/);
  assert.match(prompt, /repeatWearRate/);
  assert.match(prompt, /publicOutfitAppearances.*12/);
  assert.doesNotMatch(prompt, /private-brand-owner|private\/front|label transcription|ownerSubject|storageKey/);
});

test("suppressed brand Hanger prompt contains the rule but not suppressed values", () => {
  const product = { id: "p", ownerSubject: "owner", name: "Ring", brand: "Small Brand", brandSlug: "small-brand", aliases: [], sku: "R-1", gtin: null, category: "jewelry", labelText: "", views: {} as BrandProductRegistration["views"], enrolledAt: "2026-08-01T00:00:00Z", source: "brand-enrolled" as const };
  const prompt = buildBrandHangerPrompt({ message: "What should we do?", product, metrics: { opportunity: null, gapPrevalence: null, duplicateRisk: null, segmentSize: 7, suppressed: true, minimumCohortSize: 25, actualWears: null, repeatWearRate: null, activeOwners: null } });
  assert.match(prompt, /No product-wear aggregates are released below 25/);
  assert.doesNotMatch(prompt, /eligibleOwners|actualWears|repeatWearRate|segmentSize/);
});

test("Hanger cleans model Markdown before rendering it as chat text", () => {
  assert.equal(formatHangerText("### Outfit\n- **Blue Oxford**"), "Outfit\n• Blue Oxford");
});

test("brand strategy review rejects individual outreach inferred from aggregates", () => {
  assert.equal(brandReplyPassesPrivacyReview("Target the 3 owners who have zero wears with a personalized email and discount code."), false);
  assert.equal(brandReplyPassesPrivacyReview("Publish public styling education and compare the next anonymous aggregate trend."), true);
});
