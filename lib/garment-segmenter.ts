import { isolateGarment, type GarmentIsolation } from "./garment-isolation.ts";

/**
 * The seam between "how a garment is cut out of a photo" and everything that consumes the
 * result, so a learned segmenter can replace the deterministic one without touching the
 * intake route, the display pipeline, or the benchmark.
 *
 * Racked's cropping is currently deterministic: a clustered backdrop model, a flood, and
 * largest-connected-component selection. `scripts/crop-benchmark.ts` scores it at 86% mean
 * IoU, 12 of 14 scenes usable. The two it still fails — a strongly patterned backdrop, and
 * a garment whose colour nearly matches the surface under it — fail for the same reason:
 * colour similarity is the only signal available. A learned segmenter such as MobileSAM
 * decides on shape as well, which is exactly the gap.
 *
 * ## Why MobileSAM is not wired in yet
 *
 * It should be, and this module is the place. It is not, for one honest reason: the
 * published weights are a PyTorch checkpoint, and converting them to ONNX needs a Python
 * and PyTorch toolchain that this repository does not have and should not acquire during a
 * competition build. Shipping `onnxruntime-node` plus a ~40 MB model into the deployed
 * bundle without first measuring a win would also be the wrong trade. See RC9 in
 * `docs/work-order-recognition.md` for the task, and `docs/segmentation-backends.md` for
 * the export recipe.
 *
 * ## What a replacement must satisfy
 *
 * 1. Return `null` rather than a poor result. Every caller keeps its fallbacks, and a
 *    confident wrong crop is worse than an honest decline.
 * 2. Never generate garment pixels. It may decide which pixels are backdrop; it may not
 *    invent, restyle, or repaint the garment.
 * 3. Infer nothing about people. Class-agnostic segmentation satisfies this by
 *    construction — it has no classes at all — which is a large part of why MobileSAM
 *    suits Racked where a clothing *detector* trained on photographs of people does not.
 * 4. Run in-process. Whole-look intake is deliberately one remote call: a per-piece
 *    network round trip is the fan-out removed in #100, and a segmenter that reintroduces
 *    it must not run on the synchronous path however good its masks are.
 */

export interface GarmentSegmenter {
  /** Stable identifier, reported in benchmark output and image metadata. */
  readonly name: string;
  /**
   * True when this backend can actually run right now — weights present, runtime loaded.
   * A backend that cannot run must say so rather than throwing at request time.
   */
  isAvailable(): boolean;
  /** Cut the garment out, or decline. `box` is a detection hint in 0–1 frame fractions. */
  segment(input: Buffer, box?: { x: number; y: number; width: number; height: number }): Promise<GarmentIsolation | null>;
}

/** The shipped default: deterministic, no weights, no network, always available. */
export const deterministicSegmenter: GarmentSegmenter = {
  name: "silhouette",
  isAvailable: () => true,
  // The box hint is unused here: the deterministic pass already receives a crop made from
  // that box by the intake route, so re-applying it would tighten twice.
  segment: (input) => isolateGarment(input),
};

const registry: GarmentSegmenter[] = [deterministicSegmenter];

/**
 * Registers a backend ahead of the deterministic pass. Intended for a MobileSAM ONNX
 * backend once weights are exported; keeping registration explicit means an unavailable
 * or half-configured backend can never silently become the default.
 */
export function registerSegmenter(segmenter: GarmentSegmenter) {
  if (registry.some((existing) => existing.name === segmenter.name)) return;
  registry.unshift(segmenter);
}

/** Every registered backend, preferred first. Exposed so the benchmark can score them all. */
export function registeredSegmenters(): readonly GarmentSegmenter[] {
  return registry;
}

/**
 * The backend to use. `RACKED_SEGMENTER` selects one by name; otherwise the first
 * available registered backend wins. The deterministic pass is always last and always
 * available, so this never returns nothing.
 */
export function activeSegmenter(environment: { RACKED_SEGMENTER?: string } = process.env as { RACKED_SEGMENTER?: string }): GarmentSegmenter {
  const requested = environment.RACKED_SEGMENTER?.trim();
  if (requested) {
    const named = registry.find((segmenter) => segmenter.name === requested);
    // A named backend that is configured but unavailable is a configuration error worth
    // surfacing in logs, not a silent downgrade that hides why crops got worse.
    if (named?.isAvailable()) return named;
    if (named) console.warn("Requested garment segmenter is unavailable; using the deterministic pass", { requested });
  }
  return registry.find((segmenter) => segmenter.isAvailable()) ?? deterministicSegmenter;
}
