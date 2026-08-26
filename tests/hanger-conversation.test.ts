import test from "node:test";
import assert from "node:assert/strict";
import { brandReplyPassesPrivacyReview, buildBrandHangerPrompt, buildConsumerHangerPrompt, consumerReplyPassesSelectionReview, formatHangerText, generateConsumerHangerReply, groundedSelectionText, hangerOutfitName, MAX_PRIOR_SUGGESTION_IDS, normalizeProviderHistory, ownedSuggestionItemIds, sanitizeAgentHistory, selectGroundedOutfit } from "../lib/hanger-conversation.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

function ownedItem(id:string,name:string,category:string):WardrobeItem{return {id,name,category,color:"black",style:[],season:"all-season",wearCount:0,lastWornDays:999,source:"manual",art:"photo"};}

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
  assert.match(prompt, /candidateOutfit/);
  assert.match(prompt, /White Sneaker/);
  assert.doesNotMatch(prompt, /private\/account|imageKey|imageUrl/);
  assert.ok(suggested.every((item) => wardrobe.some((owned) => owned.id === item.id)));
});

test("prior recommendation ids are bounded to garments the signed-in account owns", () => {
  assert.deepEqual(ownedSuggestionItemIds(["top-1", "foreign-item", "top-1", 42], wardrobe), ["top-1"]);
  assert.deepEqual(ownedSuggestionItemIds("top-1", wardrobe), []);
});

test("prior recommendation memory no longer forgets garments after ten ids", () => {
  const expanded=Array.from({length:24},(_,index)=>ownedItem(`owned-${index}`,`Owned ${index}`,index%2?"top":"bottom"));
  const remembered=ownedSuggestionItemIds(expanded.map(entry=>entry.id),expanded);
  assert.equal(remembered.length,24,"four-piece recommendations must remain remembered beyond the third turn");
  const oversized=Array.from({length:MAX_PRIOR_SUGGESTION_IDS+20},(_,index)=>ownedItem(`bounded-${index}`,`Bounded ${index}`,"top"));
  assert.equal(ownedSuggestionItemIds(oversized.map(entry=>entry.id),oversized).length,MAX_PRIOR_SUGGESTION_IDS,"client history remains server-bounded");
});

test("saved Hanger outfits are named from their actual selected pieces", () => {
  assert.equal(hangerOutfitName(wardrobe.slice(0, 2)), "Hanger: Blue Oxford + Black Trouser");
  assert.equal(hangerOutfitName(wardrobe), "Hanger: Blue Oxford + Black Trouser + White Sneaker");
  assert.equal(hangerOutfitName([]), "Hanger outfit");
});

test("Hanger's canonical words list the same selected garments shown and saved", () => {
  assert.equal(groundedSelectionText(wardrobe.slice(0, 2)), "Selected outfit — these exact pieces appear in the photos and Save action:\n• Blue Oxford (top)\n• Black Trouser (bottom)");
  assert.equal(consumerReplyPassesSelectionReview("Pair Blue Oxford with Black Trouser.", wardrobe, wardrobe.slice(0, 2)), true);
  assert.equal(consumerReplyPassesSelectionReview("Pair Blue Oxford with White Sneaker.", wardrobe, wardrobe.slice(0, 2)), false);
});

test("Hanger acknowledges a required piece instead of claiming low-wear selection", async () => {
  const reply = await generateConsumerHangerReply({
    message: "Use my Blue Oxford",
    history: [],
    wardrobe,
    outfits: [],
    suggested: wardrobe.slice(0, 2),
    required: wardrobe.slice(0, 1),
  });
  assert.match(reply.message, /explicitly asked to use that piece/);
  assert.doesNotMatch(reply.message, /prioritized lower-wear pieces/);
  const prompt = buildConsumerHangerPrompt({ message: "Use my Blue Oxford", wardrobe, outfits: [], suggested: wardrobe.slice(0, 2), required: wardrobe.slice(0, 1) });
  assert.match(prompt, /"directlyRequested":true/);
});

test("brand Hanger receives only brand product fields and released aggregate metrics", () => {
  const product: BrandProductRegistration = {
    id: "internal-product-id", ownerSubject: "private-brand-owner", name: "Field Jacket", brand: "Test Cohort Brand", brandSlug: "test-cohort-brand", aliases: [], sku: "FJ-001", gtin: null, category: "outerwear", labelText: "private label transcription", views: {
      front: { view: "front", fileName: "front.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/front.jpg" },
      back: { view: "back", fileName: "back.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/back.jpg" },
      label: { view: "label", fileName: "label.jpg", contentType: "image/jpeg", size: 10, storageKey: "private/label.jpg" },
    }, enrolledAt: "2026-08-01T00:00:00Z", source: "brand-enrolled",
  };
  const prompt = buildBrandHangerPrompt({ message: "Build a strategy", product, metrics: { opportunity: null, gapPrevalence: null, duplicateRisk: null, segmentSize: 28, suppressed: false, minimumCohortSize: 25, actualWears: 76, activeOwners: 22, engagementRate: 79, repeatWearRate: 68, averageWearsPerOwner: 2.7, medianWearsPerOwner: 3, zeroWearOwners: 6, highFrequencyOwners: 2, lastWearAt: null, wearDistribution: [], weeklyTrend: [] },communityMetrics:{productId:"internal-product-id",publicOutfitAppearances:12,consumerOutfitAppearances:8,brandLookAppearances:4,inspirationCount:30,recreateLookRequests:5,outboundProductClicks:2,pairedCategories:[{category:"bottom",appearances:7}],pairedVerifiedProducts:[],demoPurchaseSimulations:0,lastDemoPurchaseAt:null,privacyBoundary:"PUBLIC_ACTIVITY_ONLY"} });
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
