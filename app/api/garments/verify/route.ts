import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { matchBrandProduct } from "@/lib/product-registry";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { listRegistryProducts, ProductionConfigurationError } from "@/lib/server/production-store";
import type { UploadDescriptor } from "@/lib/platform-types";

export const runtime = "nodejs";

const MAX_LABEL_TEXT = 1_000;

/**
 * Checks label evidence against the brand registry for one garment.
 *
 * Judge note: this route exists so that a garment added through the fast one-photo path can
 * still be connected to an enrolled brand product. Previously only the three-photo flow
 * consulted the registry, which meant a genuine brand product photographed the quick way
 * could never be verified — the person had to know in advance which intake mode to pick.
 *
 * The verification boundary is unchanged and is the whole point of the route. A match
 * requires registry evidence: a GTIN, or a brand alias together with that brand's SKU, both
 * read out of the supplied label text by `matchBrandProduct`. Free text that merely names a
 * brand matches nothing. This route cannot create, upgrade, or infer verified identity by
 * any other means, and it never writes anything — it answers a question and returns.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "consumer") return NextResponse.json({ error: "Only Consumer accounts can check a garment label." }, { status: 403 });

  const limit = consumeRateLimit(`garment-verify:${session.subject}`, RATE_LIMIT_RULES.garmentVerify);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many label checks. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const labelText = typeof body?.labelText === "string" ? body.labelText.slice(0, MAX_LABEL_TEXT) : "";
    if (!labelText.trim()) {
      return NextResponse.json({ error: "Add the label text — a product code, style number, or barcode number — so Racked has something to check." }, { status: 400 });
    }

    const registry = await listRegistryProducts();
    // Only the label view carries identity evidence, and this route accepts no image, so
    // hash-based matching cannot apply here. Text evidence alone is deliberately limited to
    // the GTIN and brand-plus-SKU rules.
    const parts: UploadDescriptor[] = [];
    const match = matchBrandProduct(parts, labelText, registry);

    if (!match) {
      return NextResponse.json({
        verified: false,
        reason: "No enrolled product matched this label.",
        boundary: "A brand name alone never verifies a product. Racked needs the barcode number, or the brand together with its style or SKU code, and that product must be enrolled by the brand.",
      });
    }

    return NextResponse.json({
      verified: true,
      matchMethod: match.method,
      product: {
        registryProductId: match.product.id,
        name: match.product.name,
        brand: match.product.brand,
        brandSlug: match.product.brandSlug,
        sku: match.product.sku,
        category: match.product.category,
      },
      boundary: "This product is enrolled by its brand and matched on registry evidence. Wear you record can contribute to that brand's anonymous aggregates only if you separately enable brand data sharing.",
    });
  } catch (error) {
    if (error instanceof ProductionConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error("Garment label verification failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "The label could not be checked. Try again in a moment." }, { status: 502 });
  }
}
