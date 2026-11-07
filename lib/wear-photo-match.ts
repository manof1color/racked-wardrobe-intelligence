import { normalizeGarmentCategory, type GarmentCategory } from "./garment-taxonomy.ts";
import type { WardrobeItem } from "./types.ts";

/**
 * "Log with a photo": which of the person's own closet pieces each detected garment most likely is.
 *
 * Plain code, no model call. The detector already said what it saw (category, type, color,
 * pattern, material); this compares those words with what the closet stores, so the ranking can
 * be read and tested. Category filters first; type, color, pattern and material then add to or
 * take from a score. A detail missing on either side counts for nothing in either direction, so a
 * piece added by hand with only a category and a name still appears, but never as a sure match.
 *
 * It only suggests. The person confirms, swaps or removes every piece before anything is
 * recorded, and it never invents or creates a closet piece: every candidate is one of the items
 * passed in.
 */

export interface DetectedPiece {
  id: string;
  name: string;
  category: string;
  subtype?: string;
  color?: string;
  pattern?: string;
  material?: string;
  wearableUnit?: "single" | "pair";
  /** The detector's own 0–95 confidence. */
  confidence?: number;
}

export type MatchStrength = "strong" | "possible";

export interface MatchCandidate {
  itemId: string;
  score: number;
  strength: MatchStrength;
  /** Short words for the confirm screen: "Same type", "Different color", "Few details saved". */
  reasons: string[];
}

export type SuggestionStatus =
  /** A strong match, preselected for the person to confirm. */
  | "matched"
  /** Candidates exist, but none is certain enough to preselect. */
  | "choose"
  /** Nothing in the closet is a reasonable match. */
  | "no-match"
  /** The detector could not tell what this piece is. */
  | "unrecognized"
  /** Probably the other shoe of a pair another detection already matched. */
  | "other-shoe"
  /** Its best match is already preselected for another detected piece. */
  | "already-matched";

export interface WearPhotoSuggestion {
  detectionId: string;
  detectedName: string;
  category: GarmentCategory;
  /** Best first, at most three: the best match and up to two alternatives. */
  candidates: MatchCandidate[];
  preselectedItemId: string | null;
  status: SuggestionStatus;
}

/** The wear route records at most ten pieces at once (app/api/wears/route.ts). */
export const MAX_WEAR_PIECES = 10;
export const MAX_CANDIDATES = 3;
/** At or above this, with clear agreement on type and color, a match may be preselected. */
export const STRONG_SCORE = 55;
/** The best match must lead the next candidate by this much to be preselected. */
export const STRONG_MARGIN = 15;
/** Below this, a closet piece is not offered at all. */
export const POSSIBLE_FLOOR = -10;
/** A detector this unsure about a piece never gets a preselected match. */
export const MIN_DETECTOR_CONFIDENCE = 40;

// ---------------------------------------------------------------------------------------------
// Words

const STOP_WORDS = new Set(["and", "with", "the", "a", "an", "of", "in", "on", "pair", "single", "style", "piece", "item", "unknown", "other", "garment", "classic", "casual", "basic", "mens", "womens", "men", "women"]);

function words(value: string | undefined | null) {
  return (value ?? "").toLowerCase().replace(/grey/g, "gray").split(/[^a-z]+/).filter(Boolean);
}

function unknownText(value: string | undefined | null) {
  const cleaned = (value ?? "").trim().toLowerCase();
  return !cleaned || /^(unknown|unconfirmed|n\/a|none|not visible|unclear|-)$/.test(cleaned);
}

// ---------------------------------------------------------------------------------------------
// Color

const COLOR_FAMILIES: Record<string, string[]> = {
  black: ["black", "jet", "onyx", "ebony", "noir"],
  white: ["white", "ivory", "cream", "ecru", "bone", "eggshell", "offwhite", "snow", "chalk", "pearl"],
  gray: ["gray", "charcoal", "heather", "slate", "silver", "ash", "graphite", "pewter", "smoke", "gunmetal"],
  blue: ["blue", "navy", "indigo", "denim", "cobalt", "royal", "sky", "azure", "cerulean", "chambray", "teal", "turquoise", "aqua", "cyan", "periwinkle"],
  beige: ["beige", "tan", "camel", "khaki", "sand", "stone", "taupe", "oatmeal", "nude", "fawn", "biscuit", "wheat", "natural"],
  brown: ["brown", "chocolate", "cognac", "mocha", "chestnut", "espresso", "coffee", "walnut", "umber", "caramel", "tobacco"],
  green: ["green", "olive", "sage", "forest", "emerald", "mint", "army", "moss", "hunter", "lime", "jade", "pine", "seafoam"],
  red: ["red", "burgundy", "maroon", "wine", "crimson", "scarlet", "oxblood", "cherry", "brick", "ruby", "cardinal"],
  pink: ["pink", "blush", "rose", "magenta", "fuchsia", "salmon", "hotpink"],
  purple: ["purple", "lilac", "lavender", "violet", "plum", "mauve", "eggplant", "aubergine"],
  yellow: ["yellow", "mustard", "gold", "golden", "lemon", "butter", "ochre"],
  orange: ["orange", "rust", "coral", "terracotta", "peach", "apricot", "tangerine", "amber"],
  multi: ["multi", "multicolor", "multicolored", "rainbow", "assorted"],
};
const COLOR_WORD_FAMILY = new Map(Object.entries(COLOR_FAMILIES).flatMap(([family, list]) => list.map(word => [word, family] as const)));
/** Family pairs a photo's lighting easily blurs together. */
const ADJACENT_COLOR_FAMILIES = new Set(["beige|brown", "white|beige", "red|pink", "purple|pink", "orange|red", "yellow|beige", "orange|brown", "black|blue", "black|gray", "white|gray"].flatMap(pair => [pair, pair.split("|").reverse().join("|")]));
const LIGHT_SHADES = new Set(["light", "pale", "bleached", "faded", "washed", "acid", "pastel", "baby", "powder", "ice", "icy"]);
const DARK_SHADES = new Set(["dark", "deep", "raw", "rinse", "midnight", "inky"]);

interface ColorReading { families: string[]; tokens: Set<string>; shade: "light" | "dark" | null }

export function readColor(value: string | undefined | null): ColorReading | null {
  if (unknownText(value)) return null;
  const list = words((value ?? "").replace(/off[\s-]?white/gi, "offwhite").replace(/hot[\s-]?pink/gi, "hotpink").replace(/multi[\s-]?colou?r(ed)?/gi, "multicolor"));
  const families: string[] = [];
  const tokens = new Set<string>();
  let shade: ColorReading["shade"] = null;
  for (const word of list) {
    const family = COLOR_WORD_FAMILY.get(word);
    if (family) { tokens.add(word); if (!families.includes(family)) families.push(family); }
    if (LIGHT_SHADES.has(word)) shade = "light";
    else if (DARK_SHADES.has(word)) shade = "dark";
  }
  // Denim wording names a blue without saying so: "light wash", "mid-wash", "raw denim".
  if (list.includes("wash") && !families.includes("blue")) { families.push("blue"); tokens.add("blue"); }
  return families.length ? { families, tokens, shade } : null;
}

type ColorAgreement = "exact" | "family" | "shade-conflict" | "adjacent" | "conflict" | "unknown";

export function compareColors(detected: string | undefined, stored: string | undefined): ColorAgreement {
  const a = readColor(detected), b = readColor(stored);
  if (!a || !b) return "unknown";
  const [primaryA] = a.families, [primaryB] = b.families;
  if (primaryA === primaryB) {
    if (a.shade && b.shade && a.shade !== b.shade) return "shade-conflict";
    const shared = [...a.tokens].some(token => b.tokens.has(token));
    return shared ? "exact" : "family";
  }
  // "Navy and white stripe" against "white": the colors overlap even if they lead differently.
  if (a.families.includes(primaryB) || b.families.includes(primaryA)) return "family";
  if (ADJACENT_COLOR_FAMILIES.has(`${primaryA}|${primaryB}`)) return "adjacent";
  return "conflict";
}

// ---------------------------------------------------------------------------------------------
// Pattern and material

const PATTERN_GROUPS: Array<[string, string[]]> = [
  ["solid", ["solid", "plain", "none", "no", "uniform", "block"]],
  ["texture", ["ribbed", "rib", "textured", "cable", "waffle", "knit", "quilted", "corduroy", "twill", "heathered", "marled", "melange", "distressed", "ripped", "faded", "washed"]],
  ["stripe", ["stripe", "striped", "stripes", "pinstripe", "breton", "pinstriped"]],
  ["check", ["plaid", "check", "checked", "checkered", "tartan", "gingham", "houndstooth", "windowpane", "flannel"]],
  ["floral", ["floral", "flower", "flowers", "botanical", "paisley"]],
  ["graphic", ["graphic", "print", "printed", "logo", "text", "lettering", "slogan", "image"]],
  ["camo", ["camo", "camouflage"]],
  ["dots", ["polka", "dot", "dots", "dotted", "spotted"]],
  ["animal", ["animal", "leopard", "zebra", "snake", "snakeskin", "cheetah", "tiger"]],
  ["colorblock", ["colorblock", "colourblock", "panelled", "paneled", "contrast"]],
];

function patternGroup(value: string | undefined | null) {
  // The detector answers "none" for a piece with no pattern, which is a plain piece, not an unknown one.
  if (/^\s*(none|no pattern)\s*$/i.test(value ?? "")) return "solid";
  if (unknownText(value)) return null;
  const list = words(value);
  // A named pattern outranks a texture word: "ribbed stripe" is a stripe.
  for (const [group, names] of PATTERN_GROUPS) if (group !== "solid" && group !== "texture" && list.some(word => names.includes(word))) return group;
  for (const [group, names] of PATTERN_GROUPS) if (list.some(word => names.includes(word))) return group;
  return null;
}

type PlainAgreement = "match" | "near" | "conflict" | "unknown";

export function comparePatterns(detected: string | undefined, stored: string | undefined): PlainAgreement {
  const a = patternGroup(detected), b = patternGroup(stored);
  if (!a || !b) return "unknown";
  if (a === b) return "match";
  // A rib or a wash is still a plain piece to most people.
  if ((a === "solid" && b === "texture") || (a === "texture" && b === "solid")) return "near";
  return "conflict";
}

const MATERIAL_GROUPS: Array<[string, string[]]> = [
  ["denim", ["denim", "jean", "jeans", "chambray"]],
  ["leather", ["leather", "suede", "nubuck", "patent", "pleather", "vegan"]],
  ["wool", ["wool", "merino", "cashmere", "alpaca", "mohair", "lambswool", "tweed", "knit", "acrylic"]],
  ["fleece", ["fleece", "sweat", "terry", "french", "sherpa"]],
  ["cotton", ["cotton", "jersey", "poplin", "oxford", "twill", "canvas", "pique", "flannel", "corduroy"]],
  ["linen", ["linen", "hemp"]],
  ["silk", ["silk", "satin", "chiffon"]],
  ["synthetic", ["polyester", "nylon", "spandex", "elastane", "rayon", "viscose", "synthetic", "mesh", "technical", "performance", "gore", "tex"]],
  ["rubber", ["rubber", "foam", "eva"]],
  ["metal", ["metal", "steel", "gold", "silver", "brass", "titanium"]],
];

function materialGroups(value: string | undefined | null) {
  if (unknownText(value)) return [];
  const list = words(value);
  return MATERIAL_GROUPS.filter(([, names]) => list.some(word => names.includes(word))).map(([group]) => group);
}

export function compareMaterials(detected: string | undefined, stored: string | undefined): PlainAgreement {
  const a = materialGroups(detected), b = materialGroups(stored);
  if (!a.length || !b.length) return "unknown";
  // Blends are normal: "cotton blend jersey" and "cotton" agree.
  return a.some(group => b.includes(group)) ? "match" : "conflict";
}

// ---------------------------------------------------------------------------------------------
// Type

/** Subtypes close enough that a detector can easily say one for the other. */
const SUBTYPE_FAMILIES: string[][] = [
  ["sneakers", "low-top-sneakers", "high-top-sneakers", "running-shoes", "basketball-shoes", "skate-shoes", "slip-on-sneakers"],
  ["boots", "ankle-boots", "chelsea-boots", "work-boots", "hiking-boots"],
  ["dress-shoes", "oxfords", "derbies", "loafers"],
  ["sandals", "slides"],
  ["flats", "mules", "loafers"],
  ["t-shirt", "tank-top"],
  ["sweater", "cardigan"],
  ["hoodie", "sweatshirt"],
  ["dress-shirt", "casual-shirt", "blouse"],
  ["polo", "t-shirt"],
  ["chinos", "casual-pants", "dress-pants"],
  ["sweatpants", "leggings", "casual-pants"],
  ["blazer", "suit-jacket"],
  ["bomber-jacket", "rain-jacket", "puffer-jacket", "denim-jacket", "leather-jacket"],
  ["casual-dress", "maxi-dress", "midi-dress", "mini-dress", "wrap-dress", "shirt-dress", "formal-dress"],
  ["jumpsuit", "romper"],
  ["hat", "beanie"],
  ["crossbody", "shoulder-bag", "handbag", "clutch"],
  ["tote", "shoulder-bag", "handbag"],
  ["backpack", "duffel"],
];
/** A broad subtype and the narrower ones it covers. */
const SUBTYPE_PARENTS: Record<string, string[]> = {
  sneakers: SUBTYPE_FAMILIES[0].slice(1),
  boots: SUBTYPE_FAMILIES[1].slice(1),
  "dress-shoes": ["oxfords", "derbies"],
};

/** Words in a name that name a type, for pieces saved without one. Checked in order. */
const NAME_SUBTYPE_HINTS: Array<[GarmentCategory, RegExp, string]> = [
  ["bottom", /\bjeans?\b|\bdenim\b/, "jeans"],
  ["bottom", /\bchinos?\b/, "chinos"],
  ["bottom", /\b(sweatpants?|joggers?|track ?pants?)\b/, "sweatpants"],
  ["bottom", /\bleggings?\b/, "leggings"],
  ["bottom", /\bshorts?\b/, "shorts"],
  ["bottom", /\bskirts?\b/, "skirt"],
  ["bottom", /\b(trousers?|pants?|slacks)\b/, "casual-pants"],
  ["top", /\bhood(ie|y)\b/, "hoodie"],
  ["top", /\b(sweatshirt|crew ?neck sweat)\b/, "sweatshirt"],
  ["top", /\bcardigan\b/, "cardigan"],
  ["top", /\b(sweater|jumper|pullover)\b/, "sweater"],
  ["top", /\bpolo\b/, "polo"],
  ["top", /\b(tank|camisole|cami)\b/, "tank-top"],
  ["top", /\bblouse\b/, "blouse"],
  ["top", /\b(t-?shirt|tee)\b/, "t-shirt"],
  ["top", /\b(shirt|button[- ]?down|oxford|flannel|overshirt)\b/, "casual-shirt"],
  ["outerwear", /\bblazer\b/, "blazer"],
  ["outerwear", /\bbomber\b/, "bomber-jacket"],
  ["outerwear", /\bpuffer\b|\bdown jacket\b/, "puffer-jacket"],
  ["outerwear", /\b(denim|jean) jacket\b|\btrucker\b/, "denim-jacket"],
  ["outerwear", /\bleather jacket\b|\bbiker\b/, "leather-jacket"],
  ["outerwear", /\b(rain ?coat|rain jacket|shell|anorak)\b/, "rain-jacket"],
  ["outerwear", /\b(overcoat|trench|topcoat|peacoat|coat)\b/, "overcoat"],
  ["outerwear", /\b(vest|gilet)\b/, "vest"],
  ["shoe", /\bchelsea\b/, "chelsea-boots"],
  ["shoe", /\bboots?\b|\btimbs?\b/, "boots"],
  ["shoe", /\b(sneakers?|trainers?|kicks)\b/, "sneakers"],
  ["shoe", /\bloafers?\b/, "loafers"],
  ["shoe", /\boxfords?\b/, "oxfords"],
  ["shoe", /\bderb(y|ies)\b/, "derbies"],
  ["shoe", /\bslides?\b/, "slides"],
  ["shoe", /\bsandals?\b/, "sandals"],
  ["shoe", /\bheels?\b|\bpumps?\b/, "heels"],
  ["shoe", /\bflats?\b/, "flats"],
  ["accessory", /\bbeanie\b/, "beanie"],
  ["accessory", /\b(hat|cap)\b/, "hat"],
  ["accessory", /\bbelt\b/, "belt"],
  ["accessory", /\bscarf\b/, "scarf"],
  ["accessory", /\bsunglasses\b/, "sunglasses"],
  ["jewelry", /\bwatch\b/, "watch"],
];

function specificSubtype(value: string | undefined | null) {
  const cleaned = (value ?? "").trim().toLowerCase();
  return cleaned && !cleaned.startsWith("other-") ? cleaned : null;
}

/** The stored subtype, or one read from the piece's own name or type words when none was saved. */
export function closetSubtype(item: Pick<WardrobeItem, "subtype" | "name" | "customType">, category: GarmentCategory) {
  const stored = specificSubtype(item.subtype);
  if (stored) return { subtype: stored, fromName: false };
  const text = `${item.customType ?? ""} ${item.name ?? ""}`.toLowerCase();
  const hint = NAME_SUBTYPE_HINTS.find(([hintCategory, pattern]) => hintCategory === category && pattern.test(text));
  return hint ? { subtype: hint[2], fromName: true } : { subtype: null, fromName: false };
}

type SubtypeAgreement = "exact" | "parent" | "family" | "conflict" | "unknown";

export function compareSubtypes(detected: string | null, stored: string | null): SubtypeAgreement {
  if (!detected || !stored) return "unknown";
  if (detected === stored) return "exact";
  if (SUBTYPE_PARENTS[detected]?.includes(stored) || SUBTYPE_PARENTS[stored]?.includes(detected)) return "parent";
  if (SUBTYPE_FAMILIES.some(family => family.includes(detected) && family.includes(stored))) return "family";
  return "conflict";
}

/** Hoodies and cardigans are often filed as outerwear, and light jackets as tops. */
function categoriesAdjacent(a: GarmentCategory, b: GarmentCategory) {
  return (a === "top" && b === "outerwear") || (a === "outerwear" && b === "top");
}

// ---------------------------------------------------------------------------------------------
// Scoring

const COLOR_WORDS = new Set([...COLOR_WORD_FAMILY.keys(), ...LIGHT_SHADES, ...DARK_SHADES, "wash"]);

function nameKeywords(value: string | undefined | null) {
  return new Set(words(value).filter(word => word.length >= 4 && !STOP_WORDS.has(word) && !COLOR_WORDS.has(word)).map(word => word.replace(/(es|s)$/, "")));
}

export function scoreCandidate(detection: DetectedPiece, item: WardrobeItem): { score: number; reasons: string[]; eligibleForStrong: boolean } | null {
  const detectedCategory = normalizeGarmentCategory(detection.category);
  const storedCategory = normalizeGarmentCategory(String(item.category ?? ""));
  if (detectedCategory === "unknown" || storedCategory === "unknown") return null;
  const sameCategory = detectedCategory === storedCategory;
  if (!sameCategory && !categoriesAdjacent(detectedCategory, storedCategory)) return null;

  let score = sameCategory ? 0 : -20;
  const reasons: string[] = [];
  if (!sameCategory) reasons.push(`Saved as ${storedCategory}`);
  let detailsCompared = 0;

  const stored = closetSubtype(item, storedCategory);
  const subtype = compareSubtypes(specificSubtype(detection.subtype), stored.subtype);
  if (subtype !== "unknown") detailsCompared++;
  if (subtype === "exact") { score += 40; reasons.push("Same type"); }
  else if (subtype === "parent") { score += 30; reasons.push("Same type"); }
  else if (subtype === "family") { score += 15; reasons.push("Similar type"); }
  else if (subtype === "conflict") { score -= 30; reasons.push("Different type"); }

  const color = compareColors(detection.color, item.color);
  // Black for white, or red for green, is a different piece: never offered, however close the rest.
  if (color === "conflict") return null;
  if (color !== "unknown") detailsCompared++;
  if (color === "exact") { score += 30; reasons.push("Same color"); }
  else if (color === "family") { score += 18; reasons.push("Similar color"); }
  else if (color === "shade-conflict") { score += 5; reasons.push("Lighter or darker"); }
  else if (color === "adjacent") { score += 5; reasons.push("Close color"); }

  const pattern = comparePatterns(detection.pattern, item.pattern);
  if (pattern !== "unknown") detailsCompared++;
  if (pattern === "match") { score += 10; if (patternGroup(item.pattern) !== "solid") reasons.push("Same pattern"); }
  else if (pattern === "conflict") { score -= 15; reasons.push("Different pattern"); }

  const material = compareMaterials(detection.material, item.material);
  if (material !== "unknown") detailsCompared++;
  if (material === "match") score += 8;
  else if (material === "conflict") score -= 8;

  // Shared garment words, such as "henley" or "chore", when the type itself is broad.
  const detectedWords = nameKeywords(detection.name), storedWords = nameKeywords(`${item.name} ${item.customType ?? ""}`);
  if ([...detectedWords].some(word => storedWords.has(word))) { score += subtype === "exact" ? 4 : 12; if (subtype !== "exact") reasons.push("Similar name"); }

  // A piece filed under the neighbouring category needs real agreement before it is offered.
  if (!sameCategory && (subtype === "conflict" || score < 10)) return null;
  if (detailsCompared <= 1) reasons.push("Few details saved");
  const eligibleForStrong = sameCategory
    && (subtype === "exact" || subtype === "parent" || (subtype === "unknown" && detectedWords.size > 0 && [...detectedWords].some(word => storedWords.has(word))))
    && (color === "exact" || color === "family")
    && pattern !== "conflict";
  return { score, reasons: [...new Set(reasons)], eligibleForStrong };
}

interface Ranked { detection: DetectedPiece; category: GarmentCategory; ranked: Array<{ item: WardrobeItem; score: number; reasons: string[]; eligibleForStrong: boolean }> }

function rank(detection: DetectedPiece, closet: WardrobeItem[]): Ranked {
  const category = normalizeGarmentCategory(detection.category);
  const ranked = closet
    .map(item => ({ item, result: scoreCandidate(detection, item) }))
    .filter((entry): entry is { item: WardrobeItem; result: NonNullable<ReturnType<typeof scoreCandidate>> } => entry.result !== null && entry.result.score >= POSSIBLE_FLOOR)
    .map(({ item, result }) => ({ item, ...result }))
    // Ties keep the closet's own order, so the result never depends on sort stability alone.
    .sort((a, b) => b.score - a.score || closet.indexOf(a.item) - closet.indexOf(b.item));
  return { detection, category, ranked };
}

function isStrong(entry: Ranked) {
  const [best, next] = entry.ranked;
  if (!best || !best.eligibleForStrong || best.score < STRONG_SCORE) return false;
  if ((entry.detection.confidence ?? 0) < MIN_DETECTOR_CONFIDENCE) return false;
  return !next || best.score - next.score >= STRONG_MARGIN;
}

/**
 * Suggestions for every detected piece, in the detector's order. Each closet piece is preselected
 * at most once across the whole outfit, the strongest claim first, and no more than ten are
 * preselected, the wear route's limit.
 */
export function matchWearPhoto(detections: DetectedPiece[], closet: WardrobeItem[]): WearPhotoSuggestion[] {
  const rankings = detections.map(detection => rank(detection, closet));
  const claims = rankings
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => isStrong(entry))
    .sort((a, b) => b.entry.ranked[0].score - a.entry.ranked[0].score || a.index - b.index);
  const claimedBy = new Map<string, number>();
  const preselected = new Map<number, string>();
  for (const { entry, index } of claims) {
    const itemId = entry.ranked[0].item.id;
    if (claimedBy.has(itemId) || preselected.size >= MAX_WEAR_PIECES) continue;
    claimedBy.set(itemId, index);
    preselected.set(index, itemId);
  }

  return rankings.map((entry, index): WearPhotoSuggestion => {
    const candidates = entry.ranked.slice(0, MAX_CANDIDATES).map(candidate => ({
      itemId: candidate.item.id,
      score: candidate.score,
      strength: (preselected.get(index) === candidate.item.id ? "strong" : "possible") as MatchStrength,
      reasons: candidate.reasons,
    }));
    const base = { detectionId: entry.detection.id, detectedName: entry.detection.name, category: entry.category, candidates };
    if (entry.category === "unknown") return { ...base, candidates: [], preselectedItemId: null, status: "unrecognized" };
    const chosen = preselected.get(index);
    if (chosen) return { ...base, preselectedItemId: chosen, status: "matched" };
    if (!candidates.length) return { ...base, preselectedItemId: null, status: "no-match" };
    const best = entry.ranked[0].item;
    const owner = claimedBy.get(best.id);
    if (owner !== undefined && owner !== index) {
      // Two single shoes and one stored pair: the second shoe is the same wardrobe unit.
      const otherShoe = entry.category === "shoe" && rankings[owner].category === "shoe" && best.wearableUnit === "pair";
      return { ...base, preselectedItemId: null, status: otherShoe ? "other-shoe" : "already-matched" };
    }
    return { ...base, preselectedItemId: null, status: "choose" };
  });
}
