import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { boundsOrWholeFrame, isUsable, readBounds, WHOLE_FRAME } from "../lib/detection-bounds.ts";
import { parseLookGarmentDetections, buildLookDetectionPrompt } from "../lib/look-garment-detection.ts";

function walk(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(entry.name) ? [fileURLToPath(path)] : [];
  });
}

const image = { width: 2000, height: 1500 };

/** One garment, correctly identified, with its box written each way a model might write it. */
function detection(bounds: unknown) {
  return {
    garments: [{
      name: "Khaki Shorts", category: "bottom", subtype: "shorts", wearableUnit: "single",
      pairId: "", color: "khaki", pattern: "solid", material: "cotton twill",
      style: ["casual"], confidence: 88, visibleBrandText: "",
      visibleEvidence: ["belt loops", "button fly"], bounds,
    }],
  };
}

// REGRESSION: the reported failure. A pair of shorts photographed alone came back as
// "No distinct clothing pieces were detected". The model had seen the garment; the
// parser accepted only one coordinate convention and silently dropped everything else.
test("REGRESSION: every coordinate convention a model may use is read, not discarded", () => {
  const conventions: Array<[string, unknown]> = [
    ["0-1 fractions", { x: 0.12, y: 0.02, width: 0.62, height: 0.95 }],
    ["0-100 percentages", { x: 12, y: 2, width: 62, height: 95 }],
    ["source pixels", { x: 240, y: 30, width: 1240, height: 1425 }],
    ["corner array [x1,y1,x2,y2]", [0.12, 0.02, 0.74, 0.97]],
    ["left/top/right/bottom", { left: 0.12, top: 0.02, right: 0.74, bottom: 0.97 }],
    ["x_min/y_min/x_max/y_max", { x_min: 0.12, y_min: 0.02, x_max: 0.74, y_max: 0.97 }],
  ];
  for (const [label, bounds] of conventions) {
    const parsed = parseLookGarmentDetections(detection(bounds), image);
    assert.equal(parsed.length, 1, `${label} produced no detection`);
    assert.equal(parsed[0].exactBounds, true, `${label} fell back to the whole frame`);
    const box = parsed[0].bounds;
    // Every convention describes the same rectangle, so every one must resolve to it.
    assert.ok(Math.abs(box.x - 0.12) < 0.02 && Math.abs(box.y - 0.02) < 0.02, `${label} → x=${box.x} y=${box.y}`);
    assert.ok(Math.abs(box.width - 0.62) < 0.02 && Math.abs(box.height - 0.95) < 0.02, `${label} → w=${box.width} h=${box.height}`);
  }
});

test("REGRESSION: a garment with no usable box survives as the whole frame", () => {
  for (const bounds of [undefined, null, {}, "nonsense", { x: "a", y: "b" }, [1, 2]]) {
    const parsed = parseLookGarmentDetections(detection(bounds), image);
    assert.equal(parsed.length, 1, `bounds ${JSON.stringify(bounds)} discarded the garment`);
    assert.deepEqual(parsed[0].bounds, WHOLE_FRAME);
    assert.equal(parsed[0].exactBounds, false, "the stand-in box must be marked inexact");
    assert.equal(parsed[0].analysis.garment.subtype, "shorts", "the classification must survive intact");
  }
});

test("REGRESSION: a generic category word keeps the piece for the person to correct", () => {
  for (const category of ["clothing", "apparel", "garment", "wearable"]) {
    const parsed = parseLookGarmentDetections({ garments: [{ name: "Khaki Shorts", category, subtype: "shorts", confidence: 80, bounds: { x: 0.1, y: 0.1, width: 0.6, height: 0.8 } }] }, image);
    assert.equal(parsed.length, 1, `category "${category}" discarded the garment`);
    assert.equal(parsed[0].analysis.garment.category, "unknown");
    assert.equal(parsed[0].analysis.garment.name, "Khaki Shorts", "the model's name is kept so the piece is identifiable");
  }
});

test("a box too small to be a wardrobe unit is still rejected", () => {
  assert.equal(readBounds({ x: 0.5, y: 0.5, width: 0.01, height: 0.01 }), null);
  assert.equal(isUsable({ x: 0, y: 0, width: 0.02, height: 0.9 }), false);
  assert.equal(isUsable({ x: 0, y: 0, width: 0.5, height: 0.5 }), true);
});

test("a box is never allowed to run outside the frame", () => {
  const box = readBounds({ x: 0.8, y: 0.9, width: 0.9, height: 0.9 });
  assert.ok(box);
  assert.ok(box.x + box.width <= 1.0001, `right edge ${box.x + box.width}`);
  assert.ok(box.y + box.height <= 1.0001, `bottom edge ${box.y + box.height}`);
});

test("boundsOrWholeFrame reports whether the box was real", () => {
  assert.deepEqual(boundsOrWholeFrame({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }).exact, true);
  assert.deepEqual(boundsOrWholeFrame(undefined), { bounds: WHOLE_FRAME, exact: false });
});

test("the prompt tells the model the coordinate convention and that one garment is normal", () => {
  const prompt = buildLookDetectionPrompt();
  assert.match(prompt, /fraction of the full image between 0 and 1/, "the convention must be stated, not assumed");
  assert.match(prompt, /SINGLE GARMENT/);
  assert.match(prompt, /Never return an empty array because there is only one item/);
  assert.match(prompt, /imprecise box is far more useful than a missing garment/);
});

test("detection failure offers an editable piece instead of blaming the photo", () => {
  const route = readFileSync(new URL("../app/api/garments/detect/route.ts", import.meta.url), "utf8");
  assert.match(route, /detectLookOrManualReview/);
  assert.doesNotMatch(route, /status:422/, "a photo with a real garment in it must not dead-end");
  const resilience = readFileSync(new URL("../lib/look-scan-resilience.ts", import.meta.url), "utf8");
  assert.match(resilience, /provider:"manual-review"/);
  assert.match(resilience, /confidence:0/, "a stand-in must never claim confidence");
  assert.match(resilience, /category:"unknown"/, "no attribute may be invented for an unclassified piece");
  const uploader = readFileSync(new URL("../components/look-scan-uploader.tsx", import.meta.url), "utf8");
  assert.match(uploader, /NEEDS YOUR LABEL/);
  assert.match(uploader, /AI could not classify this photo/);
});

test("the real image size is passed through so pixel boxes resolve exactly", () => {
  const route = readFileSync(new URL("../app/api/garments/detect/route.ts", import.meta.url), "utf8");
  assert.match(route, /image:\{width:prepared\.info\.width,height:prepared\.info\.height\}/);
  // Without the true size, a pixel box can only be estimated from its own largest value.
  const withSize = readBounds({ x: 240, y: 30, width: 1240, height: 1425 }, image);
  assert.ok(withSize && Math.abs(withSize.width - 0.62) < 0.01, `expected 0.62, got ${withSize?.width}`);
});

// A model override that is read but not allowlisted is silently ignored in production,
// which looks exactly like the setting having no effect. AI_HANGER_MODEL had been in
// that state; this fails if any AI_* variable is ever added without registering it.
test("every AI model override the code reads is copied into the runtime environment", () => {
  const sources = ["lib", "app"].flatMap((dir) => walk(new URL(`../${dir}/`, import.meta.url)));
  const read = new Set(sources.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/process\.env\.(AI_[A-Z_]+)/g)].map((match) => match[1])));
  const script = readFileSync(new URL("../scripts/write-amplify-env.mjs", import.meta.url), "utf8");
  const allowlisted = new Set([...script.matchAll(/"(AI_[A-Z_]+)"/g)].map((match) => match[1]));
  const missing = [...read].filter((name) => !allowlisted.has(name)).sort();
  assert.deepEqual(missing, [], `read in code but never reaches production: ${missing.join(", ")}`);
});
