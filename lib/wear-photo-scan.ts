import sharp from "sharp";
import { AiBudgetExhausted, metered } from "./ai-budget.ts";
import type { AiAllowance } from "./abuse-limits.ts";
import { asUploadError, MAX_UPLOAD_BYTES, UploadValidationError } from "./garment-analysis.ts";
import type { DetectedLookGarment } from "./look-garment-detection.ts";
import type { RateLimitDecision } from "./rate-limit.ts";
import { MAX_INPUT_PIXELS, readCappedFormData, SINGLE_PHOTO_BODY_BYTES } from "./request-body.ts";
import type { WardrobeItem } from "./types.ts";
import { matchWearPhoto, MAX_WEAR_PIECES, type DetectedPiece, type WearPhotoSuggestion } from "./wear-photo-match.ts";

/**
 * "Log with a photo", on the server: read the photo, ask the existing whole-look detector what it
 * shows, and rank the person's own closet against it (lib/wear-photo-match.ts).
 *
 * What this deliberately does not do:
 *
 * - **Record anything.** It has no way to write a wear, a count, points or brand data; the person
 *   confirms the pieces on screen and the browser then calls /api/wears as any other wear.
 * - **Keep the photo.** The bytes are decoded, resized and sent to the detector in memory, then
 *   dropped with the request. Nothing is written to storage, unlike a closet scan, which keeps its
 *   photo under temp/ for the person to save pieces from. Logs carry an error's name, never image
 *   contents.
 * - **Trust the browser about whose closet it is.** The closet is read for the session's own
 *   account, and suggestions name only those pieces. The request carries a photo and nothing else.
 *
 * Every dependency is passed in, so the whole path is tested without a session, a database or a
 * model; app/api/wears/photo/route.ts binds the real ones.
 */

export interface WearPhotoSession { subject: string; role: string; demo?: unknown }

export interface WearPhotoScanDependencies {
  getSession: () => Promise<WearPhotoSession | null>;
  consumeRateLimit: (key: string) => RateLimitDecision;
  /** The session's own closet. Called only with the session's subject. */
  listCloset: (ownerId: string) => Promise<WardrobeItem[]>;
  /** One request from the account's daily scan allowance. */
  spendAllowance: (ownerId: string) => Promise<AiAllowance>;
  /** One model call from the site's daily ceiling; false means do not call the model. */
  spendSiteModelCall: (session: WearPhotoSession) => Promise<boolean>;
  detect: (input: { base64: string; contentType: "image/jpeg"; image: { width: number; height: number } }) => Promise<DetectedLookGarment[]>;
  aiConfigured: () => boolean;
  log?: (message: string, fields: Record<string, string>) => void;
}

/** What the confirm screen gets. `outcome` says why there are no suggestions when there are none. */
export interface WearPhotoScanResult {
  outcome: "suggestions" | "nothing-found" | "ai-unavailable" | "empty-closet";
  suggestions: WearPhotoSuggestion[];
  maxPieces: number;
  message?: string;
  photoKept: false;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const NO_STORE = { "cache-control": "no-store" };

function reply(body: object, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function result(outcome: WearPhotoScanResult["outcome"], suggestions: WearPhotoSuggestion[] = [], message?: string): WearPhotoScanResult {
  return { outcome, suggestions, maxPieces: MAX_WEAR_PIECES, ...(message ? { message } : {}), photoKept: false };
}

const PICK_BY_HAND = "Choose the pieces by hand instead.";

/** The detector's answer, reduced to the words the matcher compares. Manual-review stand-ins are dropped. */
export function detectedPieces(detections: DetectedLookGarment[]): DetectedPiece[] {
  return detections.filter(entry => entry.analysis.provider !== "manual-review").map(entry => ({
    id: entry.id,
    name: entry.analysis.garment.name,
    category: entry.analysis.garment.category,
    subtype: entry.analysis.garment.subtype,
    color: entry.analysis.garment.color,
    pattern: entry.analysis.garment.pattern,
    material: entry.analysis.garment.material,
    wearableUnit: entry.analysis.garment.wearableUnit,
    confidence: entry.analysis.confidence,
  }));
}

export async function handleWearPhotoScan(request: Request, dependencies: WearPhotoScanDependencies): Promise<Response> {
  const log = dependencies.log ?? ((message, fields) => console.error(message, fields));
  const session = await dependencies.getSession();
  if (!session) return reply({ error: "Sign in is required." }, 401);
  if (session.role !== "consumer") return reply({ error: "Only Consumer accounts can log a wear." }, 403);
  // The same budget as a closet scan: both are one photo and one metered model call.
  const limit = dependencies.consumeRateLimit(`look-detect:${session.subject}`);
  if (!limit.allowed) return reply({ error: "Too many photo scans. Try again in a few minutes, or choose the pieces by hand." }, 429, { "retry-after": String(limit.retryAfterSeconds) });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 1_000_000) return reply({ error: "The photo must be no more than 5 MB." }, 413);

  let stage: "input" | "closet" | "recognition" = "input";
  try {
    const form = await readCappedFormData(request, SINGLE_PHOTO_BODY_BYTES).catch((error: unknown) => { throw asUploadError(error); });
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new UploadValidationError("Choose a photo of what you are wearing.");
    if (!ALLOWED_TYPES.has(file.type)) throw new UploadValidationError("The photo must be JPG, PNG, or WebP.");
    if (file.size > MAX_UPLOAD_BYTES) throw new UploadValidationError("The photo must be no more than 5 MB.", 413);

    stage = "closet";
    const closet = await dependencies.listCloset(session.subject);
    // Nothing to match against: no model call is spent.
    if (closet.length === 0) return reply(result("empty-closet", [], "Your closet is empty. Add your clothes first, then log what you wear."));
    if (!dependencies.aiConfigured()) return reply(result("ai-unavailable", [], `Photo matching is not available right now. ${PICK_BY_HAND}`));

    stage = "input";
    const prepared = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    const allowance = await dependencies.spendAllowance(session.subject);
    if (!allowance.allowed) return reply({ ...result("ai-unavailable", [], `${allowance.message} ${PICK_BY_HAND}`), error: allowance.message }, allowance.scope === "account" ? 429 : 503, { "retry-after": String(allowance.retryAfterSeconds) });

    stage = "recognition";
    let detections: DetectedLookGarment[];
    try {
      detections = await metered(() => dependencies.spendSiteModelCall(session), dependencies.detect)({
        base64: prepared.data.toString("base64"),
        contentType: "image/jpeg",
        image: { width: prepared.info.width, height: prepared.info.height },
      });
    } catch (error) {
      // The error's name only: a provider message can quote the request it rejected.
      log("Wear photo recognition unavailable", { name: error instanceof Error ? error.name : "UnknownError" });
      const paused = error instanceof AiBudgetExhausted;
      return reply(result("ai-unavailable", [], `${paused ? "Racked's AI is paused for today to protect the service." : "Racked could not read this photo just now."} ${PICK_BY_HAND}`));
    }

    const pieces = detectedPieces(detections);
    if (pieces.length === 0) return reply(result("nothing-found", [], `Racked could not find clothing in this photo. ${PICK_BY_HAND}`));
    return reply(result("suggestions", matchWearPhoto(pieces, closet)));
  } catch (error) {
    if (error instanceof UploadValidationError) return reply({ error: error.message }, error.status);
    log("Wear photo scan failed", { stage, name: error instanceof Error ? error.name : "UnknownError" });
    if (stage === "input") return reply({ error: "Racked could not read this image. Choose a JPG, PNG, or WebP photo under 5 MB." }, 400);
    if (stage === "closet") return reply({ error: "Your closet could not be loaded. Try again in a moment." }, 503);
    return reply({ error: `Racked could not finish this scan. ${PICK_BY_HAND}` }, 502);
  }
}
