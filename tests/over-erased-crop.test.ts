import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DETECTION_CROP_SUBJECT_FLOOR, isolateGarment } from "../lib/garment-isolation.ts";
import { hasPlausibleVisibleSubject, MIN_SUBJECT_DOMINANCE, prepareResilientLookDisplay } from "../lib/look-scan-resilience.ts";

/**
 * Reproduces the reported failure without committing the photograph that caused it.
 *
 * A white sneaker was held in a hand in a dim red-lit room. Recognition was correct —
 * "sneakers / shoe / sneakers" — but the cutout arrived as a shredded brown fragment. The
 * garment's white leather sat close in colour to the wall behind it, so the backdrop flood
 * ate the leather and the largest surviving region was a piece of dark midsole.
 *
 * The synthetic stand-in has the same shape: a pale garment on a pale surround, with one
 * darker accent that survives when the pale body is erased.
 */
async function paleGarmentOnPaleSurround() {
  const W = 420, H = 300;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inGarment = x > W * 0.1 && x < W * 0.9 && y > H * 0.15 && y < H * 0.85;
    // A small dark accent inside the garment, like a midsole.
    const inAccent = inGarment && y > H * 0.66 && x > W * 0.2 && x < W * 0.55;
    const [r, g, b] = inAccent ? [92, 44, 38] : inGarment ? [238, 234, 228] : [232, 229, 224];
    const at = (y * W + x) * 3;
    px[at] = r; px[at + 1] = g; px[at + 2] = b;
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

/** Share of pixels that are solidly opaque, the measure both guards turn on. */
async function solidShare(buffer: Buffer) {
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let solid = 0;
  for (let i = raw.info.channels - 1; i < raw.data.length; i += raw.info.channels) if (raw.data[i] >= 192) solid++;
  return solid / (raw.info.width * raw.info.height);
}

test("the measured threshold sits between working passes and the failure", () => {
  // Working passes measured 99.4–100% dominance; the reported photo gave 73.8%.
  assert.ok(MIN_SUBJECT_DOMINANCE > 0.8, "must reject the 73.8% debris the report was about");
  assert.ok(MIN_SUBJECT_DOMINANCE <= 0.995, "must not reject the 99.4% a noisy carpet legitimately produces");
});

// REGRESSION: the reported defect. Scattered debris is not a garment, however solid.
test("REGRESSION: solid debris scattered across many fragments is rejected", async () => {
  // One main piece plus a scatter of islands, as the sneaker produced: 206 fragments.
  const pieces = [{ input: await sharp({ create: { width: 70, height: 70, channels: 4, background: { r: 92, g: 44, b: 38, alpha: 1 } } }).png().toBuffer(), left: 20, top: 20 }];
  for (let n = 0; n < 24; n++) {
    pieces.push({ input: await sharp({ create: { width: 9, height: 9, channels: 4, background: { r: 92, g: 44, b: 38, alpha: 1 } } }).png().toBuffer(),
      left: 110 + (n % 6) * 14, top: 20 + Math.floor(n / 6) * 14 });
  }
  const debris = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(pieces).png().toBuffer();
  const share = await solidShare(debris);
  assert.ok(share > 0.06, `the faint-pixel floors must not be what rejects this, got ${(share * 100).toFixed(0)}%`);
  const accepted = await hasPlausibleVisibleSubject({ buffer: debris, width: 200, height: 200, backgroundRemoved: true, removedPixelRatio: 0.8, method: "edge-fallback" });
  assert.equal(accepted, false, "solid pixels scattered across fragments are not one garment");
});

// The lesson from getting this wrong first: a share threshold rejected a legitimately thin
// garment. Dominance must accept it.
test("a thin garment with a wide transparent margin is still accepted", async () => {
  const thin = await sharp({ create: { width: 500, height: 500, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 260, height: 330, channels: 4, background: { r: 40, g: 45, b: 50, alpha: 1 } } }).png().toBuffer(), left: 120, top: 85 }])
    .png().toBuffer();
  const share = await solidShare(thin);
  assert.ok(share < 0.5, `this fixture must stay a minority of the frame, got ${(share * 100).toFixed(0)}%`);
  const accepted = await hasPlausibleVisibleSubject({
    buffer: thin, width: 500, height: 500, backgroundRemoved: true, removedPixelRatio: 0.65, method: "silhouette",
    bounds: { left: 0, top: 0, width: 500, height: 500 }, subjectPixelRatio: 0.34, discardedNeighbours: false,
  });
  assert.equal(accepted, true, "one connected garment is acceptable however much margin surrounds it");
});

test("a faint, almost erased subject is still rejected", async () => {
  // sharp's background alpha is 0–1, not 0–255: 0.15 is roughly alpha 38, which counts as
  // visible but never as solid.
  const faint = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 0.15 } } }).png().toBuffer();
  const accepted = await hasPlausibleVisibleSubject({ buffer: faint, width: 200, height: 200, backgroundRemoved: true, removedPixelRatio: 0.6, method: "edge-fallback" });
  assert.equal(accepted, false);
});

test("an opaque crop is always acceptable — it claims no background removal", async () => {
  const opaque = await sharp({ create: { width: 120, height: 120, channels: 3, background: { r: 200, g: 190, b: 180 } } }).png().toBuffer();
  const accepted = await hasPlausibleVisibleSubject({ buffer: opaque, width: 120, height: 120, backgroundRemoved: false, removedPixelRatio: 0, method: "none" });
  assert.equal(accepted, true);
});

// REGRESSION: a detection crop is drawn around one garment, so the garment is most of the
// frame. Accepting a 10% survivor is what produced the reported blob.
test("REGRESSION: a detection crop requires the garment to fill most of the frame", async () => {
  const crop = await paleGarmentOnPaleSurround();
  const permissive = await isolateGarment(crop);
  const strict = await isolateGarment(crop, { minSubjectRatio: DETECTION_CROP_SUBJECT_FLOOR });
  if (permissive && permissive.subjectPixelRatio < DETECTION_CROP_SUBJECT_FLOOR) {
    assert.equal(strict, null, `the whole-photo floor accepted a ${(permissive.subjectPixelRatio * 100).toFixed(0)}% survivor that the crop floor must refuse`);
  }
  assert.ok(DETECTION_CROP_SUBJECT_FLOOR > 0.2, "a crop's garment should occupy far more than a fifth of it");
});

test("an over-erased pass falls through to the honest bounded photo", async () => {
  // Every removal method reports debris; the pipeline must reach the opaque crop.
  const scatter = [{ input: await sharp({ create: { width: 60, height: 60, channels: 4, background: { r: 90, g: 40, b: 40, alpha: 1 } } }).png().toBuffer(), left: 20, top: 20 }];
  for (let n = 0; n < 20; n++) {
    scatter.push({ input: await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 90, g: 40, b: 40, alpha: 1 } } }).png().toBuffer(),
      left: 110 + (n % 5) * 16, top: 30 + Math.floor(n / 5) * 16 });
  }
  const fragment = await sharp({ create: { width: 240, height: 240, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(scatter).png().toBuffer();
  const overErased = async () => ({ buffer: fragment, width: 240, height: 240, backgroundRemoved: true as const, removedPixelRatio: 0.83, method: "edge-fallback" as const });
  const input = await sharp({ create: { width: 240, height: 240, channels: 3, background: { r: 210, g: 205, b: 198 } } }).png().toBuffer();
  const result = await prepareResilientLookDisplay(input, {
    skipAi: true,
    isolate: async () => null,
    edgeFallback: overErased as never,
  });
  assert.equal(result.method, "none", "the person must get the real photo rather than a fragment");
  assert.equal(result.backgroundRemoved, false);
  assert.equal(await solidShare(result.buffer), 1, "the fallback is fully opaque");
});
