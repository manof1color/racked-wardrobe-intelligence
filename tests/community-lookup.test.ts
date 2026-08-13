import test from "node:test";
import assert from "node:assert/strict";
import { findByPaginatedQuery, MAX_LOOKUP_PAGES, type PageReader } from "../lib/community-lookup.ts";

interface Post { id: string }

/** Simulates a DynamoDB partition paged newest-first, 60 items per page. */
function pagedStore(total: number, pageSize = 60): { read: PageReader<Post>; pagesRead: () => number } {
  const all: Post[] = Array.from({ length: total }, (_, index) => ({ id: `post-${total - index}` })); // newest first
  let pagesRead = 0;
  const read: PageReader<Post> = async (startKey) => {
    pagesRead++;
    const offset = Number(startKey?.offset ?? 0);
    const items = all.slice(offset, offset + pageSize);
    const next = offset + pageSize;
    return { items, lastKey: next < all.length ? { offset: next } : undefined };
  };
  return { read, pagesRead: () => pagesRead };
}

test("REGRESSION: a post beyond the first page is still found", async () => {
  // The old single-query-with-Limit-60 lookup could not see this post at all.
  const store = pagedStore(200);
  const found = await findByPaginatedQuery<Post>((post) => post.id === "post-1", store.read);
  assert.equal(found?.id, "post-1");
  assert.ok(store.pagesRead() > 1, "the lookup must actually page past the first 60 items");
});

test("a post on the first page is found without extra reads", async () => {
  const store = pagedStore(200);
  const found = await findByPaginatedQuery<Post>((post) => post.id === "post-200", store.read);
  assert.equal(found?.id, "post-200");
  assert.equal(store.pagesRead(), 1, "a newest-first hit must not walk the whole partition");
});

test("a missing post returns null and stops at the end of the partition", async () => {
  const store = pagedStore(120);
  assert.equal(await findByPaginatedQuery<Post>((post) => post.id === "absent", store.read), null);
  assert.equal(store.pagesRead(), 2, "it should stop once the partition is exhausted, not keep asking");
});

test("lookup is bounded so a miss can never become an unbounded scan", async () => {
  let pages = 0;
  const endless: PageReader<Post> = async () => { pages++; return { items: [{ id: "other" }], lastKey: { offset: pages } }; };
  assert.equal(await findByPaginatedQuery<Post>((post) => post.id === "never", endless), null);
  assert.equal(pages, MAX_LOOKUP_PAGES);
});

test("an empty partition returns null immediately", async () => {
  const empty: PageReader<Post> = async () => ({ items: [] });
  assert.equal(await findByPaginatedQuery<Post>(() => true, empty), null);
});
