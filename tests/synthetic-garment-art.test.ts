import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { GARMENT_TAXONOMY } from "../lib/garment-taxonomy.ts";
import { garmentArt, productArt } from "../scripts/lib/synthetic-garment-art.mjs";

const categories = Object.keys(GARMENT_TAXONOMY);
const product = { name: "Fictional Product", sku: "ART-001", brand: "Fictional Atelier", category: "shoe", subtype: "sneakers", color: "white" };

function outline(svg: string) {
  return svg.match(/data-garment-outline="[^"]+" d="([^"]+)"/)?.[1];
}

test("each taxonomy category has a distinct garment outline", () => {
  const outlines = categories.map((category) => outline(garmentArt({ name: "Sample", category, color: "olive" })));
  assert.ok(outlines.every(Boolean));
  assert.equal(new Set(outlines).size, categories.length);
});

test("outline-changing subtypes are distinct", () => {
  for (const [category, subtypes] of [
    ["bottom", ["jeans", "shorts", "skirt"]],
    ["shoe", ["sneakers", "boots", "dress-shoes"]],
    ["accessory", ["hat", "belt", "scarf"]],
  ] as const) {
    assert.equal(new Set(subtypes.map((subtype) => outline(garmentArt({ category, subtype })))).size, subtypes.length);
  }
});

test("unknown category and unrecognised colour safely render a neutral SVG", () => {
  const svg = garmentArt({ name: "Unknown", category: "not-in-taxonomy", color: "possibly-chartreuse<script>" });
  assert.match(svg, /^<svg /);
  assert.match(svg, /data-garment-outline="unknown"/);
  assert.match(svg, /fill="#747b77"/);
  assert.doesNotMatch(svg, /<script\b/i);
});

test("every wardrobe and product view visibly says SYNTHETIC DEMO", () => {
  for (const svg of [garmentArt(product), ...["front", "back", "label"].map((view) => productArt({ ...product, view }))]) {
    assert.match(svg, /<text[^>]+>SYNTHETIC DEMO<\/text>/);
  }
});

test("art is deterministic, escapes text, and never embeds photo-like assets", () => {
  const input = { ...product, name: "A <script> & B", brand: "Fictional <Brand>" };
  for (const render of [() => garmentArt(input), () => productArt({ ...input, view: "front" }), () => productArt({ ...input, view: "back" }), () => productArt({ ...input, view: "label" })]) {
    const first = render();
    assert.equal(first, render());
    assert.match(first, /&lt;script&gt;/);
    assert.doesNotMatch(first, /<image\b|\bhref\s*=|data:/i);
    assert.doesNotMatch(first, /<script\b/i);
  }
});

// The cohort seed draws with the shared generator. The judge seed shows AI-generated demo photos
// instead (scripts/lib/judge-photos.mjs). Neither keeps an inline SVG copy.
test("the cohort seed uses the shared generator, the judge seed its photos, and neither inlines SVG", () => {
  const cohort = readFileSync(new URL("../scripts/seed-test-cohort.mjs", import.meta.url), "utf8");
  assert.match(cohort, /\.\/lib\/synthetic-garment-art\.mjs/);
  const judge = readFileSync(new URL("../scripts/seed-judge-accounts.mjs", import.meta.url), "utf8");
  assert.match(judge, /\.\/lib\/judge-photos\.mjs/);
  assert.doesNotMatch(judge, /synthetic-garment-art/);
  for (const source of [cohort, judge]) assert.doesNotMatch(source, /<svg\b/);
});

test("rasterized illustration stays below the seed's 150 KB budget", async () => {
  for (const svg of [garmentArt(product), ...["front", "back", "label"].map((view) => productArt({ ...product, view }))]) {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    assert.ok(png.length < 150_000, `PNG was ${png.length} bytes`);
    assert.deepEqual(await sharp(png).metadata().then(({ width, height }) => [width, height]), [900, 1100]);
  }
});
