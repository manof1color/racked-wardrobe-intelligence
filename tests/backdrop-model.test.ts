import test from "node:test";
import assert from "node:assert/strict";
import { backdropIsUsable, matchesBackdrop, modelBackdrop, perimeterWalk } from "../lib/backdrop-model.ts";
import { activeSegmenter, deterministicSegmenter, registeredSegmenters, registerSegmenter } from "../lib/garment-segmenter.ts";

const W = 120, H = 90;

/** An RGBA raster built from a per-pixel colour function, matching the analysis format. */
function raster(colour: (x: number, y: number) => [number, number, number]) {
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = colour(x, y);
    const at = (y * W + x) * 4;
    data[at] = r; data[at + 1] = g; data[at + 2] = b; data[at + 3] = 255;
  }
  return data;
}

const PLAIN: [number, number, number] = [238, 236, 231];
const GARMENT: [number, number, number] = [44, 52, 96];

test("the perimeter walk visits every border pixel once, in adjacency order", () => {
  const walk = perimeterWalk(W, H);
  assert.equal(walk.length, 2 * W + 2 * H - 4, "a rectangle's border, corners not double-counted");
  assert.equal(new Set(walk).size, walk.length, "no pixel visited twice");
  // Consecutive entries must be genuine neighbours, which is what makes a run meaningful.
  for (let i = 1; i < walk.length; i++) {
    const dx = Math.abs((walk[i] % W) - (walk[i - 1] % W));
    const dy = Math.abs(Math.floor(walk[i] / W) - Math.floor(walk[i - 1] / W));
    assert.ok(dx + dy === 1, `entries ${i - 1}→${i} are not adjacent`);
  }
});

test("a plain surface is modelled as one colour", () => {
  const model = modelBackdrop(raster(() => PLAIN), W, H);
  assert.ok(backdropIsUsable(model));
  assert.equal(model.clusters.length, 1);
  assert.equal(model.clusters[0].runs, 1, "a colour covering the whole loop is one run, not zero");
});

// REGRESSION: a single median colour cannot describe stripes — it lands between them and
// matches neither, which made patterned backdrops a recorded benchmark failure.
test("REGRESSION: a striped surface is modelled as both of its colours", () => {
  const model = modelBackdrop(raster((x) => (Math.floor(x / 6) % 2 === 0 ? [236, 233, 226] : [96, 93, 88])), W, H);
  assert.ok(backdropIsUsable(model));
  assert.equal(model.clusters.length, 2, "both stripe colours must be recognised as surface");
  for (const cluster of model.clusters) {
    assert.ok(cluster.runs > 4, `a stripe should alternate around the perimeter, got ${cluster.runs} runs`);
  }
});

// REGRESSION: the discriminator that broke first. A garment filling a corner touches two
// sides and can be the single largest colour on the border; both side-coverage and
// raw-size tests admitted it as backdrop and flooded the garment away.
test("REGRESSION: a garment filling a corner is not mistaken for the surface", () => {
  const data = raster((x, y) => (x < W * 0.55 && y < H * 0.55 ? GARMENT : PLAIN));
  const model = modelBackdrop(data, W, H);
  assert.ok(backdropIsUsable(model));
  for (const cluster of model.clusters) {
    const nearGarment = Math.hypot(cluster.colour[0] - GARMENT[0], cluster.colour[1] - GARMENT[1], cluster.colour[2] - GARMENT[2]);
    assert.ok(nearGarment > 60, `the garment colour was accepted as backdrop: rgb(${cluster.colour.join(",")})`);
  }
  // And the pixels themselves must not match, which is what the flood actually asks.
  assert.equal(matchesBackdrop(data, 2 * W + 2, model), false, "a garment pixel must not match the backdrop");
  assert.equal(matchesBackdrop(data, (H - 2) * W + W - 2, model), true, "a backdrop pixel must match");
});

// REGRESSION: a lighting gradient arrives as contiguous bands, which the interleaving test
// rejects on its own. Colour continuity has to absorb them or a lit wall stops cropping.
test("REGRESSION: a lighting gradient is absorbed as one continuing surface", () => {
  const model = modelBackdrop(raster((x, y) => {
    const v = Math.round(242 - 66 * ((x / W) * 0.6 + (y / H) * 0.4));
    return [v, v, v];
  }), W, H);
  assert.ok(backdropIsUsable(model), "a smoothly lit wall must remain usable");
  assert.ok(model.clusters.length >= 2, "a ramp spans several bands");
  const darkest = Math.min(...model.clusters.map((cluster) => cluster.colour[0]));
  const brightest = Math.max(...model.clusters.map((cluster) => cluster.colour[0]));
  assert.ok(brightest - darkest > 30, "the accepted bands must span the ramp, not just one end");
});

test("an unmodellable border is declined rather than guessed at", () => {
  // Every border pixel a different hue: no surface to describe.
  const model = modelBackdrop(raster((x, y) => [(x * 37) % 256, (y * 91) % 256, (x * y * 13) % 256]), W, H);
  assert.equal(backdropIsUsable(model), false);
});

test("the deterministic segmenter is always available and always last", () => {
  assert.equal(deterministicSegmenter.isAvailable(), true);
  assert.equal(deterministicSegmenter.name, "silhouette");
  assert.equal(registeredSegmenters().at(-1)?.name, "silhouette");
  assert.equal(activeSegmenter({}).name, "silhouette");
});

test("a registered backend takes precedence only while it can actually run", () => {
  let ready = false;
  registerSegmenter({ name: "test-backend", isAvailable: () => ready, segment: async () => null });
  assert.equal(activeSegmenter({}).name, "silhouette", "an unavailable backend must not take over");
  ready = true;
  assert.equal(activeSegmenter({}).name, "test-backend");
  assert.equal(activeSegmenter({ RACKED_SEGMENTER: "silhouette" }).name, "silhouette", "an explicit choice wins");
  ready = false;
  assert.equal(activeSegmenter({ RACKED_SEGMENTER: "test-backend" }).name, "silhouette",
    "a configured but unavailable backend falls back rather than throwing at request time");
});
