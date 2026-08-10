import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DISPLAY_MAX_HEIGHT, DISPLAY_MAX_WIDTH, prepareGarmentDisplayImage, prepareWardrobeImages } from "../lib/garment-crop.ts";

async function photoWithGarment() {
  // A white 1200x1500 "photo" with a dark 420x600 garment-like block in the middle.
  return sharp({ create: { width: 1200, height: 1500, channels: 3, background: { r: 250, g: 250, b: 248 } } })
    .composite([{ input: await sharp({ create: { width: 420, height: 600, channels: 3, background: { r: 40, g: 44, b: 60 } } }).png().toBuffer(), left: 390, top: 450 }])
    .jpeg()
    .toBuffer();
}

test("auto-crop trims the background so the display image is the garment region", async () => {
  const result = await prepareGarmentDisplayImage(await photoWithGarment());
  assert.equal(result.cropped, true);
  assert.equal(result.fallbackReason, null);
  // 420x600 garment inside a 1200x1500 frame: a real crop must land near the
  // garment's aspect ratio (0.7), far from the full frame's 0.8 after resize caps.
  const aspect = result.width / result.height;
  assert.ok(Math.abs(aspect - 420 / 600) < 0.1, `expected garment-shaped crop, got ${result.width}x${result.height}`);
  assert.ok(result.width <= DISPLAY_MAX_WIDTH && result.height <= DISPLAY_MAX_HEIGHT);
});

test("a photo the trim cannot handle falls back to the original framing", async () => {
  // A fully uniform image gives the trim nothing to find; sharp rejects it and
  // the pipeline must return the uncropped (resized) original instead of failing.
  const uniform = await sharp({ create: { width: 1000, height: 1250, channels: 3, background: { r: 245, g: 245, b: 245 } } }).jpeg().toBuffer();
  const result = await prepareGarmentDisplayImage(uniform);
  assert.equal(result.cropped, false);
  assert.equal(result.fallbackReason, "no-meaningful-crop");
  const aspect = result.width / result.height;
  assert.ok(Math.abs(aspect - 1000 / 1250) < 0.02, "fallback keeps the original aspect ratio");
});

test("a crop that would keep almost nothing is rejected in favor of the original", async () => {
  // A single tiny speck: the trim would keep <5% of the photo, which the guard treats
  // as a failed crop rather than shipping a 12-pixel garment image.
  const speck = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: await sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer(), left: 500, top: 500 }])
    .jpeg()
    .toBuffer();
  const result = await prepareGarmentDisplayImage(speck);
  assert.equal(result.cropped, false);
  assert.equal(result.fallbackReason, "crop-kept-too-little");
});

test("the original evidence photo is preserved byte-for-byte, separate from the display crop", async () => {
  const original = await photoWithGarment();
  const { evidence, display } = await prepareWardrobeImages(original);
  assert.ok(evidence.buffer.equals(original), "evidence must be the untouched original");
  assert.equal(evidence.contentType, "image/jpeg");
  assert.ok(!display.buffer.equals(original), "display version must be a separate rendition");
  // Display is PNG (0x89 P N G); evidence stays JPEG (0xFF 0xD8).
  assert.deepEqual([...display.buffer.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.deepEqual([...evidence.buffer.subarray(0, 2)], [0xff, 0xd8]);
});
