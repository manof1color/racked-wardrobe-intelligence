import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rankCatalogCandidates, readCatalogPieceDescription, searchCatalog, type CatalogProductSummary } from "@/lib/catalog-match";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { catalogImageUrl, listRegistryProducts, ProductionConfigurationError } from "@/lib/server/production-store";
import type { BrandProductRegistration } from "@/lib/platform-types";

/**
 * The brand catalog, for a person linking a garment without its label.
 *
 * GET searches it by brand, product name, or style code. POST ranks it against one scanned piece,
 * which is how a piece is recognised as a brand's product from its photo alone. Both return only
 * what a brand's public page already shows, both are Consumer-only and rate limited, and neither
 * writes anything. Choosing a result links a garment as the owner's selection, never as verified.
 */

async function consumer(rule: keyof typeof RATE_LIMIT_RULES) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) };
  if (session.role !== "consumer") return { error: NextResponse.json({ error: "Only Consumer accounts can search the brand catalog." }, { status: 403 }) };
  const limit = consumeRateLimit(`${rule}:${session.subject}`, RATE_LIMIT_RULES[rule]);
  if (!limit.allowed) return { error: NextResponse.json({ error: "Too many catalog searches. Try again in a moment." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }) };
  return { session };
}

async function withImages<T extends CatalogProductSummary>(results: T[], registry: BrandProductRegistration[]) {
  const byId = new Map(registry.map((product) => [product.id, product]));
  return Promise.all(results.map(async (result) => {
    const product = byId.get(result.registryProductId);
    const imageUrl = product ? await catalogImageUrl(product).catch(() => undefined) : undefined;
    return imageUrl ? { ...result, imageUrl } : result;
  }));
}

function failure(error: unknown) {
  if (error instanceof ProductionConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
  console.error("Brand catalog lookup failed", { name: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: "The brand catalog could not be searched. Try again in a moment." }, { status: 502 });
}

export async function GET(request: Request) {
  const { error } = await consumer("catalogSearch");
  if (error) return error;
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").slice(0, 80);
  const category = (url.searchParams.get("category") ?? "").slice(0, 40) || undefined;
  try {
    const registry = await listRegistryProducts();
    return NextResponse.json({ results: await withImages(searchCatalog(query, registry, { category }), registry) });
  } catch (reason) {
    return failure(reason);
  }
}

export async function POST(request: Request) {
  const { error } = await consumer("catalogMatch");
  if (error) return error;
  const piece = readCatalogPieceDescription(await request.json().catch(() => null));
  if (!piece) return NextResponse.json({ error: "Describe the piece with at least its category." }, { status: 400 });
  try {
    const registry = await listRegistryProducts();
    return NextResponse.json({
      candidates: await withImages(rankCatalogCandidates(piece, registry), registry),
      boundary: "A possible match is a suggestion from how the piece looks. Choosing it links the product as your selection; only the barcode or the brand's style code from the label verifies it.",
    });
  } catch (reason) {
    return failure(reason);
  }
}
