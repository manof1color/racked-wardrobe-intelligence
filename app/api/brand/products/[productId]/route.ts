import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { listRegistryProducts, otherBrandNames, ProductionConfigurationError, updateBrandProduct } from "@/lib/server/production-store";
import type { BrandProductEdit } from "@/lib/product-registry";

/**
 * Corrects or retires one enrolled product.
 *
 * A catalog a brand cannot keep current stops being trusted: prices change, links move, and a typo
 * in a product name used to be permanent. Identity is the exception — the brand, style code, and
 * barcode a consumer's label is matched against can never be edited, because changing them would
 * move every existing link to a different product. A product that is genuinely wrong is retired
 * and enrolled again.
 *
 * Retiring keeps existing owners and their wear history intact and truthful; the product simply
 * stops answering labels, searches, suggestions, and its public brand page.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Brand account required." }, { status: 403 });
  const limit = consumeRateLimit(`brand-product-edit:${session.subject}`, RATE_LIMIT_RULES.brandProductEdit);
  if (!limit.allowed) return NextResponse.json({ error: "Too many product edits. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });

  const { productId } = await params;
  if (!productId || productId.length > 128) return NextResponse.json({ error: "Choose a product to edit." }, { status: 400 });
  const edit = await request.json().catch(() => null) as BrandProductEdit | null;
  if (!edit || typeof edit !== "object") return NextResponse.json({ error: "Send the fields to change." }, { status: 400 });

  try {
    // Aliases are the only edit that can reach beyond this account, so the other brands' names are
    // loaded for the same check enrollment makes.
    const others = edit.aliases !== undefined ? await otherBrandNames(session.subject, await listRegistryProducts()) : [];
    const product = await updateBrandProduct(session.subject, productId, edit, others);
    if (!product) return NextResponse.json({ error: "That product is not in your catalog." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof ProductionConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") return NextResponse.json({ error: "That product is not in your catalog." }, { status: 404 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The product could not be updated." }, { status: 400 });
  }
}
