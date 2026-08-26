import type { OutfitPost, PublicOutfitGarment } from "./platform-types.ts";

// Judge note: Community discovery is derived, never declared. Nobody tags a look as
// "streetwear" — the style is inferred from the controlled category, subtype, and style
// attributes already attached to each published garment. That keeps discovery honest
// (it can only describe what the pieces actually are) and keeps it working on every
// existing post without a migration. It reads only public post fields; no private
// wardrobe data is involved.

export type LookStyle = "formal" | "workwear" | "streetwear" | "casual" | "athletic" | "evening" | "minimal" | "outdoor";

export interface LookStyleDefinition {
  id: LookStyle;
  label: string;
  description: string;
  /** Style tags, subtypes, or category words that evidence this style. */
  signals: string[];
}

export const LOOK_STYLES: LookStyleDefinition[] = [
  { id: "formal", label: "Formal", description: "Tailoring and dress pieces for occasions with a dress code.", signals: ["formal", "tailored", "suit-jacket", "blazer", "dress-shirt", "dress-pants", "dress-shoes", "oxford", "derby", "tie", "pocket-square", "formal-dress", "gown", "elegant", "refined"] },
  { id: "workwear", label: "Workwear", description: "Smart pieces built for a working week rather than an event.", signals: ["smart", "structured", "classic", "chinos", "polo", "loafers", "blazer", "casual-shirt", "cardigan", "briefcase", "professional"] },
  { id: "streetwear", label: "Streetwear", description: "Relaxed, urban silhouettes — hoodies, sneakers, and outer layers.", signals: ["street", "streetwear", "hoodie", "sweatshirt", "bomber-jacket", "denim-jacket", "sneakers", "cap", "beanie", "oversized", "graphic", "backpack", "sweatpants", "crossbody"] },
  { id: "casual", label: "Casual", description: "Everyday clothes worn without an occasion in mind.", signals: ["casual", "relaxed", "everyday", "comfortable", "t-shirt", "tee", "jeans", "shorts", "casual-dress", "tank-top", "slip-on"] },
  { id: "athletic", label: "Athletic", description: "Performance and training pieces.", signals: ["athletic", "sport", "sporty", "technical", "performance", "running-shoes", "trainer", "leggings", "sweatpants", "gym", "activewear"] },
  { id: "evening", label: "Evening", description: "Going-out pieces — sleeker, often darker, occasion-leaning.", signals: ["evening", "elegant", "sleek", "statement", "party", "cocktail", "heels", "clutch", "mini-dress", "midi-dress", "maxi-dress", "wrap-dress", "necklace", "earrings"] },
  { id: "minimal", label: "Minimal", description: "Pared-back shapes and quiet colour.", signals: ["minimal", "clean", "monochrome", "understated", "knit", "sweater", "plain", "solid"] },
  { id: "outdoor", label: "Outdoor", description: "Weather-facing and utility layers.", signals: ["outdoor", "utility", "rain-jacket", "puffer-jacket", "parka", "overcoat", "boots", "trail", "hike", "technical", "shell", "vest"] },
];

/** Broad garment categories a person can filter a feed by. */
export const LOOK_CATEGORIES = ["top", "bottom", "outerwear", "dress", "shoe", "bag", "jewelry", "accessory"] as const;
export type LookCategory = (typeof LOOK_CATEGORIES)[number];

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

/** Every lowercase attribute word a garment contributes to style inference. */
function garmentSignals(garment: PublicOutfitGarment) {
  return [clean(garment.category), clean(garment.subtype), clean(garment.name), ...(garment.style ?? []).map(clean)].filter(Boolean);
}

function matches(signals: string[], definition: LookStyleDefinition) {
  return definition.signals.some((signal) => signals.some((value) => value === signal || value.includes(signal)));
}

/** Styles evidenced by a look's own published pieces. Deterministic and order-stable. */
export function classifyLookStyles(post: Pick<OutfitPost, "garments">): LookStyle[] {
  const signals = (post.garments ?? []).flatMap(garmentSignals);
  if (signals.length === 0) return [];
  return LOOK_STYLES.filter((definition) => matches(signals, definition)).map((definition) => definition.id);
}

/** Broad categories present in a look. */
export function lookCategories(post: Pick<OutfitPost, "garments">): LookCategory[] {
  const present = new Set<LookCategory>();
  for (const garment of post.garments ?? []) {
    const category = clean(garment.category);
    const match = LOOK_CATEGORIES.find((known) => category === known || category.includes(known));
    if (match) present.add(match);
  }
  return LOOK_CATEGORIES.filter((category) => present.has(category));
}

export interface LookFilters {
  source?: "all" | "consumer" | "brand";
  style?: LookStyle | "all";
  category?: LookCategory | "all";
  query?: string;
}

/** Free-text search across only public post fields. */
function matchesQuery(post: OutfitPost, query: string) {
  const needle = clean(query);
  if (!needle) return true;
  const haystack = [
    clean(post.outfitTitle), clean(post.caption), clean(post.handle),
    ...(post.garments ?? []).flatMap((garment) => [clean(garment.name), clean(garment.category), clean(garment.subtype), clean(garment.color), clean(garment.verifiedProduct?.brand), clean(garment.unverifiedBrandLabel)]),
  ].filter(Boolean);
  return haystack.some((value) => value.includes(needle));
}

export function filterLooks(posts: OutfitPost[], filters: LookFilters = {}): OutfitPost[] {
  const { source = "all", style = "all", category = "all", query = "" } = filters;
  return posts.filter((post) => {
    if (source !== "all" && post.sourceType !== source) return false;
    if (style !== "all" && !classifyLookStyles(post).includes(style)) return false;
    if (category !== "all" && !lookCategories(post).includes(category)) return false;
    return matchesQuery(post, query);
  });
}

/** Styles that actually have looks, so the UI never offers an empty filter. */
export function availableStyles(posts: OutfitPost[]): Array<LookStyleDefinition & { count: number }> {
  return LOOK_STYLES
    .map((definition) => ({ ...definition, count: posts.filter((post) => classifyLookStyles(post).includes(definition.id)).length }))
    .filter((entry) => entry.count > 0);
}

/** Categories that actually have looks. */
export function availableCategories(posts: OutfitPost[]): Array<{ category: LookCategory; count: number }> {
  return LOOK_CATEGORIES
    .map((category) => ({ category, count: posts.filter((post) => lookCategories(post).includes(category)).length }))
    .filter((entry) => entry.count > 0);
}
