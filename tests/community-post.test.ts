import test from "node:test";
import assert from "node:assert/strict";
import { toPublicOutfitPost } from "../lib/community-post.ts";

const stored = {
  id: "post-1",
  ownerId: "private-account-uuid",
  imageKey: "wardrobe/private-account-uuid/photo.png",
  PK: "COMMUNITY",
  SK: "POST#2026-08-09#post-1",
  GSI1PK: "SHOULD-NEVER-SHIP",
  handle: "@casual_stylist",
  outfitTitle: "Weekend rotation",
  caption: "Synthetic test post",
  image: "https://signed.example/photo.png?token=abc",
  createdAt: "2026-08-09T12:00:00.000Z",
  likes: 4,
  products: [{ sku: "RTA-TEE-001", name: "Test Rotation Tee", brand: "Racked Test Atelier", brandSlug: "racked-test-atelier", category: "top", internalNote: "private" }],
};

test("public community posts contain only the allowlisted fields", () => {
  const post = toPublicOutfitPost(stored);
  assert.deepEqual(Object.keys(post).sort(), ["caption", "createdAt", "handle", "id", "image", "likes", "outfitTitle", "products"]);
  assert.equal(post.id, "post-1");
  assert.equal(post.likes, 4);
  assert.equal(post.image, "https://signed.example/photo.png?token=abc");
});

test("private identity and storage fields never survive sanitization", () => {
  const serialized = JSON.stringify(toPublicOutfitPost(stored));
  assert.doesNotMatch(serialized, /private-account-uuid|imageKey|ownerId|GSI1PK|SHOULD-NEVER-SHIP|internalNote/);
  assert.doesNotMatch(serialized, /"PK"|"SK"/);
});

test("product links are rebuilt with explicit public fields only", () => {
  const post = toPublicOutfitPost(stored);
  assert.deepEqual(post.products, [{ sku: "RTA-TEE-001", name: "Test Rotation Tee", brand: "Racked Test Atelier", brandSlug: "racked-test-atelier", category: "top" }]);
});

test("fictional flag survives only when explicitly true and defaults are safe", () => {
  const minimal = toPublicOutfitPost({ id: "p2" });
  assert.equal(minimal.likes, 0);
  assert.deepEqual(minimal.products, []);
  assert.equal("fictional" in minimal, false);
  assert.equal(toPublicOutfitPost({ id: "p3", fictional: true }).fictional, true);
});
