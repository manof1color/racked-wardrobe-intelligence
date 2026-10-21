import sharp from "sharp";
import { UploadValidationError } from "./garment-analysis.ts";

/**
 * Re-encodes an uploaded photograph before it is stored.
 *
 * A phone or camera writes metadata into every photo — often the GPS position it was taken at, the
 * device, and the time. Consumer scans have always been re-encoded on the way in, which drops it;
 * brand product photos were stored exactly as uploaded and then shown to consumers in the catalog,
 * so a small brand photographing stock at home published where home is. Re-encoding also proves the
 * file is the image it claims to be: the bytes must decode, as JPEG, PNG, or WebP, whatever type the
 * browser declared. Orientation is applied to the pixels first, so nothing appears rotated once the
 * orientation tag is gone.
 */
const FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type Format = keyof typeof FORMATS;

export async function stripImageMetadata(bytes: Buffer): Promise<{ bytes: Buffer; contentType: string }> {
  let format: string | undefined;
  try {
    format = (await sharp(bytes, { failOn: "error" }).metadata()).format;
  } catch {
    throw new UploadValidationError("That file is not a readable image.");
  }
  if (!format || !(format in FORMATS)) throw new UploadValidationError("Photos must be JPG, PNG, or WebP.");
  const pipeline = sharp(bytes, { failOn: "error" }).rotate();
  const output = format === "png" ? pipeline.png() : format === "webp" ? pipeline.webp({ quality: 90 }) : pipeline.jpeg({ quality: 90, mozjpeg: true });
  return { bytes: await output.toBuffer(), contentType: FORMATS[format as Format] };
}
