/**
 * Synthetic fixture data for the accessibility harness. Nothing here is a real account, garment,
 * product, or customer; every record is invented, and the API answers below run inside the test
 * browser, so no request from the harness reaches a data store.
 */
import type { Page, Route } from "@playwright/test";
import { wardrobe as demoWardrobe, savedOutfits as demoOutfits } from "../../lib/demo-data.ts";
import type { BrandMetrics } from "../../lib/metrics.ts";
import type { AgentReply, BrandCommunityMetrics, BrandProductRegistration, GarmentAnalysis } from "../../lib/platform-types.ts";
import type { DetectedLookGarment } from "../../lib/look-garment-detection.ts";
import type { SavedOutfit, WardrobeItem } from "../../lib/types.ts";

/** A 1×1 PNG, served for every image the harness asks for. */
export const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export const wardrobe: WardrobeItem[] = demoWardrobe.slice(0, 6).map((item, index) => ({
  ...item,
  brand: index === 1 ? "Fixture Denim Co" : null,
  identityStatus: index === 1 ? "verified" : "unverified",
  registryProductId: index === 1 ? "fixture-product-1" : null,
  createdAt: "2026-10-01T12:00:00.000Z",
}));

export const outfits: SavedOutfit[] = demoOutfits.slice(0, 2).map(outfit => ({
  ...outfit,
  itemIds: outfit.itemIds.filter(id => wardrobe.some(item => item.id === id)),
  createdAt: "2026-10-02T12:00:00.000Z",
}));

function upload(fileName: string) {
  return { view: "front" as const, fileName, contentType: "image/png", size: PIXEL_PNG.length };
}

export const brandProducts: BrandProductRegistration[] = [
  { id:"fixture-product-1", ownerSubject:"fixture-brand", name:"Fixture straight jean", brand:"Fixture Denim Co", brandSlug:"fixture-denim-co", aliases:[], sku:"FDC-100", gtin:null, category:"bottom", subtype:"jeans", color:"indigo", style:["classic"], material:"denim", labelText:"", views:{ front:upload("jean.png") }, enrolledAt:"2026-09-01T12:00:00.000Z", source:"brand-enrolled", imageUrls:{ front:"/a11y-fixture/jean.png" }, price:98, currency:"USD", availability:"available" },
  { id:"fixture-product-2", ownerSubject:"fixture-brand", name:"Fixture utility jacket", brand:"Fixture Denim Co", brandSlug:"fixture-denim-co", aliases:[], sku:"FDC-200", gtin:null, category:"outerwear", subtype:"denim-jacket", color:"olive", style:["utility"], material:"cotton", labelText:"", views:{ front:upload("jacket.png") }, enrolledAt:"2026-09-02T12:00:00.000Z", source:"brand-enrolled", imageUrls:{ front:"/a11y-fixture/jacket.png" }, availability:"available" },
];

export const brandMetrics: BrandMetrics = {
  opportunity: 62, gapPrevalence: 18, duplicateRisk: 9, segmentSize: 31, suppressed: false, minimumCohortSize: 25,
  actualWears: 214, repeatWearRate: 74.2, activeOwners: 27, engagementRate: 87.1, averageWearsPerOwner: 6.9, medianWearsPerOwner: 6,
  zeroWearOwners: null, highFrequencyOwners: 12, lastWearAt: "2026-10-27T18:00:00.000Z",
  wearDistribution: [
    { label:"0 wears", owners:null, percentage:null },
    { label:"1 wear", owners:null, percentage:null },
    { label:"2–5 wears", owners:11, percentage:35.5 },
    { label:"6+ wears", owners:12, percentage:38.7 },
  ],
  weeklyTrend: Array.from({ length: 8 }, (_, index) => ({ label:`W${index + 1}`, wears:[18, 22, 25, 31, 24, 29, 33, 32][index], weekStart:`2026-09-${String(1 + index * 7).padStart(2, "0")}` })),
  withheld: ["zeroWearOwners"], minimumCellSize: 5,
  budget: { used: 3, limit: 40, remaining: 37, resetsInSeconds: 3600 },
};

export const communityMetrics: BrandCommunityMetrics = {
  productId:"fixture-product-1", publicOutfitAppearances:6, consumerOutfitAppearances:4, brandLookAppearances:2, inspirationCount:9,
  recreateLookRequests:3, outboundProductClicks:5, demoPurchaseSimulations:1, lastDemoPurchaseAt:"2026-10-20T12:00:00.000Z",
  pairedCategories:[{ category:"top", appearances:4 }, { category:"shoe", appearances:3 }],
  pairedVerifiedProducts:[{ productId:"fixture-product-2", name:"Fixture utility jacket", brand:"Fixture Denim Co", appearances:2 }],
  privacyBoundary:"PUBLIC_ACTIVITY_ONLY",
};

function analysis(name: string, category: GarmentAnalysis["garment"]["category"], subtype: GarmentAnalysis["garment"]["subtype"], brand: string, provider: GarmentAnalysis["provider"] = "multimodal", confidence = 88): GarmentAnalysis {
  return {
    provider, fallback: provider === "manual-review", confidence, dataSufficiency: provider === "manual-review" ? "partial" : "complete",
    garment: { name, category, subtype, wearableUnit: "single", color: "indigo", pattern: "solid", style: ["casual"], construction: [], material: "cotton", alternatives: [] },
    label: { brand, sku: "", brandSlug: null, matched: false, registryProductId: null, matchMethod: "none" },
    evidence: [], warnings: [],
    processedImage: { key: `fixture/${name}.png`, url: "/a11y-fixture/piece.png", width: 1, height: 1, confirmationToken: "fixture-token", backgroundRemoved: true },
  };
}

/** Three review cards: a plain piece, one whose brand was read on the label, and one needing a label. */
export const detections: DetectedLookGarment[] = [
  { id:"d1", bounds:{ x:0.1, y:0.1, width:0.4, height:0.4 }, exactBounds:true, analysis:analysis("White tee", "top", "t-shirt", "Brand not verified") },
  { id:"d2", bounds:{ x:0.1, y:0.5, width:0.4, height:0.4 }, exactBounds:true, analysis:analysis("Indigo jean", "bottom", "jeans", "Fixture Denim Co") },
  { id:"d3", bounds:{ x:0.5, y:0.5, width:0.4, height:0.4 }, exactBounds:false, analysis:analysis("Unlabeled piece", "unknown", "other-garment", "Brand not verified", "manual-review", 0) },
];

const consumerReply: AgentReply = {
  agent:"consumer-stylist", provider:"grounded-wardrobe", confidence:"high",
  message:"Here is an outfit from pieces you already own: the white tee with the indigo jean.",
  toolsUsed:["wardrobe"], evidence:["Both pieces are in your closet."],
  actions:[{ label:"Save outfit", type:"save-outfit", payload:{ itemIds:"w1,w2", name:"Hanger outfit" } }, { label:"Wear today", type:"record-outfit", payload:{ itemIds:"w1,w2" } }],
  selection:[{ id:"w1", name:wardrobe[0].name, category:wardrobe[0].category }, { id:"w2", name:wardrobe[1].name, category:wardrobe[1].category }],
};

const brandReply: AgentReply = {
  agent:"brand-wear-intelligence", provider:"grounded-aggregate", confidence:"medium",
  message:"Repeat wear is strong: about three in four owners wore it twice or more. Lead with styling that shows it worn often.",
  toolsUsed:["aggregate-metrics"], evidence:["Released aggregates for 31 opted-in owners."],
  actions:[{ label:"Draft a strategy brief", type:"strategy-brief", payload:{ theme:"repeat wear" } }],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** Answers every API call the harness screens make, so they render as a signed-in person sees them. */
export async function mockSignedInApi(page: Page) {
  await page.route("**/a11y-fixture/**", route => route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }));
  await page.route("**/api/**", route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    switch (pathname) {
      case "/api/consumer/wardrobe": return method === "POST" ? json(route, { item: { ...wardrobe[0], id: `saved-${Date.now()}` } }) : json(route, { items: wardrobe, outfits });
      case "/api/consumer/consent": return json(route, { brandDataSharing: true });
      case "/api/points": return json(route, { today: "2026-10-29", total: 42, streak: { streak: 3, best: 5, loggedToday: false }, week: { points: 9, daysLogged: 3, days: ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"].map((day, index) => ({ day, points: [0, 4, 0, 0, 2, 0, 3][index], logged: [false, true, false, false, true, false, true][index] })) } });
      case "/api/consumer/outfits": return json(route, { outfit: { id: "saved-outfit", name: "Hanger outfit", itemIds: ["w1", "w2"], createdAt: "2026-10-28T12:00:00.000Z", wears: 0 } });
      case "/api/wears": return json(route, { counts: { w1: 19, w2: 16 }, outfitWears: 1, points: { awarded: 2, rediscovered: 0, capped: false, repeat: false } });
      case "/api/consumer/location": return json(route, { homeCity: null, results: [] });
      case "/api/garments/detect": return json(route, { detections });
      case "/api/catalog": return json(route, { candidates: [], products: [] });
      case "/api/agents/consumer": return method === "GET" ? json(route, { turns: [], remembered: "", weatherPlace: "Fixture City" }) : json(route, { reply: consumerReply, remembered: "" });
      case "/api/agents/brand": return json(route, { reply: brandReply });
      case "/api/brand/products": return json(route, { products: brandProducts });
      case "/api/brand/looks": return json(route, { looks: [] });
      case "/api/brand/metrics": return json(route, { metrics: brandMetrics });
      case "/api/brand/community-metrics": return json(route, { metrics: communityMetrics });
      default: return json(route, { error: "Not part of the accessibility fixtures." }, 404);
    }
  });
}
