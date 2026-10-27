import { RequestRefused } from "./api-errors.ts";

/**
 * Where a scan's photos wait until the person keeps a piece.
 *
 * A scan stores the whole photo (the label evidence) and one crop per piece it finds before the
 * person has chosen anything. Those go under `temp/`, which the bucket's lifecycle rule
 * (`DeleteTemporaryUploads` in infra/template.yaml) empties a day after each object is written. S3
 * runs expiry once a day, so a photo nobody keeps is gone within two days, with nothing in Racked
 * having to run. Keeping a piece copies its crop and the scan's photo to the same path without the
 * `temp/` prefix, which no rule touches; every piece kept from one scan shares that one copy of the
 * photo, as it always has.
 */
export const PENDING_SCAN_PREFIX = "temp/";

const ACCOUNT_ID = /^[A-Za-z0-9-]{8,128}$/;
const SCAN_FILE = /^(?:evidence\/)?[A-Za-z0-9-]{1,64}\.(?:png|jpg|webp)$/;

export const SCAN_EXPIRED_MESSAGE = "This scan has expired and its photos were deleted. Scan the photo again to add this piece.";

/** A scan photo's kept key, and the pending key it is copied from (null when it is already kept). */
export type KeptScanImage = { key: string; pendingKey: string | null };

/** Where one of this account's scan photos lives once kept, or null when the key is not this account's. */
export function keptScanImage(key: unknown, ownerId: string): KeptScanImage | null {
  if (typeof key !== "string" || !ACCOUNT_ID.test(ownerId) || key.includes("..")) return null;
  const kept = `wardrobe/${ownerId}/`;
  // A scan made before photos waited under temp/ was stored where kept photos live.
  if (key.startsWith(kept)) return { key, pendingKey: null };
  const pending = `${PENDING_SCAN_PREFIX}${kept}`;
  if (key.startsWith(pending) && SCAN_FILE.test(key.slice(pending.length))) return { key: key.slice(PENDING_SCAN_PREFIX.length), pendingKey: key };
  return null;
}

/**
 * Copies a scan's pending photos to where kept pieces live, each once. A photo that has already
 * expired, because the review was left open for days, is a refusal the person can act on.
 */
export async function keepScanImages(copy: (from: string, to: string) => Promise<unknown>, images: Array<KeptScanImage | null>) {
  const pending = new Map<string, string>();
  for (const image of images) if (image?.pendingKey) pending.set(image.key, image.pendingKey);
  try {
    await Promise.all([...pending].map(([key, pendingKey]) => copy(pendingKey, key)));
  } catch (error) {
    if (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound")) throw new RequestRefused(SCAN_EXPIRED_MESSAGE, 409);
    throw error;
  }
}
