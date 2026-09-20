/**
 * Finding a brand's product without its label.
 *
 * Linking a garment used to need the code from its care label. That label is often cut out,
 * faded, or in a drawer, so most brand pieces stayed unlinked. This module offers two other ways
 * to find the product: recognition, which ranks a brand's enrolled products against what the scan
 * saw, and search, which lets a person look up the brand they bought from.
 *
 * Neither can verify anything. A product found this way is recorded as the owner's own selection
 * ("owner-selected"), never as verified identity, and it never joins the verified-owner index that
 * brand wear aggregates are built from. Verification still requires the label: a GTIN, or the
 * brand with its style code (see lib/product-registry.ts).
 */
import { normalizeGarmentClassification, subtypeForCategory, type GarmentCategory } from "./garment-taxonomy.ts";
import { normalizeIdentity } from "./product-registry.ts";
import { scoreGarmentAppearance, type GarmentAppearance } from "./recreate-look.ts";
import type { BrandProductRegistration } from "./platform-types.ts";

export const MAX_CATALOG_CANDIDATES = 3;
export const MAX_CATALOG_SEARCH_RESULTS = 8;
export const MIN_CATALOG_QUERY_LENGTH = 2;
/** A suggestion must clear this after brand evidence is weighed in; below it, it is a guess. */
export const MIN_CANDIDATE_SCORE = 60;
/** How much a brand name read off the piece counts, against how the piece looks. */
export const CATALOG_MATCH_WEIGHTS = { appearance: 0.7, brand: 0.3 } as const;

const GARMENT_COLORS = [
  "black", "white", "cream", "ivory", "grey", "gray", "charcoal", "navy", "blue", "indigo", "denim", "light blue",
  "green", "olive", "khaki", "sage", "brown", "tan", "camel", "beige", "sienna", "rust", "red", "burgundy", "maroon",
  "merlot", "pink", "purple", "lilac", "yellow", "mustard", "orange", "gold", "silver",
];

/** What a scan saw about a piece. Every field is optional except the category. */
export interface CatalogPieceDescription extends GarmentAppearance {
  /** A brand name the scan read off the piece, or that the person typed. A hint, never evidence. */
  brandText?: string;
}

/** The public face of an enrolled product: what its brand page already shows, and nothing more. */
export interface CatalogProductSummary {
  registryProductId: string;
  name: string;
  brand: string;
  brandSlug: string;
  sku: string;
  category: string;
  subtype?: string;
  color?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
}

export interface CatalogCandidate extends CatalogProductSummary {
  score: number;
  brandEvidence: boolean;
  reasons: string[];
}

const text = (value: unknown, maximum = 80) => (typeof value === "string" ? value.trim().slice(0, maximum) : "");
const known = (value?: string) => (value && value !== "unknown" && !value.startsWith("other-") ? value : undefined);

/**
 * A product's appearance, filled in from its name where the brand left a field empty, so products
 * enrolled before attributes existed can still be recognised: "Merlot Day Tote" is a tote, and
 * it is merlot.
 */
export function catalogAppearance(product: BrandProductRegistration): GarmentAppearance {
  const classification = normalizeGarmentClassification(product.category, product.subtype ?? "");
  const name = ` ${words(product.name).join(" ")} `;
  const namedColor = GARMENT_COLORS.find((color) => name.includes(` ${color} `));
  return {
    category: classification.category,
    subtype: known(classification.subtype) ?? subtypeFromName(classification.category, product.name),
    color: known(product.color?.toLowerCase()) ?? namedColor,
    pattern: known(product.pattern?.toLowerCase()),
    material: known(product.material?.toLowerCase()),
    style: product.style ?? [],
  };
}

/** A type named in the product's name, read from its last words first: "Merlot Day Tote" is a tote. */
function subtypeFromName(category: GarmentCategory, name: string) {
  const tokens = words(name);
  for (let size = Math.min(3, tokens.length); size >= 1; size--) {
    for (let start = tokens.length - size; start >= 0; start--) {
      const subtype = subtypeForCategory(category, tokens.slice(start, start + size).join(" "));
      if (!subtype.startsWith("other-")) return subtype;
    }
  }
  return undefined;
}

export function catalogProductSummary(product: BrandProductRegistration, imageUrl?: string): CatalogProductSummary {
  const appearance = catalogAppearance(product);
  return {
    registryProductId: product.id,
    name: product.name,
    brand: product.brand,
    brandSlug: product.brandSlug,
    sku: product.sku,
    category: appearance.category,
    ...(appearance.subtype ? { subtype: appearance.subtype } : {}),
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(product.price !== undefined ? { price: product.price } : {}),
    ...(product.currency ? { currency: product.currency } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** A plain-language reason for one agreeing attribute; nothing is said about attributes that do not agree. */
function matchReason(key: string, score: number, piece: GarmentAppearance, product: GarmentAppearance): string[] {
  const words = (value?: string) => String(value ?? "").replace(/-/g, " ");
  if (key === "subtype" && score === 100) return [`Same type: ${words(product.subtype)}`];
  if (key === "color" && score === 100) return [`Same colour: ${product.color}`];
  if (key === "color" && score >= 70) return [`Close colour: ${piece.color} and ${product.color}`];
  if (key === "pattern" && score === 100) return [`Same pattern: ${product.pattern}`];
  if (key === "material" && score === 100) return [`Same material: ${product.material}`];
  if (key === "style" && score >= 70) return ["Similar style"];
  return [];
}

/** Whether a brand name read off the piece names this product's brand. */
export function brandTextNames(product: BrandProductRegistration, brandText?: string) {
  const read = normalizeIdentity(text(brandText, 100));
  if (read.length < 3) return false;
  return [product.brand, ...(product.aliases ?? [])].some((name) => {
    const candidate = normalizeIdentity(name);
    return candidate.length >= 3 && (read === candidate || read.includes(candidate) || (read.length >= 5 && candidate.includes(read)));
  });
}

/**
 * Ranks the catalog against one scanned piece. Category must agree, and a known type that
 * contradicts the piece rules a product out: a hoodie is never offered as someone's t-shirt. A
 * brand name read off the piece counts for 30% and is otherwise just a hint — without it, only a
 * product that matches closely on type, colour, and more is offered at all.
 */
export function rankCatalogCandidates(piece: CatalogPieceDescription, registry: BrandProductRegistration[], imageUrlFor: (product: BrandProductRegistration) => string | undefined = () => undefined): CatalogCandidate[] {
  const target = normalizeGarmentClassification(text(piece.category, 40), text(piece.subtype, 60));
  if (target.category === "unknown") return [];
  const described: GarmentAppearance = {
    category: target.category,
    subtype: known(target.subtype),
    color: known(text(piece.color, 40).toLowerCase()),
    pattern: known(text(piece.pattern, 40).toLowerCase()),
    material: known(text(piece.material, 60).toLowerCase()),
    style: Array.isArray(piece.style) ? piece.style.map((style) => text(style, 30).toLowerCase()).filter(Boolean).slice(0, 8) : [],
  };
  return registry
    .filter((product) => !product.archived)
    .flatMap((product): CatalogCandidate[] => {
      const appearance = catalogAppearance(product);
      if (appearance.category !== described.category) return [];
      const { components, score: appearanceScore } = scoreGarmentAppearance(described, appearance);
      if (components.find((component) => component.key === "subtype")?.score === 0) return [];
      const brandEvidence = brandTextNames(product, piece.brandText);
      const score = Math.round(appearanceScore * CATALOG_MATCH_WEIGHTS.appearance + (brandEvidence ? 100 : 0) * CATALOG_MATCH_WEIGHTS.brand);
      if (score < MIN_CANDIDATE_SCORE) return [];
      const reasons = [
        ...(brandEvidence ? [`${product.brand} was read on this piece`] : []),
        ...components.flatMap((component) => matchReason(component.key, component.score, described, appearance)),
      ].slice(0, 4);
      return [{ ...catalogProductSummary(product, imageUrlFor(product)), score, brandEvidence, reasons }];
    })
    .sort((a, b) => b.score - a.score || a.registryProductId.localeCompare(b.registryProductId))
    .slice(0, MAX_CATALOG_CANDIDATES);
}

function words(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Looks a product up by what a person remembers: the brand, the product's name, or its style code.
 * Every word typed must match something, so "northstar shirt" narrows rather than widens.
 */
export function searchCatalog(query: string, registry: BrandProductRegistration[], options: { category?: string; imageUrlFor?: (product: BrandProductRegistration) => string | undefined } = {}): CatalogProductSummary[] {
  const terms = words(text(query, 80)).slice(0, 6);
  if (terms.join("").length < MIN_CATALOG_QUERY_LENGTH) return [];
  const category = options.category ? normalizeGarmentClassification(options.category, "").category : "unknown";
  return registry
    .filter((product) => !product.archived)
    .map((product) => {
      const appearance = catalogAppearance(product);
      if (category !== "unknown" && appearance.category !== category) return null;
      const brandWords = words([product.brand, ...(product.aliases ?? [])].join(" "));
      const nameWords = words(product.name);
      const kindWords = words(`${appearance.category} ${appearance.subtype ?? ""}`);
      const sku = normalizeIdentity(product.sku);
      let score = 0;
      for (const term of terms) {
        const weight = brandWords.some((word) => word.startsWith(term)) ? 3
          : term.length >= 3 && sku.includes(term) ? 3
            : nameWords.some((word) => word.startsWith(term)) ? 2
              : kindWords.some((word) => word.startsWith(term)) ? 1
                : 0;
        if (weight === 0) return null;
        score += weight;
      }
      return { product, score, appearance };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score || a.product.brand.localeCompare(b.product.brand) || a.product.name.localeCompare(b.product.name))
    .slice(0, MAX_CATALOG_SEARCH_RESULTS)
    .map(({ product }) => catalogProductSummary(product, options.imageUrlFor?.(product)));
}

/** Reads a client-sent piece description defensively: only bounded strings reach the ranker. */
export function readCatalogPieceDescription(value: unknown): CatalogPieceDescription | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const category = text(record.category, 40);
  if (!category) return null;
  return {
    category,
    subtype: text(record.subtype, 60) || undefined,
    color: text(record.color, 40) || undefined,
    pattern: text(record.pattern, 40) || undefined,
    material: text(record.material, 60) || undefined,
    style: Array.isArray(record.style) ? record.style.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.slice(0, 30)).slice(0, 8) : [],
    brandText: text(record.brandText, 100) || undefined,
  };
}
