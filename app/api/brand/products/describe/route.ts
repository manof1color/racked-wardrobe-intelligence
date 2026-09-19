import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/garment-analysis";
import { detectLookOrManualReview } from "@/lib/look-scan-resilience";
import { describeProductFromDetections } from "@/lib/product-description";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Fills in a product's details from its photo, so a brand enrolling a product types its SKU and
 * little else. The same recognition that reads a consumer's scan reads the brand's product photo
 * and proposes a name, category, type, colour, pattern, and material. It proposes only: the brand
 * sees every field and can change any of them before enrolling. The photo is read in memory and
 * nothing is stored — enrollment stores it later, if the brand goes ahead.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Brand account required." }, { status: 403 });
  const limit = consumeRateLimit(`brand-describe:${session.subject}`, RATE_LIMIT_RULES.brandProductDescribe);
  if (!limit.allowed) return NextResponse.json({ error: "Too many photo readings. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 1_000_000) return NextResponse.json({ error: "The photo must be no more than 5 MB." }, { status: 413 });
  if ((process.env.AI_PROVIDER ?? "").toLowerCase() !== "bedrock") return NextResponse.json({ error: "Reading product photos is not configured here. Fill in the details yourself." }, { status: 503 });

  let prepared: { data: Buffer; info: { width: number; height: number } };
  try {
    const form = await request.formData();
    const file = form.get("front");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose the product photo first." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "The product photo must be JPG, PNG, or WebP." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The photo must be no more than 5 MB." }, { status: 413 });
    prepared = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  } catch {
    return NextResponse.json({ error: "Racked could not read this image. Choose a valid JPG, PNG, or WebP file under 5 MB." }, { status: 400 });
  }

  try {
    const recognition = await detectLookOrManualReview({ base64: prepared.data.toString("base64"), contentType: "image/jpeg", image: { width: prepared.info.width, height: prepared.info.height } });
    const suggestion = describeProductFromDetections(recognition.providerFailed ? [] : recognition.detections);
    if (!suggestion) return NextResponse.json({ suggestion: null, message: "Racked couldn't make out the product in this photo. Fill in the details yourself, or try a photo of the product on a plain background." });
    return NextResponse.json({ suggestion, message: "Filled in from your photo. Check every field before enrolling — nothing here is saved until you do." });
  } catch (error) {
    console.error("Brand product photo reading failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "The photo could not be read right now. Fill in the details yourself, or try again in a moment." }, { status: 502 });
  }
}
