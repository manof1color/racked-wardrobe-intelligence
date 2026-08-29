import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { isolateGarment } from "../lib/garment-isolation.ts";
import { prepareGarmentDisplayImage } from "../lib/garment-crop.ts";

const W = 700, H = 910;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function textured(width: number, height: number, base: [number, number, number], amount: number, seed = 7) {
  const rng = seeded(seed);
  const px = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++)
    px[i * 3 + c] = Math.max(0, Math.min(255, base[c] + (rng() - 0.5) * amount));
  return sharp(px, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** A photo with one garment block at a known rectangle, plus optional extra objects. */
async function photo(rect: { left: number; top: number; width: number; height: number }, extra: OverlayOptions[] = [], backdrop: [number, number, number] = [232, 229, 223], amount = 34) {
  return sharp(await textured(W, H, backdrop, amount))
    .composite([...extra, { input: await textured(rect.width, rect.height, [44, 52, 96], 22, 11), left: rect.left, top: rect.top }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

const garment = { left: 210, top: 266, width: 280, height: 364 };

function overlaps(bounds: { left: number; top: number; width: number; height: number }, truth: typeof garment) {
  const x1 = Math.max(bounds.left, truth.left), y1 = Math.max(bounds.top, truth.top);
  const x2 = Math.min(bounds.left + bounds.width, truth.left + truth.width);
  const y2 = Math.min(bounds.top + bounds.height, truth.top + truth.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (bounds.width * bounds.height + truth.width * truth.height - inter);
}

test("the garment is found on a textured backdrop that a border trim cannot handle", async () => {
  const result = await isolateGarment(await photo(garment));
  assert.ok(result, "a textured bed-sheet style backdrop must still produce a crop");
  assert.ok(overlaps(result.bounds, garment) > 0.8, `expected a tight crop, got ${JSON.stringify(result.bounds)}`);
  assert.equal(result.backgroundRemoved, true);
  assert.equal(result.method, "silhouette");
});

// REGRESSION: this is the reported defect. The crop must follow the garment, not the
// bounding box of every object left standing after the backdrop is removed.
test("REGRESSION: a second object in the photo does not widen the crop", async () => {
  const pillow = { input: await textured(182, 210, [206, 96, 88], 24, 3), left: 28, top: 686 };
  const result = await isolateGarment(await photo(garment, [pillow]));
  assert.ok(result, "a photo with a second object must still crop");
  assert.ok(overlaps(result.bounds, garment) > 0.8, `the crop followed the neighbouring object: ${JSON.stringify(result.bounds)}`);
  assert.equal(result.discardedNeighbours, true, "the rejected region should be reported");
  assert.ok(result.bounds.top + result.bounds.height < pillow.top, "the crop must end above the second object");
});

test("REGRESSION: neighbours on a crowded rail are excluded from the crop", async () => {
  const result = await isolateGarment(await photo(garment, [
    { input: await textured(119, 490, [120, 60, 60], 24, 5), left: 21, top: 203 },
    { input: await textured(119, 490, [60, 90, 60], 24, 9), left: 560, top: 203 },
  ]));
  assert.ok(result);
  assert.ok(result.bounds.left > 140, "the crop must not reach the left-hand neighbour");
  assert.ok(result.bounds.left + result.bounds.width < 560, "the crop must not reach the right-hand neighbour");
});

test("two subjects of comparable size fall back rather than cropping to a coin flip", async () => {
  // A second block the same size as the garment: there is no single obvious piece.
  const twin = { input: await textured(garment.width, garment.height, [96, 44, 52], 22, 13), left: 28, top: 266 };
  const result = await isolateGarment(await photo({ ...garment, left: 392 }, [twin]));
  assert.equal(result, null, "an ambiguous photo must fall back instead of guessing");
});

// KNOWN LIMITATION, recorded so it is not quietly forgotten. A strongly patterned
// backdrop fuses with the garment and the crop comes out loose. The previous trim pass
// scored 21% overlap on the same scene, so this is a limitation carried forward rather
// than a regression. Tighten this test if the algorithm learns to refuse the case.
test("KNOWN LIMITATION: a strongly patterned backdrop still yields a loose crop", async () => {
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = Math.floor(x / 55) % 2 === 0;
    const i = (y * W + x) * 3;
    px[i] = on ? 236 : 96; px[i + 1] = on ? 233 : 92; px[i + 2] = on ? 226 : 88;
  }
  const striped = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const busy = await sharp(striped)
    .composite([{ input: await textured(garment.width, garment.height, [44, 52, 96], 22, 19), left: garment.left, top: garment.top }])
    .jpeg({ quality: 88 }).toBuffer();
  const result = await isolateGarment(busy);
  assert.ok(result, "the pipeline still returns a usable image rather than failing");
  assert.ok(overlaps(result.bounds, garment) < 0.7, "still documented as loose — tighten this if the pattern case is solved");
});

test("the isolated display image is a transparent PNG", async () => {
  const result = await isolateGarment(await photo(garment));
  assert.ok(result);
  assert.deepEqual([...result.buffer.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG magic bytes");
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.hasAlpha, true, "the backdrop must be transparent, not painted over");
  assert.ok(result.width <= 700 && result.height <= 900, "display size caps still apply");
});

test("the display pipeline now crops photos the old trim pass gave up on", async () => {
  // A one-window lighting falloff: no uniform border anywhere, which is what trim needs.
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.round(242 - 66 * ((x / W) * 0.6 + (y / H) * 0.4));
    const i = (y * W + x) * 3;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  const lit = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const bytes = await sharp(lit)
    .composite([{ input: await textured(garment.width, garment.height, [44, 52, 96], 22, 11), left: garment.left, top: garment.top }])
    .jpeg({ quality: 88 }).toBuffer();
  const display = await prepareGarmentDisplayImage(bytes);
  assert.equal(display.cropped, true);
  assert.equal(display.method, "silhouette");
  assert.equal(display.fallbackReason, null);
  // The point is quality, not existence: trim does return a crop on this photo, it is
  // just the wrong one. If trim ever matches the garment here, this test proves nothing.
  const trimmed = await sharp(bytes).trim({ threshold: 32 }).toBuffer({ resolveWithObject: true });
  const trimBounds = {
    left: -(trimmed.info.trimOffsetLeft ?? 0), top: -(trimmed.info.trimOffsetTop ?? 0),
    width: trimmed.info.width, height: trimmed.info.height,
  };
  assert.ok(overlaps(trimBounds, garment) < 0.7, `the border trim should still miss this garment, got ${JSON.stringify(trimBounds)}`);
});

test("an unusable photo still degrades to the original framing", async () => {
  const uniform = await sharp({ create: { width: 800, height: 1000, channels: 3, background: { r: 245, g: 245, b: 245 } } }).jpeg().toBuffer();
  const display = await prepareGarmentDisplayImage(uniform);
  assert.equal(display.cropped, false);
  assert.equal(display.method, "original");
  assert.equal(display.backgroundRemoved, false);
});
