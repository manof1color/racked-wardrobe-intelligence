import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authorInitials, authorName, formatPrice, looksWithProduct, pieceCard, postPhoto, timeAgo } from "../lib/community-piece.ts";
import { toPublicOutfitPost } from "../lib/community-post.ts";
import type { OutfitPost, PublicOutfitGarment } from "../lib/platform-types.ts";

// The redesigned Community feed (owner decision, 2026-11-05): a photo of the outfit, the pieces
// beneath it, and a price only where the catalog gives one.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const closet = (patch: Partial<PublicOutfitGarment> = {}): PublicOutfitGarment => ({ publicGarmentId: "g-closet", name: "Mid-blue jeans", category: "bottom", image: "/img/jeans", resolutionState: "GENERIC_UNVERIFIED", ...patch });
const jacket = (patch: Partial<NonNullable<PublicOutfitGarment["verifiedProduct"]>> = {}): PublicOutfitGarment => ({
  publicGarmentId: "g-jacket", name: "my jacket", category: "outerwear", image: "/img/jacket", resolutionState: "EXACT_VERIFIED_PRODUCT",
  verifiedProduct: { registryProductId: "prod-jacket", sku: "JDA-004", name: "Founder Jacket", brand: "Judge Demo Atelier", brandSlug: "judge-demo-atelier", commerceState: "EXACT_AVAILABLE", outboundUrl: "/api/products/prod-jacket/outbound", price: 295, currency: "USD", ...patch },
  ...{},
});
const post = (id: string, garments: PublicOutfitGarment[], patch: Partial<OutfitPost> = {}): OutfitPost => ({ id, handle: "@james.h", outfitTitle: `Look ${id}`, caption: "c", image: "", createdAt: "2026-11-05T10:00:00.000Z", likes: 3, sourceType: "consumer", garments, products: [], ...patch });

test("a verified catalog piece shows its price and a way to the brand; the name comes from the catalog", () => {
  const card = pieceCard(jacket());
  assert.equal(card.kind, "catalog");
  assert.equal(card.name, "Founder Jacket");
  assert.equal(card.price, "$295.00");
  assert.equal(card.brand, "Judge Demo Atelier");
  assert.equal(card.registryProductId, "prod-jacket");
  assert.equal(card.outboundUrl, "/api/products/prod-jacket/outbound");
});

test("a closet piece never shows a price or a way to buy", () => {
  const card = pieceCard(closet());
  assert.equal(card.kind, "closet");
  assert.equal(card.price, null);
  assert.equal(card.outboundUrl, null);
  assert.equal(card.registryProductId, null);
});

test("resemblance, an estimate or a similar product is never an exact product, so it shows no price", () => {
  for (const resolutionState of ["AI_ESTIMATED_PRODUCT", "SIMILAR_PRODUCT", "GENERIC_UNVERIFIED"] as const) {
    const card = pieceCard({ ...jacket(), resolutionState });
    assert.equal(card.kind, "closet", resolutionState);
    assert.equal(card.price, null, resolutionState);
    assert.equal(card.outboundUrl, null, resolutionState);
  }
});

test("an unavailable product shows no price and no way to buy, and a product with no price lists none", () => {
  const unavailable = pieceCard(jacket({ commerceState: "EXACT_UNAVAILABLE" }));
  assert.equal(unavailable.kind, "catalog");
  assert.equal(unavailable.price, null);
  assert.equal(unavailable.outboundUrl, null);
  assert.equal(pieceCard(jacket({ price: undefined })).price, null, "never inferred");
  assert.equal(pieceCard(jacket({ outboundUrl: undefined })).outboundUrl, null, "no destination, no button");
});

test("prices format as currency and refuse nonsense", () => {
  assert.equal(formatPrice(295, "USD"), "$295.00");
  assert.equal(formatPrice(0, "USD"), "$0.00");
  assert.equal(formatPrice(-1), null);
  assert.equal(formatPrice(Number.NaN), null);
  assert.equal(formatPrice("295" as unknown), null);
  assert.equal(formatPrice(10, "not-a-currency"), "$10.00");
});

test("a brand look and a member look of the same jacket lead to one product, matched only by its registry id", () => {
  const brand = post("brand", [jacket()], { sourceType: "brand" });
  const member = post("member", [jacket({ name: "x" }), closet()]);
  const lookalike = post("lookalike", [{ ...jacket(), resolutionState: "AI_ESTIMATED_PRODUCT" }]);
  const other = post("other", [jacket({ registryProductId: "prod-other" })]);
  const seen = looksWithProduct([brand, member, lookalike, other], "prod-jacket", "brand");
  assert.deepEqual(seen.map((item) => item.id), ["member"], "the other look with the same product, not itself, a lookalike or another product");
  assert.equal(pieceCard(member.garments[0]).price, pieceCard(brand.garments[0]).price, "the same price from the same catalog product");
  assert.deepEqual(looksWithProduct([brand, member], null), [], "a closet piece is seen in no other look");
});

test("a post's photo is the person wearing the outfit, when it has one", () => {
  assert.equal(postPhoto(post("a", [], { photo: "/api/community/images/a/legacy-primary" })), "/api/community/images/a/legacy-primary");
  assert.equal(postPhoto(post("b", [])), null);
  const stored = { id: "p1", outfitTitle: "t", caption: "c", handle: "@h", sourceType: "consumer" as const, createdAt: "2026-11-05T10:00:00.000Z", imageKey: "community/p1/photo.webp", publishedGarments: [] };
  assert.equal(toPublicOutfitPost(stored).photo, "/api/community/images/p1/legacy-primary", "the public path, never the storage key");
  assert.equal(JSON.stringify(toPublicOutfitPost(stored)).includes("community/p1/photo.webp"), false);
  assert.equal("photo" in toPublicOutfitPost({ ...stored, imageKey: undefined }), false);
});

test("author names, initials and ages read as people expect", () => {
  assert.equal(authorName(post("a", [], { sourceType: "brand", products: [{ sku: "s", name: "n", brand: "Judge Demo Atelier", brandSlug: "b", category: "c" }] })), "Judge Demo Atelier");
  assert.equal(authorName(post("a", [])), "@james.h");
  assert.equal(authorInitials("Judge Demo Atelier"), "JD");
  assert.equal(authorInitials("@james.h"), "JH");
  assert.equal(authorInitials(""), "R");
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  assert.equal(timeAgo("2026-11-05T11:59:40.000Z", now), "just now");
  assert.equal(timeAgo("2026-11-05T11:15:00.000Z", now), "45m ago");
  assert.equal(timeAgo("2026-11-05T10:00:00.000Z", now), "2h ago");
  assert.equal(timeAgo("2026-11-02T12:00:00.000Z", now), "3d ago");
  assert.equal(timeAgo("not a date", now), "");
});

test("the feed is one column of post cards, each with its pieces under the photo, and a piece opens its detail", () => {
  const feed = read("components/community-feed.tsx");
  assert.match(feed, /<div className="cfeed">\{visible\.map\(post=><CommunityPostCard key=\{post\.id\}/);
  assert.match(feed, /onOpenPiece=\{garment=>setOpenPiece\(\{garment,post\}\)\}/);
  assert.match(feed, /\{openPiece&&<CommunityPieceSheet garment=\{openPiece\.garment\} post=\{openPiece\.post\} posts=\{posts\}/);
  const card = read("components/community-post-card.tsx");
  assert.ok(card.indexOf("<PostPhoto post={post} />") < card.indexOf('aria-label="Pieces in this look"'), "the pieces sit directly beneath the photo");
  assert.match(card, /<section className="cpost-pieces" aria-label="Pieces in this look">/);
  assert.match(card, /card\.price \?\? \(card\.kind === "catalog" \? card\.brand : "Closet piece"\)/, "a closet piece says so instead of showing a price");
  assert.match(card, /♡ Save look/, "Save look is the existing inspiration bookmark, and adds nothing to the closet");
  assert.match(card, /Your look · Unpublish/, "only the owner's own posts offer to unpublish");
  const sheet = read("components/community-piece-sheet.tsx");
  assert.match(sheet, /role="dialog" aria-modal="true"/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /Not for sale/);
  assert.match(sheet, /\{card\.outboundUrl && <a className="button button-accent" href=\{card\.outboundUrl\}/, "the way to buy exists only with a validated destination");
  assert.match(read("app/globals.css"), /\.cpost-pieces ul\{[^}]*overflow-x:auto/, "the pieces scroll sideways on a narrow screen");
});
