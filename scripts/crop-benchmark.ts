/**
 * Deterministic crop benchmark.
 *
 * Every scene is generated from a fixed seed and knows exactly where its garment is, so
 * each approach can be scored by intersection-over-union against the true rectangle
 * rather than by eye. Run it with:
 *
 *   node --experimental-strip-types scripts/crop-benchmark.ts
 *
 * These are synthetic backdrops chosen to mimic conditions people photograph in. They
 * are a repeatable regression signal for the cropping pipeline; they are not a measured
 * accuracy claim about real photographs.
 */
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { prepareGarmentDisplayImage } from "../lib/garment-crop.ts";
import { prepareDetectedGarmentCutout } from "../lib/garment-cutout.ts";
import { isolateGarment } from "../lib/garment-isolation.ts";

const W = 1200, H = 1600;
export type Rect = { left: number; top: number; width: number; height: number };

/** Seeded PRNG so every run of this benchmark produces identical scenes. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function iou(a: Rect, b: Rect) {
  const x1 = Math.max(a.left, b.left), y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width), y2 = Math.min(a.top + a.height, b.top + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.width * a.height + b.width * b.height - inter);
}
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function noise(rng: () => number, w: number, h: number, base: [number, number, number], amount: number) {
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++)
    px[i * 3 + c] = Math.max(0, Math.min(255, base[c] + (rng() - 0.5) * amount));
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function gradient(w: number, h: number, from: number, to: number) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = Math.round(from + (to - from) * ((x / w) * 0.6 + (y / h) * 0.4));
    const i = (y * w + x) * 3;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function planks(rng: () => number, w: number, h: number) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const plank = Math.floor(y / 140) % 2 === 0 ? 12 : -10;
    const grain = Math.sin(x * 0.09 + y * 0.02) * 9 + (rng() - 0.5) * 14;
    const i = (y * w + x) * 3;
    px[i] = Math.max(0, Math.min(255, 168 + plank + grain));
    px[i + 1] = Math.max(0, Math.min(255, 138 + plank + grain));
    px[i + 2] = Math.max(0, Math.min(255, 104 + plank + grain));
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function stripes(w: number, h: number) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = Math.floor(x / 55) % 2 === 0;
    const i = (y * w + x) * 3;
    px[i] = on ? 236 : 96; px[i + 1] = on ? 233 : 92; px[i + 2] = on ? 226 : 88;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

/** A garment silhouette: rounded body plus two sleeves, in textured fabric colour. */
async function garmentLayers(rng: () => number, rect: Rect, color: [number, number, number]) {
  const bodyW = Math.round(rect.width * 0.62), sleeveW = Math.round(rect.width * 0.19);
  const body = await noise(rng, bodyW, rect.height, color, 26);
  const sleeve = await noise(rng, sleeveW, Math.round(rect.height * 0.55), color, 26);
  const rounded = Buffer.from(`<svg width="${bodyW}" height="${rect.height}"><rect width="${bodyW}" height="${rect.height}" rx="${Math.round(bodyW * 0.16)}" fill="#fff"/></svg>`);
  return [
    { input: await sharp(body).composite([{ input: rounded, blend: "dest-in" as const }]).png().toBuffer(), left: rect.left + sleeveW, top: rect.top },
    { input: await sharp(sleeve).png().toBuffer(), left: rect.left, top: rect.top + Math.round(rect.height * 0.06) },
    { input: await sharp(sleeve).png().toBuffer(), left: rect.left + sleeveW + bodyW, top: rect.top + Math.round(rect.height * 0.06) },
  ];
}

const centre: Rect = { left: 330, top: 470, width: 540, height: 700 };
const offset: Rect = { left: 120, top: 240, width: 470, height: 620 };

async function scene(rng: () => number, name: string, group: string, bg: Buffer, rect: Rect, color: [number, number, number], extra: OverlayOptions[] = []) {
  return { name, group, rect, bytes: await sharp(bg).composite([...extra, ...(await garmentLayers(rng, rect, color))]).jpeg({ quality: 86 }).toBuffer() };
}

export async function buildScenes() {
  const rng = mulberry32(0x9e3779b9);
  const plain = await noise(rng, W, H, [238, 236, 231], 14);
  const blk = (w: number, h: number, c: [number, number, number], a = 24) => noise(rng, w, h, c, a);
  return [
    // Ordinary: the backdrop varies, one garment, well framed.
    await scene(rng, "studio white seamless", "ordinary", await sharp({ create: { width: W, height: H, channels: 3, background: { r: 253, g: 253, b: 252 } } }).png().toBuffer(), centre, [42, 58, 104]),
    await scene(rng, "clean wall, sensor noise", "ordinary", await noise(rng, W, H, [243, 242, 239], 12), centre, [150, 40, 52]),
    await scene(rng, "bed sheet texture", "ordinary", await noise(rng, W, H, [226, 221, 210], 44), centre, [38, 44, 52]),
    await scene(rng, "carpet", "ordinary", await noise(rng, W, H, [152, 139, 121], 88), offset, [230, 226, 214]),
    await scene(rng, "uneven window light", "ordinary", await gradient(W, H, 242, 176), centre, [64, 78, 46]),
    await scene(rng, "wooden floor planks", "ordinary", await planks(rng, W, H), offset, [40, 44, 96]),
    await scene(rng, "dark room at night", "ordinary", await noise(rng, W, H, [56, 52, 48], 26), centre, [214, 210, 198]),
    await scene(rng, "grey shirt on grey duvet", "ordinary", await noise(rng, W, H, [176, 176, 178], 22), centre, [138, 140, 146]),
    // Hard: the conditions that actually produce a wrong crop.
    await scene(rng, "garment bleeding off the frame", "hard", plain, { left: 0, top: 0, width: 700, height: 900 }, [44, 52, 96]),
    await scene(rng, "second object in shot (pillow)", "hard", plain, centre, [44, 52, 96], [{ input: await blk(300, 340, [212, 96, 88]), left: 60, top: 1180 }]),
    await scene(rng, "strong drop shadow", "hard", plain, centre, [44, 52, 96], [{ input: await blk(600, 120, [176, 172, 166]), left: 320, top: 1150 }]),
    await scene(rng, "striped backdrop", "hard", await stripes(W, H), centre, [44, 52, 96]),
    await scene(rng, "near-identical garment and backdrop", "hard", await noise(rng, W, H, [214, 210, 202], 16), centre, [206, 202, 195]),
    await scene(rng, "crowded rail, neighbours both sides", "hard", plain, centre, [44, 52, 96], [
      { input: await blk(230, 900, [120, 60, 60]), left: 40, top: 360 },
      { input: await blk(230, 900, [60, 90, 60]), left: 930, top: 360 },
    ]),
  ];
}

async function trimRect(bytes: Buffer, sw: number, sh: number): Promise<Rect | null> {
  try {
    const t = await sharp(bytes).trim({ threshold: 32 }).toBuffer({ resolveWithObject: true });
    if (t.info.width >= sw && t.info.height >= sh) return null;
    return { left: -(t.info.trimOffsetLeft ?? 0), top: -(t.info.trimOffsetTop ?? 0), width: t.info.width, height: t.info.height };
  } catch { return null; }
}

async function floodRect(bytes: Buffer, sw: number): Promise<Rect | null> {
  const cut = await prepareDetectedGarmentCutout(bytes);
  if (!cut.backgroundRemoved) return null;
  const t = await sharp(cut.buffer).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const k = sw / cut.width;
  return { left: Math.round(-(t.info.trimOffsetLeft ?? 0) * k), top: Math.round(-(t.info.trimOffsetTop ?? 0) * k), width: Math.round(t.info.width * k), height: Math.round(t.info.height * k) };
}

if (import.meta.filename === process.argv[1]) {
  const scenes = await buildScenes();
  const rows: Array<{ group: string; trim: number; flood: number; isolate: number }> = [];
  console.log("group".padEnd(9), "scene".padEnd(38), "trim".padEnd(10), "flood".padEnd(10), "isolate");
  for (const s of scenes) {
    const meta = await sharp(s.bytes).metadata();
    const sw = meta.width ?? W, sh = meta.height ?? H;
    const full: Rect = { left: 0, top: 0, width: sw, height: sh };
    const shipped = await prepareGarmentDisplayImage(s.bytes);
    const t = shipped.cropped ? await trimRect(s.bytes, sw, sh) : null;
    const f = await floodRect(s.bytes, sw);
    const i = await isolateGarment(s.bytes);
    const row = { group: s.group, trim: iou(t ?? full, s.rect), flood: iou(f ?? full, s.rect), isolate: iou(i?.bounds ?? full, s.rect) };
    rows.push(row);
    console.log(s.group.padEnd(9), s.name.padEnd(38), (t ? pct(row.trim) : "fallback").padEnd(10), (f ? pct(row.flood) : "fallback").padEnd(10), i ? pct(row.isolate) : "fallback");
  }
  for (const group of ["ordinary", "hard", "ALL"]) {
    const use = group === "ALL" ? rows : rows.filter((r) => r.group === group);
    console.log(`\n--- ${group} (${use.length} scenes) ---`);
    for (const key of ["trim", "flood", "isolate"] as const) {
      const mean = use.reduce((sum, r) => sum + r[key], 0) / use.length;
      console.log(" ", key.padEnd(8), "mean IoU", pct(mean), ` usable (IoU>=0.7): ${use.filter((r) => r[key] >= 0.7).length}/${use.length}`);
    }
  }
}
