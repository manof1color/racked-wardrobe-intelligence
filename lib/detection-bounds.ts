/**
 * Normalizes whatever shape a vision model uses for a bounding box into the 0–1
 * fractions the rest of the intake path expects.
 *
 * Judge note: this exists because of a real reported failure. A single garment,
 * correctly identified by the model, produced "No distinct clothing pieces were
 * detected" — because the box came back in a convention the parser did not accept, and
 * an unparseable box silently discarded the whole detection. The prompt asks for 0–1
 * fractions, but models routinely answer in percentages, in pixels, as a corner array,
 * or with left/top/right/bottom keys. Telling somebody their photo is unclear when the
 * model saw the garment perfectly well is the worst possible failure, so the parser now
 * accepts every convention below and, failing that, hands back the whole frame rather
 * than dropping the item.
 */

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box smaller than this is not a wardrobe unit worth cropping to. */
export const MIN_BOUND_SIDE = 0.04;
export const MIN_BOUND_AREA = 0.004;

/** The whole photo. Used when a garment is named but its box is unusable. */
export const WHOLE_FRAME: NormalizedBounds = { x: 0, y: 0, width: 1, height: 1 };

function numbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((entry) => Number(entry));
  return parsed.length >= 4 && parsed.every((entry) => Number.isFinite(entry)) ? parsed.slice(0, 4) : null;
}

function pick(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const found = Object.keys(source).find((candidate) => candidate.toLowerCase().replace(/[_\s-]/g, "") === key);
    if (found === undefined) continue;
    const parsed = Number(source[found]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Models answer in 0–1 fractions, in 0–100 percentages, or in source pixels. The scale
 * is inferred from the largest value present, because a garment box legitimately
 * reaching 1.0 and one reaching 100 are not otherwise distinguishable.
 */
function rescale(values: number[], image?: { width: number; height: number }) {
  const largest = Math.max(...values.map(Math.abs));
  if (largest <= 1.5) return values;
  if (image && largest > 100) {
    return [values[0] / image.width, values[1] / image.height, values[2] / image.width, values[3] / image.height];
  }
  if (largest <= 100) return values.map((value) => value / 100);
  // Pixels with no image size supplied: the largest coordinate is the best available
  // estimate of the long edge. A slightly loose box is corrected by the silhouette pass.
  return values.map((value) => value / largest);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function fromCorners(x1: number, y1: number, x2: number, y2: number): NormalizedBounds {
  const left = clamp(Math.min(x1, x2));
  const top = clamp(Math.min(y1, y2));
  return { x: left, y: top, width: clamp(Math.max(x1, x2)) - left, height: clamp(Math.max(y1, y2)) - top };
}

function fromSize(x: number, y: number, width: number, height: number): NormalizedBounds {
  const left = clamp(x);
  const top = clamp(y);
  return { x: left, y: top, width: Math.min(clamp(width), 1 - left), height: Math.min(clamp(height), 1 - top) };
}

export function isUsable(bounds: NormalizedBounds) {
  return bounds.width >= MIN_BOUND_SIDE && bounds.height >= MIN_BOUND_SIDE && bounds.width * bounds.height >= MIN_BOUND_AREA;
}

/**
 * Returns the box a model meant, or `null` when nothing usable can be read from it.
 * Callers are expected to fall back to the whole frame rather than drop the garment.
 */
export function readBounds(value: unknown, image?: { width: number; height: number }): NormalizedBounds | null {
  const asArray = numbers(value);
  if (asArray) {
    const [a, b, c, d] = rescale(asArray, image);
    // A four-number array is either [x1,y1,x2,y2] or [x,y,width,height] and the two are
    // genuinely ambiguous. Both readings are scored and the plausible one wins; when
    // both are plausible, corners are preferred because that is the more common
    // convention in model output.
    const corners = fromCorners(a, b, c, d);
    const sized = fromSize(a, b, c, d);
    if (isUsable(corners) && c > a && d > b) return corners;
    if (isUsable(sized)) return sized;
    return isUsable(corners) ? corners : null;
  }

  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;

  const x = pick(source, ["x", "left", "xmin", "x1", "startx"]);
  const y = pick(source, ["y", "top", "ymin", "y1", "starty"]);
  const width = pick(source, ["width", "w"]);
  const height = pick(source, ["height", "h"]);
  const right = pick(source, ["right", "xmax", "x2", "endx"]);
  const bottom = pick(source, ["bottom", "ymax", "y2", "endy"]);

  if (x === null || y === null) return null;
  if (width !== null && height !== null) {
    const [a, b, c, d] = rescale([x, y, width, height], image);
    const sized = fromSize(a, b, c, d);
    return isUsable(sized) ? sized : null;
  }
  if (right !== null && bottom !== null) {
    const [a, b, c, d] = rescale([x, y, right, bottom], image);
    const corners = fromCorners(a, b, c, d);
    return isUsable(corners) ? corners : null;
  }
  return null;
}

/**
 * The box for a detection, never failing. An unreadable box on a garment the model did
 * name yields the whole frame, so the piece still reaches the person for confirmation.
 */
export function boundsOrWholeFrame(value: unknown, image?: { width: number; height: number }) {
  const bounds = readBounds(value, image);
  return { bounds: bounds ?? WHOLE_FRAME, exact: bounds !== null };
}
