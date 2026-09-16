/**
 * What deleting a garment or an account has to touch, decided without touching anything.
 *
 * The store executes these plans; keeping the decisions here makes them testable without AWS
 * and keeps two rules in one place. First, deletion never reaches outside the signed-in
 * account: every storage key must sit under that account's own prefix, and only that
 * account's records and Community posts are considered. Second, nothing is left pointing at
 * something already gone — outfits, posts, and shared photos are resolved before the record
 * that owns them is removed.
 */
import type { StoredCommunityPost, StoredPublishedGarment } from "./community-post.ts";
import type { SavedOutfit, WardrobeItem } from "./types.ts";

/** The word a person types to confirm deleting their account. */
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

export function accountDeletionConfirmed(value: unknown): boolean {
  return typeof value === "string" && value.trim() === ACCOUNT_DELETION_CONFIRMATION;
}

const ACCOUNT_ID = /^[A-Za-z0-9-]{8,128}$/;

/** A storage key this account owns, or null. Anything else is never deleted on its behalf. */
export function ownedObjectKey(key: unknown, ownerId: string): string | null {
  if (typeof key !== "string" || !ACCOUNT_ID.test(ownerId) || key.includes("..")) return null;
  return key.startsWith(`wardrobe/${ownerId}/`) || key.startsWith(`brand/${ownerId}/`) ? key : null;
}

export interface OutfitChange {
  outfitId: string;
  action: "update" | "delete";
  itemIds: string[];
}

/** Saved outfits containing a garment being deleted: each loses the piece, and an emptied one goes. */
export function outfitChangesForGarmentDeletion(garmentId: string, outfits: Array<Pick<SavedOutfit, "id" | "itemIds">>): OutfitChange[] {
  return outfits
    .filter((outfit) => outfit.itemIds.includes(garmentId))
    .map((outfit) => {
      const itemIds = outfit.itemIds.filter((id) => id !== garmentId);
      return { outfitId: outfit.id, action: itemIds.length > 0 ? "update" : "delete", itemIds };
    });
}

export type CommunityPostChange =
  | { action: "keep" }
  | { action: "update"; publishedGarments: StoredPublishedGarment[] }
  | { action: "delete" };

/**
 * A published outfit stops showing a deleted garment's photograph. Only the deleting
 * account's own posts are ever changed; a post left with no garments is removed.
 */
export function communityPostChangeForDeletedImage(post: StoredCommunityPost, ownerId: string, imageKey: string): CommunityPostChange {
  if (!imageKey || post.ownerId !== ownerId) return { action: "keep" };
  if (post.imageKey === imageKey) return { action: "delete" };
  const garments = post.publishedGarments ?? [];
  const remaining = garments.filter((garment) => garment.imageKey !== imageKey);
  if (remaining.length === garments.length) return { action: "keep" };
  return remaining.length > 0 ? { action: "update", publishedGarments: remaining } : { action: "delete" };
}

/** One scan's evidence photo is shared by every piece cut from it, so it goes with the last of them. */
export function sharedEvidenceKeyToDelete(
  deleted: Pick<WardrobeItem, "id" | "evidenceImageKey">,
  wardrobe: Array<Pick<WardrobeItem, "id" | "evidenceImageKey">>,
  ownerId: string,
): string | null {
  const key = ownedObjectKey(deleted.evidenceImageKey, ownerId);
  if (!key) return null;
  return wardrobe.some((item) => item.id !== deleted.id && item.evidenceImageKey === key) ? null : key;
}

export interface AccountRecordKey {
  PK: string;
  SK: string;
}

export interface AccountDeletionInventory {
  /** Private photographs the account's records point at. */
  objectKeys: string[];
  /** Product partitions holding wear events this account recorded. */
  productKeys: string[];
  /** Every record in the account's partition, with the profile last. */
  recordKeys: AccountRecordKey[];
}

const OBJECT_KEY_FIELDS = ["imageKey", "evidenceImageKey", "boardImageKey"] as const;

export function accountDeletionInventory(ownerId: string, records: Array<Record<string, unknown>>): AccountDeletionInventory {
  const partition = `USER#${ownerId}`;
  const objectKeys = new Set<string>();
  const productKeys = new Set<string>();
  const recordKeys: AccountRecordKey[] = [];
  let profile: AccountRecordKey | null = null;
  for (const record of records) {
    if (record.PK !== partition || typeof record.SK !== "string") continue;
    for (const field of OBJECT_KEY_FIELDS) {
      const key = ownedObjectKey(record[field], ownerId);
      if (key) objectKeys.add(key);
    }
    if (record.SK.startsWith("GARMENT#") && typeof record.GSI1PK === "string" && record.GSI1PK.startsWith("PRODUCT#")) {
      productKeys.add(record.GSI1PK);
    }
    const key = { PK: partition, SK: record.SK };
    if (record.SK === "PROFILE") profile = key;
    else recordKeys.push(key);
  }
  // Until the profile goes the account still exists, so an interrupted deletion can be retried.
  if (profile) recordKeys.push(profile);
  return { objectKeys: [...objectKeys], productKeys: [...productKeys], recordKeys };
}
