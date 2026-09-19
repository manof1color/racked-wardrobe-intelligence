import type { DetectedLookGarment } from "./look-garment-detection.ts";

/** What recognition proposes for a brand's product photo. Every field is editable before enrolling. */
export interface ProductDescriptionSuggestion {
  name: string;
  category: string;
  subtype?: string;
  color?: string;
  pattern?: string;
  material?: string;
  style: string[];
  /** How many pieces the photo held; more than one means the largest was described. */
  piecesInPhoto: number;
}

const usable = (value?: string) => (value && value !== "unknown" && value !== "unconfirmed" ? value : undefined);

/**
 * The product in a product photo is the piece that fills it. A styled shot can hold a whole outfit,
 * so the largest recognised piece is described and the brand is told there were others. A manual-
 * review stand-in, or a piece with no category, is not a description at all.
 */
export function describeProductFromDetections(detections: DetectedLookGarment[]): ProductDescriptionSuggestion | null {
  const recognised = detections.filter((detection) =>
    detection.analysis.provider !== "manual-review"
    && detection.analysis.confidence > 0
    && detection.analysis.garment.category !== "unknown");
  if (!recognised.length) return null;
  const area = (detection: DetectedLookGarment) => Math.max(0, detection.bounds.width) * Math.max(0, detection.bounds.height);
  const [largest] = [...recognised].sort((a, b) => area(b) - area(a) || b.analysis.confidence - a.analysis.confidence);
  const garment = largest.analysis.garment;
  return {
    name: garment.name,
    category: garment.category,
    ...(garment.subtype && !garment.subtype.startsWith("other-") ? { subtype: garment.subtype } : {}),
    ...(usable(garment.color) ? { color: garment.color } : {}),
    ...(usable(garment.pattern) ? { pattern: garment.pattern } : {}),
    ...(usable(garment.material) ? { material: garment.material } : {}),
    style: (garment.style ?? []).slice(0, 6),
    piecesInPhoto: recognised.length,
  };
}
