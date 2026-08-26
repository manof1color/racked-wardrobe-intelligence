import test from "node:test";
import assert from "node:assert/strict";
import { buildBrandCommunityMetrics, type PrivacySafeCommunityEvent } from "../lib/brand-community-metrics.ts";
import { communityIsEmpty, communityReadouts } from "../lib/brand-insights.ts";
import { isDemoStorefrontProduct } from "../lib/demo-storefront.ts";
import type { OutfitPost, PublicOutfitGarment } from "../lib/platform-types.ts";

const PRODUCT = "demo-product-1";

function garment(registryProductId?: string): PublicOutfitGarment {
  return {
    publicGarmentId: `g-${registryProductId ?? "none"}`, name: "Piece", category: "top", image: "/api/community/images/p/g",
    resolutionState: registryProductId ? "EXACT_VERIFIED_PRODUCT" : "GENERIC_UNVERIFIED",
    ...(registryProductId ? { verifiedProduct: { registryProductId, sku: "S1", name: "Product", brand: "Demo Brand", brandSlug: "demo-brand" } } : {}),
  };
}

function post(id: string, registryProductId?: string): OutfitPost {
  return { id, handle: "@person", outfitTitle: id, caption: "c", image: "", createdAt: "2026-08-23T00:00:00Z", likes: 0, sourceType: "consumer", garments: [garment(registryProductId)], products: [] };
}

function event(overrides: Partial<PrivacySafeCommunityEvent>): PrivacySafeCommunityEvent {
  return { eventType: "demo-purchase", createdAt: "2026-08-23T10:00:00.000Z", ...overrides };
}

test("a demo purchase naming the product is counted for that product", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [event({ productId: PRODUCT })]);
  assert.equal(metrics.demoPurchaseSimulations, 1);
  assert.equal(metrics.lastDemoPurchaseAt, "2026-08-23T10:00:00.000Z");
});

test("REGRESSION: another product's demo purchase is never counted here", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [event({ productId: "someone-elses-product" })]);
  assert.equal(metrics.demoPurchaseSimulations, 0);
  assert.equal(metrics.lastDemoPurchaseAt, null);
});

test("a purchase attributed only to a post counts when that post really contains the product", () => {
  const withProduct = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [event({ postId: "p1" })]);
  assert.equal(withProduct.demoPurchaseSimulations, 1);
  const withoutProduct = buildBrandCommunityMetrics(PRODUCT, [post("p2", "other-product")], [event({ postId: "p2" })]);
  assert.equal(withoutProduct.demoPurchaseSimulations, 0, "a look that does not contain the product must not credit it");
});

test("the most recent simulation timestamp is reported", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [
    event({ productId: PRODUCT, createdAt: "2026-08-23T09:00:00.000Z" }),
    event({ productId: PRODUCT, createdAt: "2026-08-23T11:00:00.000Z" }),
    event({ productId: PRODUCT, createdAt: "2026-08-23T10:00:00.000Z" }),
  ]);
  assert.equal(metrics.demoPurchaseSimulations, 3);
  assert.equal(metrics.lastDemoPurchaseAt, "2026-08-23T11:00:00.000Z");
});

test("other event types are not miscounted as purchases", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [
    event({ productId: PRODUCT, eventType: "outbound-product-click" }),
    event({ postId: "p1", eventType: "recreate-look-request" }),
  ]);
  assert.equal(metrics.demoPurchaseSimulations, 0);
  assert.equal(metrics.outboundProductClicks, 1);
  assert.equal(metrics.recreateLookRequests, 1);
});

test("a product with only a demo purchase is not reported as having no activity", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [event({ productId: PRODUCT })]);
  assert.equal(communityIsEmpty({ ...metrics, publicOutfitAppearances: 0, inspirationCount: 0, recreateLookRequests: 0, outboundProductClicks: 0 }), false);
  assert.equal(communityIsEmpty({ ...metrics, publicOutfitAppearances: 0, inspirationCount: 0, recreateLookRequests: 0, outboundProductClicks: 0, demoPurchaseSimulations: 0 }), true);
});

test("REGRESSION: brand-facing purchase copy never claims a sale, order, or revenue", () => {
  const metrics = buildBrandCommunityMetrics(PRODUCT, [post("p1", PRODUCT)], [event({ productId: PRODUCT })]);
  const readout = communityReadouts(metrics).find((entry) => /demo checkout/i.test(entry.question));
  assert.ok(readout, "the purchase readout must exist");
  const copy = `${readout.question} ${readout.detail}`.toLowerCase();
  for (const forbidden of ["revenue", "sold", "sales", "order was", "earned", "purchase was made"]) {
    assert.equal(copy.includes(forbidden), false, `purchase copy must not contain "${forbidden}"`);
  }
  assert.match(copy, /simulation/, "it must name itself a simulation");
  assert.match(copy, /not a sale/, "it must explicitly disclaim being a sale");
});

test("REGRESSION: only demonstration products may record a purchase simulation", () => {
  assert.equal(isDemoStorefrontProduct({ dataClassification: "DEMO" }), true);
  assert.equal(isDemoStorefrontProduct({ testCohort: true }), true);
  assert.equal(isDemoStorefrontProduct({ dataClassification: "PILOT" }), false, "a real pilot brand must never accumulate simulated purchases");
  assert.equal(isDemoStorefrontProduct({ dataClassification: "REGULAR" }), false);
  assert.equal(isDemoStorefrontProduct({}), false);
});
