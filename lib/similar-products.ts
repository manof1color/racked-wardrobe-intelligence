import type { CommerceDestinationState } from "./platform-types.ts";

// Judge note: this is the client-side contract for the PLANNED similar-product
// endpoint. It is deliberately defensive: a suggestion is never allowed to present
// itself as the exact piece worn in an outfit, and a destination is only accepted as
// a same-origin path so a suggestion can never become an open redirect. Those rules
// are enforced here rather than trusted from the response.

export interface SimilarSuggestion {
  registryProductId: string;
  sku: string;
  name: string;
  brand: string;
  brandSlug: string;
  category: string;
  price?: number;
  currency?: string;
  score: number;
  reasons: string[];
  commerceState: CommerceDestinationState;
  /** Same-origin path only, e.g. /api/products/<id>/outbound. Never an absolute URL. */
  outboundUrl?: string;
}

export const MAX_SIMILAR_SUGGESTIONS = 6;

/** Accepts only a same-origin absolute path, never a full URL or protocol-relative path. */
function safeOutboundPath(value: unknown) {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Normalizes an untrusted similar-products response.
 * A suggestion can only ever be SIMILAR_AVAILABLE or NO_DESTINATION — even if the
 * server claims an exact state, it is downgraded here, because the exact badge means
 * "this is the piece that was worn" and a suggestion never is.
 */
export function parseSimilarSuggestions(payload: unknown): SimilarSuggestion[] {
  const raw = (payload as { similar?: unknown } | null)?.similar;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const outboundUrl = safeOutboundPath(entry.outboundUrl);
      const price = finiteNumber(entry.price);
      return {
        registryProductId: String(entry.registryProductId ?? ""),
        sku: String(entry.sku ?? ""),
        name: String(entry.name ?? ""),
        brand: String(entry.brand ?? ""),
        brandSlug: String(entry.brandSlug ?? ""),
        category: String(entry.category ?? ""),
        ...(price !== undefined ? { price } : {}),
        ...(entry.currency ? { currency: String(entry.currency) } : {}),
        score: Math.max(0, Math.min(100, Math.round(finiteNumber(entry.score) ?? 0))),
        reasons: (Array.isArray(entry.reasons) ? entry.reasons : []).filter((reason): reason is string => typeof reason === "string").slice(0, 4),
        commerceState: (outboundUrl ? "SIMILAR_AVAILABLE" : "NO_DESTINATION") as CommerceDestinationState,
        ...(outboundUrl ? { outboundUrl } : {}),
      };
    })
    .filter((entry) => entry.registryProductId && entry.name)
    .slice(0, MAX_SIMILAR_SUGGESTIONS);
}

/** Wording used wherever a suggestion is shown. Never claims exactness. */
export const SIMILAR_DISCLAIMER = "Comparable products from enrolled brands. These are not the piece worn in this outfit.";
