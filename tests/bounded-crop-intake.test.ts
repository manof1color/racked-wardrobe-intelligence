import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { prepareSimpleLookDisplay } from "../lib/look-scan-resilience.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// REGRESSION: background removal shredded correctly recognised pieces on real phone photos.
// White trousers held in a hand kept the hand and lost most of the trousers; before that, a
// white sneaker lost its leather to a pale wall. Live intake now shows the bounded crop only.
test("REGRESSION: live intake shows each piece as its bounded crop, never a background-removed cut-out", () => {
  const route = read("app/api/garments/detect/route.ts");
  assert.match(route, /const display=await prepareSimpleLookDisplay\(cropBytes\);/);
  for (const pass of ["prepareResilientLookDisplay", "removeGarmentBackground", "isolateGarment", "prepareDetectedGarmentCutout", "activeSegmenter"]) {
    assert.ok(!route.includes(pass), `the intake route must not call ${pass}`);
  }
});

test("a white garment on a pale surface survives the bounded crop untouched", async () => {
  const photo = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: { r: 236, g: 233, b: 228 } } })
    .composite([{ input: await sharp({ create: { width: 500, height: 1100, channels: 3, background: { r: 244, g: 242, b: 238 } } }).png().toBuffer(), left: 350, top: 250 }])
    .jpeg().toBuffer();
  const display = await prepareSimpleLookDisplay(photo);
  assert.equal(display.backgroundRemoved, false);
  assert.equal(display.method, "none");
  assert.ok(display.width <= 700 && display.height <= 900, "bounded for storage and mobile display");
  const { data, info } = await sharp(display.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let index = info.channels - 1; index < data.length; index += info.channels) if (data[index] < 255) transparent++;
  assert.equal(transparent, 0, "no pixel of the photograph may be erased");
  // The aspect ratio is kept, so the whole piece is shown rather than stretched or trimmed.
  assert.ok(Math.abs(display.width / display.height - 1200 / 1600) < 0.01);
});

test("an open sheet hides the tab bar instead of letting it show beneath its edge", () => {
  const css = read("app/globals.css");
  assert.ok(css.includes("body:has(.modal-backdrop) .mobile-tab-bar,body:has(.modal-backdrop) .hanger-launcher{visibility:hidden}"));
});
