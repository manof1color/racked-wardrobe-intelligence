import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { batchSummary, MAX_BATCH_PIECES, MAX_SCAN_PHOTOS, planScanBatch, remainingPieceCapacity, scanProgressLabel } from "../lib/look-scan-batch.ts";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const intake = read("components/garment-intake.tsx");

test("a batch takes the photos it can and reports the ones it did not", () => {
  const photos = Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`);
  const plan = planScanBatch(photos);
  assert.equal(plan.accepted.length, MAX_SCAN_PHOTOS);
  assert.equal(plan.skipped, 9 - MAX_SCAN_PHOTOS);
  assert.deepEqual(plan.accepted[0], "photo-1", "in the order they were chosen");
  assert.deepEqual(planScanBatch(["one"]), { accepted: ["one"], skipped: 0 });
  assert.deepEqual(planScanBatch([]), { accepted: [], skipped: 0 });
});

test("the review list is bounded, because a hundred cards is not a review", () => {
  assert.equal(remainingPieceCapacity(0), MAX_BATCH_PIECES);
  assert.equal(remainingPieceCapacity(MAX_BATCH_PIECES - 3), 3);
  assert.equal(remainingPieceCapacity(MAX_BATCH_PIECES + 10), 0, "never negative");
});

test("progress names the photo being scanned, and says nothing odd for a single one", () => {
  assert.equal(scanProgressLabel({ photoNumber: 1, photoCount: 1 }), "Finding the pieces in this photo");
  assert.equal(scanProgressLabel({ photoNumber: 2, photoCount: 4 }), "Finding the pieces in photo 2 of 4");
});

test("the summary tells the truth about a batch that half-worked", () => {
  assert.equal(
    batchSummary({ photoCount: 3, pieceCount: 7, failedPhotos: [], skippedPhotos: 0, reachedPieceLimit: false }),
    "7 pieces from 3 photos.",
  );
  assert.match(
    batchSummary({ photoCount: 3, pieceCount: 4, failedPhotos: [2], skippedPhotos: 0, reachedPieceLimit: false }),
    /^4 pieces from 2 photos\. Photo 2 could not be read\.$/,
  );
  assert.match(
    batchSummary({ photoCount: 4, pieceCount: 2, failedPhotos: [1, 3], skippedPhotos: 0, reachedPieceLimit: false }),
    /Photos 1 and 3 could not be read\./,
  );
  assert.match(
    batchSummary({ photoCount: 1, pieceCount: 0, failedPhotos: [], skippedPhotos: 0, reachedPieceLimit: false }),
    /No pieces were found in that photo\./,
  );
  assert.match(
    batchSummary({ photoCount: 6, pieceCount: 24, failedPhotos: [], skippedPhotos: 3, reachedPieceLimit: true }),
    /review list stops at 24 pieces[\s\S]*3 photos were left for a second batch/,
  );
});

// A batch is only useful if one bad photo does not cost the rest: the pieces already found stay.
test("REGRESSION: one unreadable photo does not discard the pieces already found", () => {
  const scan = intake.slice(intake.indexOf("async function scan("), intake.indexOf("function piece("));
  assert.match(scan, /for \(const \[index, entry\] of batch\.entries\(\)\)/, "one photo per request");
  assert.match(scan, /failedPhotos\.push\(photoNumber\)/);
  assert.match(scan, /setPieces\(\[\.\.\.found\]\)/, "each photo's pieces appear as they arrive");
  assert.match(scan, /if \(\/too many\|try again in a few minutes\/i\.test\(message\)\) \{ setError\(message\); break; \}/, "a rate-limit refusal stops the batch rather than repeating it");
  assert.doesNotMatch(scan, /setPieces\(\[\]\);\s*$/m);
});

test("each card can be traced back to the photo it came from", () => {
  assert.match(intake, /sourcePhoto: number;/);
  assert.match(intake, /files\.length > 1 && <span className="intake-source"/);
  assert.match(intake, /piece\(detection, photoNumber\)/);
});

test("the library door opens on several photos, and the scan limit allows a few batches", () => {
  assert.match(intake, /<PhotoSourcePicker label=\{files\.length \? "Use different photos" : "Add photos"\} multiple onFiles=\{chooseFiles\}/);
  assert.match(intake, /Pick up to \$\{MAX_SCAN_PHOTOS\} photos at once/);
  assert.ok(RATE_LIMIT_RULES.lookDetect.limit >= MAX_SCAN_PHOTOS * 2, "a person gets more than one batch before being refused");
  assert.ok(RATE_LIMIT_RULES.lookDetect.limit <= 40, "and it is still a bounded, metered call");
});

// CodeQL flagged the batch thumbnails on the way in: a value read from a file input reaching an
// image source. Rather than dismiss the alert, the thumbnails went: the sink is gone, and the real
// cropped pieces appear moments later.
test("REGRESSION: no value from a file input ever reaches an image source", () => {
  assert.doesNotMatch(intake, /createObjectURL/);
  assert.doesNotMatch(intake, /intake-preview"/);
  assert.match(intake, /No local thumbnail of the chosen file/);
});
