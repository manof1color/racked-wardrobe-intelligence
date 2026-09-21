/**
 * Scanning several photos in one go.
 *
 * A wardrobe arrives a few photos at a time — a rail, a shelf, a pile on the bed — and asking for
 * one photo per trip through the flow made people stop after the first. A batch is scanned one
 * photo at a time (each is its own recognition request), and the pieces are merged into one review
 * list, with each piece remembering the photo it came from.
 *
 * Two bounds keep a batch honest. A person may pick more photos than a phone should send in one
 * sitting, so the batch is capped and the rest are reported rather than silently dropped. And the
 * review list is capped too: a hundred cards is not a review, it is a wall.
 */
export const MAX_SCAN_PHOTOS = 6;
export const MAX_BATCH_PIECES = 24;

export interface ScanBatchPlan<T> {
  /** The photos this batch will scan, in the order they were chosen. */
  accepted: T[];
  /** How many were left out because the batch was already full. */
  skipped: number;
}

export function planScanBatch<T>(files: readonly T[], limit = MAX_SCAN_PHOTOS): ScanBatchPlan<T> {
  const accepted = files.slice(0, Math.max(0, limit));
  return { accepted, skipped: Math.max(0, files.length - accepted.length) };
}

/** How many more pieces the review list can take before it stops being reviewable. */
export function remainingPieceCapacity(current: number, limit = MAX_BATCH_PIECES) {
  return Math.max(0, limit - current);
}

export interface ScanProgress {
  photoNumber: number;
  photoCount: number;
}

export function scanProgressLabel({ photoNumber, photoCount }: ScanProgress) {
  return photoCount === 1 ? "Finding the pieces in this photo" : `Finding the pieces in photo ${photoNumber} of ${photoCount}`;
}

export interface BatchOutcome {
  photoCount: number;
  pieceCount: number;
  /** 1-based numbers of photos that could not be read, in order. */
  failedPhotos: number[];
  skippedPhotos: number;
  reachedPieceLimit: boolean;
}

/**
 * One sentence about what a batch actually produced, including what it could not. A batch that
 * half-worked must say so: the pieces that did arrive are still worth keeping.
 */
export function batchSummary({ photoCount, pieceCount, failedPhotos, skippedPhotos, reachedPieceLimit }: BatchOutcome) {
  const parts: string[] = [];
  const scanned = photoCount - failedPhotos.length;
  parts.push(pieceCount === 0
    ? `No pieces were found in ${scanned === 1 ? "that photo" : `those ${scanned} photos`}.`
    : `${pieceCount} piece${pieceCount === 1 ? "" : "s"} from ${scanned} photo${scanned === 1 ? "" : "s"}.`);
  if (failedPhotos.length === 1) parts.push(`Photo ${failedPhotos[0]} could not be read.`);
  if (failedPhotos.length > 1) parts.push(`Photos ${failedPhotos.slice(0, -1).join(", ")} and ${failedPhotos.at(-1)} could not be read.`);
  if (reachedPieceLimit) parts.push(`The review list stops at ${MAX_BATCH_PIECES} pieces; scan the rest afterwards.`);
  if (skippedPhotos > 0) parts.push(`${skippedPhotos} photo${skippedPhotos === 1 ? "" : "s"} were left for a second batch — ${MAX_SCAN_PHOTOS} at a time.`);
  return parts.join(" ");
}
