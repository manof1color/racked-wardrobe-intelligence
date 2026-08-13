import test from "node:test";
import assert from "node:assert/strict";
import { brandProfileSummary, featuresBrand, splitBrandProfileLooks } from "../lib/brand-profile.ts";
import type { OutfitPost, PublicOutfitGarment } from "../lib/platform-types.ts";

function garment(brandSlug?: string): PublicOutfitGarment {
  return {
    publicGarmentId: `g-${brandSlug ?? "none"}-${Math.random().toString(36).slice(2, 7)}`,
    name: "Piece", category: "top", image: "/api/community/images/p/g",
    resolutionState: brandSlug ? "EXACT_VERIFIED_PRODUCT" : "GENERIC_UNVERIFIED",
    ...(brandSlug ? { verifiedProduct: { registryProductId: "r1", sku: "S1", name: "Product", brand: "Brand", brandSlug } } : {}),
  };
}

function post(id: string, sourceType: "consumer" | "brand", brandSlugs: Array<string | undefined>, likes = 0): OutfitPost {
  return { id, handle: "@person", outfitTitle: id, caption: "c", image: "", createdAt: "2026-08-13T00:00:00Z", likes, sourceType, garments: brandSlugs.map(garment), products: [] };
}

test("a post features a brand only through a verified product from that brand", () => {
  assert.equal(featuresBrand(post("a", "consumer", ["acme"]), "acme"), true);
  assert.equal(featuresBrand(post("b", "consumer", ["other"]), "acme"), false);
  assert.equal(featuresBrand(post("c", "consumer", [undefined]), "acme"), false, "an unverified garment must never attribute a brand");
});

test("brand-authored and consumer-authored looks are separated, never merged", () => {
  const posts = [
    post("brand-1", "brand", ["acme"]),
    post("consumer-1", "consumer", ["acme"]),
    post("consumer-2", "consumer", ["acme", "other"]),
    post("elsewhere", "consumer", ["other"]),
  ];
  const looks = splitBrandProfileLooks(posts, "acme");
  assert.deepEqual(looks.brandLooks.map((entry) => entry.id), ["brand-1"]);
  assert.deepEqual(looks.communityLooks.map((entry) => entry.id), ["consumer-1", "consumer-2"]);
  assert.equal(looks.brandLooks.some((entry) => entry.sourceType === "consumer"), false, "a consumer post must never appear as brand-created");
  assert.equal(looks.communityLooks.some((entry) => entry.sourceType === "brand"), false, "a brand post must never appear as community proof");
});

test("a brand's page shows nothing from an unrelated brand", () => {
  const looks = splitBrandProfileLooks([post("x", "brand", ["other"]), post("y", "consumer", ["other"])], "acme");
  assert.equal(looks.brandLooks.length, 0);
  assert.equal(looks.communityLooks.length, 0);
});

test("summary counts come only from public posts that feature the brand", () => {
  const summary = brandProfileSummary(splitBrandProfileLooks([
    post("brand-1", "brand", ["acme"], 4),
    post("consumer-1", "consumer", ["acme"], 6),
    post("elsewhere", "consumer", ["other"], 99),
  ], "acme"));
  assert.deepEqual(summary, { brandLookCount: 1, communityLookCount: 1, inspirationCount: 10 });
});
