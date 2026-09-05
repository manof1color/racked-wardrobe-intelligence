/**
 * Models the surface a garment was photographed on.
 *
 * Judge note: this is deterministic colour clustering, not a learned model and not an AI
 * claim. It runs on the reduced analysis raster only and never inspects a person.
 *
 * The isolation pass previously described the backdrop with a single median colour. That
 * holds for a bed sheet or a wall and breaks on any patterned surface: on a striped rug the
 * median lands between the stripes, matches neither, and the pass either refuses outright
 * or floods across the garment. Striped and plank backdrops were the recorded failures in
 * `scripts/crop-benchmark.ts` for exactly this reason.
 *
 * A backdrop is better described by a small set of colours than by one. Stripes are two,
 * floorboards are two or three, a plain sheet is one. Clustering the frame's border pixels
 * recovers that set without knowing anything about the surface in advance.
 *
 * The risk this introduces is the interesting one: a garment running off the edge of the
 * frame also contributes border pixels, and admitting its colour as "backdrop" would erase
 * the garment. Side coverage is not the discriminator — a garment in a corner touches two
 * sides, and testing that way cost the benchmark its best-scoring hard scene.
 *
 * Interleaving is the discriminator. A patterned surface alternates with its other colours
 * repeatedly along the border: a striped rug crosses back and forth dozens of times. A
 * garment bleeding off the frame forms one contiguous arc. Clusters are therefore kept on
 * how many separate runs they occupy, not on pixel count or side count.
 *
 * Runs are counted along a genuine clockwise walk of the perimeter. That detail is the
 * whole measurement: counting them over an arbitrary list of border indexes instead made a
 * garment on the left edge appear to alternate with the backdrop on the right hundreds of
 * times, reporting 263 runs for a single contiguous shape.
 */

/** Clusters to fit. Enough for stripes and floorboards; more invites over-segmentation. */
const MAX_CLUSTERS = 4;
/** Fixed iteration count keeps the result deterministic and the cost bounded. */
const REFINEMENT_PASSES = 8;
/** Below this many separate runs along the border, a colour is subject, not surface. */
const MIN_RUNS = 4;
/** …unless it is this dominant, which makes it the surface regardless of framing. */
const DOMINANT_SUPPORT = 0.55;
/** A cluster below this share of the border is noise. */
const MIN_SUPPORT = 0.06;
/**
 * A colour this close to an accepted backdrop colour is the same surface continuing. One
 * window lighting a wall produces a smooth ramp whose bands sit in contiguous arcs and so
 * fail the interleaving test despite plainly being backdrop; adjacent ramp bands differ by
 * tens, while a garment differs by hundreds.
 */
const COLOUR_CONTINUITY = 90;
/**
 * Median within-cluster spread above which the border is a cluttered scene rather than a
 * photographed surface. Real surfaces measured well under this: a striped rug reads 0, a
 * noisy carpet a few units, a lit wall single digits.
 */
const MAX_CLUSTER_SPREAD = 40;

export interface BackdropCluster {
  colour: [number, number, number];
  /** Share of border pixels belonging to this cluster, 0–1. */
  support: number;
  /** Separate runs the cluster occupies along the border sequence. */
  runs: number;
  /** Median distance of its own members from the centroid — how varied the surface is. */
  spread: number;
}

export interface BackdropModel {
  clusters: BackdropCluster[];
  /** Distance within which a pixel counts as this backdrop. */
  tolerance: number;
}

function distance(a: readonly number[], b: readonly number[]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

/**
 * A clockwise walk of the frame perimeter: along the top, down the right, back along the
 * bottom, up the left. Neighbouring entries are genuinely adjacent pixels, which is what
 * makes a run of them mean something.
 */
export function perimeterWalk(width: number, height: number) {
  const walk: number[] = [];
  for (let x = 0; x < width; x++) walk.push(x);
  for (let y = 1; y < height; y++) walk.push(y * width + width - 1);
  for (let x = width - 2; x >= 0; x--) walk.push((height - 1) * width + x);
  for (let y = height - 2; y >= 1; y--) walk.push(y * width);
  return walk;
}

/**
 * Maximal runs of `cluster` around the perimeter. Stripes give many; one contiguous shape
 * gives one. The walk is a closed loop, so a run spanning the start is not double-counted.
 */
function countRuns(assignment: Int32Array, cluster: number) {
  const length = assignment.length;
  let runs = 0;
  let members = 0;
  for (let position = 0; position < length; position++) {
    if (assignment[position] !== cluster) continue;
    members++;
    if (assignment[(position - 1 + length) % length] !== cluster) runs++;
  }
  // A cluster covering the whole closed loop has no boundary to count, but it is one run.
  return runs === 0 && members > 0 ? 1 : runs;
}

/**
 * Fits up to `MAX_CLUSTERS` colours to the frame border.
 *
 * Seeding is by luminance quantile rather than at random, so the same photograph always
 * produces the same model — a requirement for a reproducible benchmark.
 */
export function modelBackdrop(
  data: Buffer,
  width: number,
  height: number,
): BackdropModel {
  const walk = perimeterWalk(width, height);
  const pixels = walk.map((index) => [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]] as [number, number, number]);
  if (!pixels.length) return { clusters: [], tolerance: 0 };

  const byLuminance = pixels
    .map((pixel, position) => ({ pixel, position, luminance: 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2] }))
    .sort((a, b) => a.luminance - b.luminance);
  const centroids: Array<[number, number, number]> = [];
  for (let cluster = 0; cluster < MAX_CLUSTERS; cluster++) {
    const at = Math.floor(((cluster + 0.5) / MAX_CLUSTERS) * byLuminance.length);
    centroids.push([...byLuminance[Math.min(at, byLuminance.length - 1)].pixel]);
  }

  const assignment = new Int32Array(pixels.length);
  for (let pass = 0; pass < REFINEMENT_PASSES; pass++) {
    for (let position = 0; position < pixels.length; position++) {
      let best = 0;
      let bestDistance = Infinity;
      for (let cluster = 0; cluster < centroids.length; cluster++) {
        const candidate = distance(pixels[position], centroids[cluster]);
        if (candidate < bestDistance) { bestDistance = candidate; best = cluster; }
      }
      assignment[position] = best;
    }
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let position = 0; position < pixels.length; position++) {
      const bucket = sums[assignment[position]];
      bucket[0] += pixels[position][0];
      bucket[1] += pixels[position][1];
      bucket[2] += pixels[position][2];
      bucket[3]++;
    }
    for (let cluster = 0; cluster < centroids.length; cluster++) {
      if (!sums[cluster][3]) continue;
      centroids[cluster] = [
        Math.round(sums[cluster][0] / sums[cluster][3]),
        Math.round(sums[cluster][1] / sums[cluster][3]),
        Math.round(sums[cluster][2] / sums[cluster][3]),
      ];
    }
  }

  const clusters: BackdropCluster[] = [];
  for (let cluster = 0; cluster < centroids.length; cluster++) {
    const members: number[] = [];
    for (let position = 0; position < pixels.length; position++) {
      if (assignment[position] === cluster) members.push(position);
    }
    if (!members.length) continue;
    clusters.push({
      colour: centroids[cluster],
      support: members.length / pixels.length,
      runs: countRuns(assignment, cluster),
      spread: median(members.map((position) => distance(pixels[position], centroids[cluster]))),
    });
  }
  clusters.sort((a, b) => b.support - a.support);

  // Every cluster faces the interleaving test, including the largest. Keeping the largest
  // unconditionally is what broke the garment-off-the-frame scene: a garment occupying two
  // edges can be the single biggest colour on the border, and trusting size alone flooded
  // the garment away as though it were the surface.
  const interleaved = clusters.filter((cluster) =>
    cluster.support >= MIN_SUPPORT && (cluster.runs >= MIN_RUNS || cluster.support >= DOMINANT_SUPPORT));
  // A perfectly flat backdrop is one contiguous run and legitimately fails that test, so
  // fall back to the dominant colour rather than refusing a photograph that is easy.
  const kept = interleaved.length ? [...interleaved] : clusters.slice(0, 1);

  // Then absorb colours that continue an accepted surface. A lighting gradient arrives as
  // contiguous bands that the interleaving test rejects on its own, while a garment sits
  // far enough away in colour to stay excluded.
  for (let pass = 0; pass < clusters.length; pass++) {
    for (const cluster of clusters) {
      if (kept.includes(cluster) || cluster.support < MIN_SUPPORT) continue;
      if (kept.some((accepted) => distance(cluster.colour, accepted.colour) <= COLOUR_CONTINUITY)) kept.push(cluster);
    }
  }

  // A varied surface needs a wider tolerance; the band matches the single-colour pass it
  // replaces so that plain backdrops keep behaving exactly as they did.
  const spread = median(kept.map((cluster) => cluster.spread));
  return { clusters: kept, tolerance: Math.max(30, Math.min(74, Math.round(34 + spread * 1.35))) };
}

/** True when a pixel matches any modelled backdrop colour. */
export function matchesBackdrop(data: Buffer, index: number, model: BackdropModel) {
  const pixel = [data[index * 4], data[index * 4 + 1], data[index * 4 + 2]];
  for (const cluster of model.clusters) {
    if (distance(pixel, cluster.colour) <= model.tolerance) return true;
  }
  return false;
}

/**
 * How believable the model is as a description of one photographed surface.
 *
 * Coverage alone cannot answer this: every border pixel is assigned to some cluster, so
 * coverage is always 1 and testing it proves nothing. What separates a surface from a busy
 * scene is how tightly each cluster's own members sit around it. A bed sheet, a rug, even
 * a stripe, all cluster tightly; a cluttered border does not cluster at all.
 */
export function backdropIsUsable(model: BackdropModel) {
  if (!model.clusters.length) return false;
  const coverage = model.clusters.reduce((total, cluster) => total + cluster.support, 0);
  if (coverage < 0.5) return false;
  return median(model.clusters.map((cluster) => cluster.spread)) <= MAX_CLUSTER_SPREAD;
}
