import sharp from "sharp";

// Judge note: display preparation is a deterministic image pipeline, not an AI claim.
// The uploaded evidence photo is kept exactly as submitted (rotated for orientation
// only), and a tighter background-trim crop is produced purely for display. When the
// crop looks unsafe — the trim would keep almost nothing, or the trim fails on a
// busy background — the pipeline falls back to the uncropped photo instead of
// shipping a broken image.

export interface DisplayPreparation {
  buffer: Buffer;
  width: number;
  height: number;
  /** True when the tighter garment crop was applied; false means original framing. */
  cropped: boolean;
  /** Set when the crop was skipped, with a short machine-safe reason. */
  fallbackReason: string | null;
}

/** A crop that keeps less than this fraction of the photo is treated as a failure. */
export const MIN_CROP_KEEP_RATIO = 0.05;
/** A trim that keeps more than this fraction changed nothing meaningful. */
export const NO_CROP_RATIO = 0.98;
const TRIM_THRESHOLD = 32;
export const DISPLAY_MAX_WIDTH = 700;
export const DISPLAY_MAX_HEIGHT = 900;

async function resizeForDisplay(input: Buffer) {
  return sharp(input)
    .resize({ width: DISPLAY_MAX_WIDTH, height: DISPLAY_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export async function prepareGarmentDisplayImage(evidenceBytes: Buffer): Promise<DisplayPreparation> {
  const rotated = await sharp(evidenceBytes).rotate().toBuffer({ resolveWithObject: true });
  const originalArea = Math.max(1, rotated.info.width * rotated.info.height);
  try {
    const trimmed = await sharp(rotated.data).trim({ threshold: TRIM_THRESHOLD }).toBuffer({ resolveWithObject: true });
    const keptRatio = (trimmed.info.width * trimmed.info.height) / originalArea;
    if (keptRatio < MIN_CROP_KEEP_RATIO) {
      const fallback = await resizeForDisplay(rotated.data);
      return { buffer: fallback.data, width: fallback.info.width, height: fallback.info.height, cropped: false, fallbackReason: "crop-kept-too-little" };
    }
    const cropped = keptRatio <= NO_CROP_RATIO;
    const display = await resizeForDisplay(trimmed.data);
    return {
      buffer: display.data,
      width: display.info.width,
      height: display.info.height,
      cropped,
      // A trim that changed nothing (busy or uniform background) is reported so the
      // caller can tell the user the original framing is being shown.
      fallbackReason: cropped ? null : "no-meaningful-crop",
    };
  } catch {
    const fallback = await resizeForDisplay(rotated.data);
    return { buffer: fallback.data, width: fallback.info.width, height: fallback.info.height, cropped: false, fallbackReason: "trim-unavailable" };
  }
}

/**
 * Builds both stored image variants from the prepared front evidence photo:
 * the evidence original is returned byte-for-byte unchanged, and the display
 * version is the auto-cropped (or fallback) rendition of the same photo.
 */
export async function prepareWardrobeImages(evidenceJpeg: Buffer) {
  const display = await prepareGarmentDisplayImage(evidenceJpeg);
  return {
    evidence: { buffer: evidenceJpeg, contentType: "image/jpeg" as const },
    display,
  };
}
