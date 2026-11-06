import { createHmac } from "node:crypto";
import type { OutfitPost } from "./platform-types.ts";

// A member's Community profile lists the looks they chose to publish, and nothing else.
//
// It is addressed by an opaque key, not the handle and not the account id. Handles are built from
// display names and are not unique, so two people called Alex share @alex, and a page keyed on the
// handle would show one person's looks as the other's. The key is a keyed hash of the account id:
// stable for one person, different for two, and it cannot be turned back into the account id.

const AUTHOR_KEY = /^[A-Za-z0-9_-]{22}$/;

export function communityAuthorKey(ownerId: string, secret: string) {
  return createHmac("sha256", secret).update(`racked-community-author:${ownerId}`).digest("base64url").slice(0, 22);
}

export const isCommunityAuthorKey = (value: string) => AUTHOR_KEY.test(value);

/** One member's published looks. A brand's looks live on its brand page, so they never match. */
export function looksByAuthor(posts: OutfitPost[], authorKey: string) {
  return posts.filter((post) => post.sourceType === "consumer" && post.authorKey === authorKey);
}
