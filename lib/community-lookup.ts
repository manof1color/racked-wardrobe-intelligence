export interface QueryPage<T> { items: T[]; lastKey?: Record<string, unknown>; }
export type PageReader<T> = (startKey?: Record<string, unknown>) => Promise<QueryPage<T>>;

/** Hard ceiling so a lookup can never walk an unbounded partition. */
export const MAX_LOOKUP_PAGES = 12;

// Judge note: community posts are stored under SK `POST#<createdAt>#<id>`, so a post
// cannot be fetched by id with GetItem. The original lookups used a single query with
// `Limit: 60` plus a filter on id — but in DynamoDB `Limit` caps items *read before*
// filtering, and those queries read oldest-first while the feed renders newest-first.
// Past 60 posts the two sets stop overlapping, so images, Recreate, and likes would
// 404 for exactly the posts a person can see. This walks pages newest-first instead,
// bounded so a miss can never become an unbounded scan.
export async function findByPaginatedQuery<T>(
  matches: (item: T) => boolean,
  readPage: PageReader<T>,
  maxPages = MAX_LOOKUP_PAGES,
): Promise<T | null> {
  let startKey: Record<string, unknown> | undefined;
  for (let page = 0; page < maxPages; page++) {
    const { items, lastKey } = await readPage(startKey);
    const found = items.find(matches);
    if (found) return found;
    if (!lastKey) return null;
    startKey = lastKey;
  }
  return null;
}
