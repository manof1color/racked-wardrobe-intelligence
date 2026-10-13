/**
 * Publishing to Community is opt-in per post; unpublishing is the way back. A privacy-first feed
 * that cannot be taken back is not privacy-first, so these tests hold the boundary: only the owner,
 * identified by the session, can take a look down; someone else's look answers like a missing one;
 * only the post record goes; and only the owner ever sees the control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/community/[postId]/route.ts");
const store = read("lib/server/production-store.ts");
const page = read("app/community/page.tsx");
const feed = read("components/community-feed.tsx");
const unpublish = store.slice(store.indexOf("export async function unpublishCommunityPost"), store.indexOf("async function deleteOwnWearEvents"));

test("only a signed-in consumer can unpublish, and only as themselves", () => {
  assert.match(route, /export async function DELETE/);
  assert.match(route, /session\.role!=="consumer"/);
  assert.match(route, /consumeRateLimit\(`community-unpublish:\$\{session\.subject\}`,RATE_LIMIT_RULES\.communityUnpublish\)/);
  assert.match(route, /unpublishCommunityPost\(session\.subject,postId\)/, "ownership comes from the session");
  assert.doesNotMatch(route, /request\.json|ownerId|body\?\./, "never from the request");
});

test("someone else's look answers exactly like a missing one", () => {
  const notFound = route.match(/\{error:"Look not found\."\},\{status:404\}/g) ?? [];
  assert.equal(notFound.length, 2, "an invalid id and a look that is not yours get the same 404");
  assert.match(unpublish, /\(await ownCommunityPosts\(ownerId\)\)\.find\(\(entry\)=>entry\.id===postId\)/);
  assert.match(unpublish, /if\(!post\)return false;/);
  assert.match(unpublish, /ConditionExpression:"ownerId = :owner"/, "and the delete itself re-checks the owner");
});

test("only the post record goes — the outfit, wardrobe, photos, and wear history stay", () => {
  assert.match(unpublish, /DeleteCommand\(\{TableName:requireTable\(\),Key:\{PK:String\(post\.PK\),SK:String\(post\.SK\)\}/);
  assert.doesNotMatch(unpublish, /DeleteObjectCommand|GARMENT#|OUTFIT#|WEAR#|deleteOwnedObjects/);
});

test("only the owner sees the control, after a second confirming tap", () => {
  assert.match(page, /consumer\?listOwnCommunityPostIds\(consumer\):Promise\.resolve\(\[\]\)/, "own post ids are loaded for consumers only");
  assert.match(page, /canPost=\{false\} initialInspiredPostIds=\{\[\]\} initialOwnPostIds=\{\[\]\}/, "and never for a signed-out visitor");
  assert.match(feed, /\{ownPostIds\.has\(post\.id\)&&<div className="look-owner-actions">/);
  assert.match(feed, /confirmUnpublishId===post\.id/);
  assert.match(feed, /Confirm unpublish/);
  assert.match(feed, /method:"DELETE"/);
  assert.match(feed, /setPosts\(current=>current\.filter\(item=>item\.id!==post\.id\)\)/, "the look leaves the feed at once");
  assert.match(feed, /setOwnPostIds\(current=>new Set\(\[\.\.\.current,data\.post\.id\]\)\)/, "a look just published can be taken down straight away");
});

test("the README says a published look can be taken down", () => {
  const readme = read("README.md");
  assert.match(readme, /Unpublish/);
  assert.match(readme, /`DELETE \/api\/community\/\[postId\]`/);
  assert.doesNotMatch(readme, /cannot yet be withdrawn|Withdraw a published look/);
});
