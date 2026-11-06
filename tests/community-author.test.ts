import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { backDestination } from "../lib/back-navigation.ts";
import { communityAuthorKey, isCommunityAuthorKey, looksByAuthor } from "../lib/community-author.ts";
import { toPublicOutfitPost } from "../lib/community-post.ts";
import type { OutfitPost } from "../lib/platform-types.ts";

const SECRET = "test-only-secret-with-at-least-32-characters";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const post = (id: string, authorKey: string | undefined, sourceType: "consumer" | "brand" = "consumer") => ({ id, handle: "@alex", outfitTitle: id, caption: "", image: "", createdAt: "2026-11-01T00:00:00.000Z", likes: 0, sourceType, garments: [], products: [], ...(authorKey ? { authorKey } : {}) }) as OutfitPost;

test("an author key is stable for one person, differs between people, and hides the account id", () => {
  const key = communityAuthorKey("account-one", SECRET);
  assert.equal(key, communityAuthorKey("account-one", SECRET));
  assert.notEqual(key, communityAuthorKey("account-two", SECRET), "two people never share a key");
  assert.notEqual(key, communityAuthorKey("account-one", `${SECRET}-other`), "the key depends on the secret");
  assert.ok(isCommunityAuthorKey(key));
  assert.ok(!key.includes("account-one"));
});

test("only a well-formed key can open a profile", () => {
  assert.equal(isCommunityAuthorKey(""), false);
  assert.equal(isCommunityAuthorKey("account-one"), false);
  assert.equal(isCommunityAuthorKey("../../../etc/passwd-aaaa"), false);
  assert.equal(isCommunityAuthorKey("a".repeat(23)), false);
});

test("two members with the same handle keep separate profiles, and a brand's looks never match", () => {
  const alex = communityAuthorKey("alex-one", SECRET);
  const otherAlex = communityAuthorKey("alex-two", SECRET);
  const posts = [post("mine-1", alex), post("theirs", otherAlex), post("mine-2", alex), post("brand-look", alex, "brand"), post("no-key", undefined)];
  assert.deepEqual(looksByAuthor(posts, alex).map((entry) => entry.id), ["mine-1", "mine-2"]);
  assert.deepEqual(looksByAuthor(posts, otherAlex).map((entry) => entry.id), ["theirs"]);
});

test("the public post rebuilt from a stored one still carries no account id", () => {
  const stored = { id: "p1", ownerId: "private-account-id", handle: "@alex", outfitTitle: "t", caption: "c", createdAt: "2026-11-01T00:00:00.000Z", sourceType: "consumer" as const, publishedGarments: [] };
  assert.ok(!JSON.stringify(toPublicOutfitPost(stored)).includes("private-account-id"));
  const store = read("lib/server/production-store.ts");
  assert.match(store, /visible\.slice\(0,60\)\.map\(publicCommunityPost\)/, "the feed's posts carry the key, built on the server");
  assert.match(store, /communityAuthorKey\(ownerId,secret\)/);
});

test("Back returns within Racked and never sends someone off the site", () => {
  const origin = "https://racked.example";
  assert.equal(backDestination({ referrer: `${origin}/community`, origin, historyLength: 4 }), "history");
  assert.equal(backDestination({ referrer: "", origin, historyLength: 4 }), "history", "moving between pages inside the app sets no referrer");
  assert.equal(backDestination({ referrer: "https://elsewhere.example/page", origin, historyLength: 4 }), "fallback");
  assert.equal(backDestination({ referrer: `${origin}/community`, origin, historyLength: 1 }), "fallback", "a fresh tab has nothing to go back to");
  assert.equal(backDestination({ referrer: "not a url", origin, historyLength: 4 }), "fallback");
});

test("the profile page has a Back button, opens only from a member's name, and lists only their looks", () => {
  const card = read("components/community-post-card.tsx");
  assert.match(card, /\/community\/people\/\$\{post\.authorKey\}/);
  const feed = read("components/community-feed.tsx");
  assert.match(feed, /<BackButton fallback="\/community"\/>/);
  const page = read("app/community/people/[author]/page.tsx");
  assert.match(page, /isCommunityAuthorKey\(author\)/);
  assert.match(page, /looksByAuthor\(await listCommunityPosts\(\), author\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(read("app/brands/[slug]/page.tsx"), /<BackButton fallback="\/community"\/>/);
});
