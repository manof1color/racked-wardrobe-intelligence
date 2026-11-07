import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { removeAllSaves, saveCountsLike, savedLookCards, setLookSaved, SavedLookNotFound, type SavedLookStorage, type StoredSave } from "../lib/saved-looks.ts";
import type { OutfitPost } from "../lib/platform-types.ts";

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function look(id: string, likes = 3): OutfitPost {
  return {
    id, handle: "@the_author", authorKey: "author-key", outfitTitle: `Look ${id}`, caption: "A private caption", image: "", photo: `/api/community/images/${id}/photo`,
    createdAt: "2026-11-01T10:00:00.000Z", likes, sourceType: "consumer", products: [],
    garments: [{ publicGarmentId: `${id}-g1`, name: "Navy coat", category: "outerwear", subtype: "coat", color: "navy", style: ["minimal"], image: `/api/community/images/${id}/${id}-g1`, resolutionState: "GENERIC_UNVERIFIED" }],
  };
}

/** DynamoDB's conditional writes, in memory. Every call yields, so concurrent requests interleave. */
function memoryStore(posts: OutfitPost[]) {
  const live = new Map(posts.map((post) => [post.id, { ...post }]));
  const saves = new Map<string, StoredSave>();
  const fail = { increment: false, decrement: false };
  const key = (ownerId: string, postId: string) => `${ownerId}|${postId}`;
  const storage: SavedLookStorage = {
    async findPost(postId) { await tick(); return live.get(postId) ?? null; },
    async getSave(ownerId, postId) { await tick(); return saves.get(key(ownerId, postId)) ?? null; },
    async createSave(ownerId, save) { await tick(); if (saves.has(key(ownerId, save.postId))) return false; saves.set(key(ownerId, save.postId), { ...save }); return true; },
    async removeSave(ownerId, postId) { await tick(); const save = saves.get(key(ownerId, postId)); if (!save) return null; saves.delete(key(ownerId, postId)); return save; },
    async restoreSave(ownerId, save) { await tick(); if (!saves.has(key(ownerId, save.postId))) saves.set(key(ownerId, save.postId), save); },
    async incrementLikes(postId) { await tick(); if (fail.increment) throw new Error("network"); const post = live.get(postId); if (!post) throw new Error("gone"); post.likes += 1; },
    async decrementLikes(postId) { await tick(); if (fail.decrement) throw new Error("network"); const post = live.get(postId); if (post && post.likes > 0) post.likes -= 1; },
    async currentLikes(postId) { return live.get(postId)?.likes ?? 0; },
  };
  const savesOf = (ownerId: string) => [...saves].filter(([entry]) => entry.startsWith(`${ownerId}|`)).map(([, save]) => save);
  const cards = (ownerId: string) => savedLookCards(savesOf(ownerId), new Map([...live].map(([id, post]) => [id, post])));
  return { storage, live, saves, fail, savesOf, cards };
}

test("saving adds one to the count and stores only a reference and style words", async () => {
  const store = memoryStore([look("p1", 3)]);
  assert.deepEqual(await setLookSaved(store.storage, "ana", "p1", true), { postId: "p1", saved: true, likes: 4 });
  const [save] = store.savesOf("ana");
  assert.equal(save.postId, "p1");
  assert.equal(save.countsLike, true);
  const stored = JSON.stringify(save);
  for (const secret of ["the_author", "author-key", "A private caption", "/api/community/images", "photo"]) assert.equal(stored.includes(secret), false, `a save never copies ${secret}`);
  assert.deepEqual(save.styleHints, ["minimal"]);
});

test("unsaving removes the look and lowers the count by one", async () => {
  const store = memoryStore([look("p1", 3)]);
  await setLookSaved(store.storage, "ana", "p1", true);
  assert.deepEqual(await setLookSaved(store.storage, "ana", "p1", false), { postId: "p1", saved: false, likes: 3 });
  assert.equal(store.savesOf("ana").length, 0);
  assert.deepEqual(store.cards("ana"), []);
});

test("repeat tapping never drifts the count, and one person adds at most one", async () => {
  const store = memoryStore([look("p1", 3)]);
  for (let tap = 0; tap < 9; tap++) await setLookSaved(store.storage, "ana", "p1", tap % 2 === 0);
  assert.equal(store.live.get("p1")!.likes, 4, "nine taps end saved, one above where it started");
  await setLookSaved(store.storage, "ana", "p1", true);
  await setLookSaved(store.storage, "ana", "p1", true);
  assert.equal(store.live.get("p1")!.likes, 4, "saving again changes nothing");
  await setLookSaved(store.storage, "ana", "p1", false);
  await setLookSaved(store.storage, "ana", "p1", false);
  assert.equal(store.live.get("p1")!.likes, 3, "unsaving again changes nothing");
});

test("double requests sent at the same moment count once", async () => {
  const store = memoryStore([look("p1", 3)]);
  const saves = await Promise.all([setLookSaved(store.storage, "ana", "p1", true), setLookSaved(store.storage, "ana", "p1", true), setLookSaved(store.storage, "ana", "p1", true)]);
  assert.ok(saves.every((result) => result.saved));
  assert.equal(store.live.get("p1")!.likes, 4);
  await Promise.all([setLookSaved(store.storage, "ana", "p1", false), setLookSaved(store.storage, "ana", "p1", false)]);
  assert.equal(store.live.get("p1")!.likes, 3);
  assert.equal(store.savesOf("ana").length, 0);
});

test("a failed count update takes the save back, and a failed unsave puts it back", async () => {
  const store = memoryStore([look("p1", 3)]);
  store.fail.increment = true;
  await assert.rejects(setLookSaved(store.storage, "ana", "p1", true));
  assert.equal(store.savesOf("ana").length, 0, "no save without its count");
  assert.equal(store.live.get("p1")!.likes, 3);
  store.fail.increment = false;
  await setLookSaved(store.storage, "ana", "p1", true);
  store.fail.decrement = true;
  await assert.rejects(setLookSaved(store.storage, "ana", "p1", false));
  assert.equal(store.savesOf("ana").length, 1, "the save is back");
  assert.equal(store.live.get("p1")!.likes, 4, "and the count still matches it");
});

test("saving a look that is not in Community is refused", async () => {
  const store = memoryStore([]);
  await assert.rejects(setLookSaved(store.storage, "ana", "missing", true), SavedLookNotFound);
});

test("one person's saves never touch another's", async () => {
  const store = memoryStore([look("p1", 0)]);
  await setLookSaved(store.storage, "ana", "p1", true);
  assert.deepEqual(await setLookSaved(store.storage, "ben", "p1", false), { postId: "p1", saved: false, likes: 1 }, "Ben unsaving a look he never saved changes nothing");
  assert.equal(store.savesOf("ana").length, 1);
  assert.deepEqual(store.cards("ben"), []);
  await setLookSaved(store.storage, "ben", "p1", true);
  assert.equal(store.live.get("p1")!.likes, 2, "two people, two");
});

function assertOnlyStyleWords(cards: ReturnType<typeof savedLookCards>) {
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, "gone");
  const shown = JSON.stringify(cards[0]);
  for (const gone of ["the_author", "author-key", "Look p1", "A private caption", "/api/community/images"]) assert.equal(shown.includes(gone), false, `${gone} is no longer shown`);
  assert.deepEqual(cards[0].kind === "gone" && cards[0].styleWords, ["minimal", "navy", "outerwear"]);
}

test("unpublish: the saved card loses the photo, title and author at once", async () => {
  const store = memoryStore([look("p1")]);
  await setLookSaved(store.storage, "ana", "p1", true);
  assert.equal(store.cards("ana")[0].kind, "live");
  store.live.delete("p1"); // unpublishCommunityPost deletes the post record
  assertOnlyStyleWords(store.cards("ana"));
  assert.deepEqual(await setLookSaved(store.storage, "ana", "p1", false), { postId: "p1", saved: false, likes: 0 }, "the card can still be removed");
  assert.deepEqual(store.cards("ana"), []);
  assert.match(read("lib/server/production-store.ts"), /export async function unpublishCommunityPost[^]*?DeleteCommand\(\{TableName:requireTable\(\),Key:\{PK:String\(post\.PK\),SK:String\(post\.SK\)\}/);
});

test("post deletion: a post removed with its last photo leaves only style words", async () => {
  const store = memoryStore([look("p1")]);
  await setLookSaved(store.storage, "ana", "p1", true);
  store.live.delete("p1"); // deleteWardrobeItem deletes a post left with no photographs
  assertOnlyStyleWords(store.cards("ana"));
  assert.match(read("lib/server/production-store.ts"), /if\(change\.action==="delete"\)\{await db\.send\(new DeleteCommand\(\{TableName:requireTable\(\),Key:key\}\)\);postsRemoved\+\+;\}/);
});

test("author deletion: the author's posts go first, so savers keep only style words", async () => {
  const store = memoryStore([look("p1")]);
  await setLookSaved(store.storage, "ana", "p1", true);
  store.live.delete("p1");
  assertOnlyStyleWords(store.cards("ana"));
  const store_ = read("lib/server/production-store.ts");
  assert.match(store_, /\/\/ 1\. Public posts\.\n  const posts=await ownCommunityPosts\(ownerId\);\n  await inBatches\(posts,10,post=>db\.send\(new DeleteCommand/);
  assert.match(store_, /export async function listSavedCommunityLooks[^]*?const visible=await visibleCommunityPosts\(posts\);/, "only posts still visible in Community are shown, so a revoked brand's look also falls back");
});

test("a saved look with no style words left is dropped rather than shown empty", () => {
  assert.deepEqual(savedLookCards([{ postId: "gone", styleHints: [], colors: [], categories: [], createdAt: "2026-11-01" }], new Map()), []);
});

test("saver deletion removes every save and takes each one off its count, once, even if retried", async () => {
  const store = memoryStore([look("p1", 0), look("p2", 0)]);
  await setLookSaved(store.storage, "ana", "p1", true);
  await setLookSaved(store.storage, "ana", "p2", true);
  await setLookSaved(store.storage, "ben", "p1", true);
  assert.equal(await removeAllSaves(store.storage, "ana", ["p1", "p2"]), 2);
  assert.equal(store.live.get("p1")!.likes, 1, "Ben's save still counts");
  assert.equal(store.live.get("p2")!.likes, 0);
  await removeAllSaves(store.storage, "ana", ["p1", "p2"]);
  assert.equal(store.live.get("p1")!.likes, 1, "a retried deletion takes nothing off twice");
  const deletion = read("lib/server/production-store.ts").match(/export async function deleteOwnConsumerAccount[^]*?\n\}/)![0];
  assert.ok(deletion.indexOf("removeAllSaves(savedLookStorage(),ownerId,") < deletion.indexOf("// 5. Records, profile last"), "saves and their counts go before the account's records");
});

test("seeded judge saves and demo copies never added to a count, so removing them never takes one off", async () => {
  assert.equal(saveCountsLike({ postId: "p", countsLike: true }), true);
  assert.equal(saveCountsLike({ postId: "p" }), true, "a save made by the heart before this change was counted");
  assert.equal(saveCountsLike({ postId: "p", testCohort: true }), false);
  assert.equal(saveCountsLike({ postId: "p", demoSession: true }), false);
  const store = memoryStore([look("p1", 4)]);
  store.saves.set("judge|p1", { postId: "p1", styleHints: ["everyday"], testCohort: true });
  await setLookSaved(store.storage, "judge", "p1", false);
  assert.equal(store.live.get("p1")!.likes, 4);
});

test("existing inspiration saves show in the new group without any data change", () => {
  const legacy: StoredSave = { postId: "p1", outfitTitle: "Look p1", styleHints: ["minimal"], colors: ["navy"], categories: ["outerwear"], subtypes: ["coat"], createdAt: "2026-10-01T00:00:00.000Z" };
  const cards = savedLookCards([legacy], new Map([["p1", look("p1")]]));
  assert.equal(cards[0].kind, "live");
  assert.equal(cards[0].kind === "live" && cards[0].post.outfitTitle, "Look p1");
});

test("the heart route: signed out asks to sign in, other roles are refused, the saver is the session", () => {
  const route = read("app/api/community/route.ts");
  assert.match(route, /if\(!session\)return NextResponse\.json\(\{error:"Sign in to save looks\."\},\{status:401\}\);/);
  assert.match(route, /if\(session\.role!=="consumer"\)return NextResponse\.json\(\{error:"Consumer account required to save looks\."\},\{status:403\}\);/);
  assert.match(route, /setCommunityLookSaved\(session\.subject,postId,/);
  assert.doesNotMatch(route, /incrementCommunityLike|ownerId|body\?\.subject/, "no anonymous count, and no owner taken from the request");
  assert.doesNotMatch(read("lib/server/production-store.ts"), /export async function incrementCommunityLike/, "the anonymous counter is gone");
  const list = read("app/api/consumer/saved-looks/route.ts");
  assert.match(list, /status: 401/);
  assert.match(list, /session\.role !== "consumer"[^\n]*status: 403/);
  assert.match(list, /listSavedCommunityLooks\(session\.subject\)/);
  assert.doesNotMatch(list, /request/, "the list takes nothing from the request");
});

test("signed-out visitors get a sign-in link instead of a heart that counts, and brands see a count only", () => {
  const card = read("components/community-post-card.tsx");
  assert.match(card, /saveMode === "sign-in"\n\s*\? <Link className="like-button" href="\/login"/);
  assert.match(card, /<span className="sr-only">Sign in to save this look<\/span>/);
  assert.match(card, /<span className="like-button like-static">/);
  const feed = read("components/community-feed.tsx");
  assert.match(feed, /saveMode=\{canPost\?"toggle":signedIn\?"count":"sign-in"\}/);
  assert.match(read("app/community/page.tsx"), /canPost=\{session\?\.role==="consumer"\} signedIn /);
  assert.match(read("app/community/page.tsx"), /canPost=\{false\} initialInspiredPostIds=\{\[\]\}/, "the signed-out page leaves signedIn off");
});

test("saved looks never reach wear logging, points, the wardrobe, the outfit count or brand data", () => {
  const ui = read("components/saved-looks.tsx");
  assert.doesNotMatch(ui, /\/api\/wears|onWear|Wear This Again|wearCount|points/i, "a saved look has no wear button");
  const store = read("lib/server/production-store.ts");
  assert.match(store, /export async function listWardrobe[^\n]*\n[^\n]*":sk":"GARMENT#"/, "Hanger's wardrobe is GARMENT# records only");
  assert.match(store, /export async function listOutfits[^\n]*\n[^\n]*":sk":"OUTFIT#"/, "saved outfits are OUTFIT# records only");
  assert.match(store, /if\(unique\.some\(id=>!garments\.has\(id\)\)\)throw new RequestRefused\("That piece is not in your wardrobe\.",404\);/, "wears and points accept only the person's own garments");
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /viewHeading\(activeView,\{pieces:items\.length,outfits:outfits\.length,/, "the saved outfit count is the person's own outfits");
  assert.doesNotMatch(dashboard, /savedLooks[^\n]*\/api\/wears|wearOutfitAgain\(openSavedLook/);
  for (const brandFile of ["lib/brand-community-metrics.ts", "lib/brand-insights.ts", "lib/brand-profile.ts", "lib/metrics.ts"]) {
    assert.doesNotMatch(read(brandFile), /saved-looks|INSPIRATION#|listSavedCommunityLooks/, `${brandFile} never reads saves`);
  }
  assert.doesNotMatch(read("lib/saved-looks.ts"), /COMMUNITY|ownerId:\s*ownerId|saverId/, "nothing about the saver is written to the public post");
});

test("rename is an obvious, labelled control on an opened saved outfit, reusing the existing rename", () => {
  const views = read("components/outfit-views.tsx");
  assert.match(views, /aria-label=\{`Rename \$\{outfit\.name\}`\} onClick=\{\(\) => setEditing\(true\)\}><span aria-hidden="true">✎<\/span>Rename<\/button>/);
  assert.match(views, /const saved = await props\.onRename\(next\);/);
  assert.doesNotMatch(read("components/saved-looks.tsx"), /onRename|Rename/, "Community looks are not renamed");
});
