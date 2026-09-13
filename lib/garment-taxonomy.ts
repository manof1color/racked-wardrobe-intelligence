import { SHOE_KNOWLEDGE, shoeKnowledgeForSubtype } from "./shoe-knowledge.ts";

export const GARMENT_TAXONOMY = {
  top: ["t-shirt", "polo", "dress-shirt", "casual-shirt", "blouse", "hoodie", "sweatshirt", "sweater", "cardigan", "tank-top", "other-top"],
  bottom: ["jeans", "chinos", "dress-pants", "casual-pants", "shorts", "sweatpants", "leggings", "skirt", "other-bottom"],
  outerwear: ["blazer", "suit-jacket", "bomber-jacket", "denim-jacket", "leather-jacket", "puffer-jacket", "overcoat", "rain-jacket", "vest", "other-outerwear"],
  shoe: ["sneakers", "low-top-sneakers", "high-top-sneakers", "running-shoes", "basketball-shoes", "skate-shoes", "slip-on-sneakers", "dress-shoes", "oxfords", "derbies", "loafers", "boots", "ankle-boots", "chelsea-boots", "work-boots", "hiking-boots", "sandals", "slides", "heels", "flats", "mules", "clogs", "other-shoes"],
  dress: ["casual-dress", "formal-dress", "maxi-dress", "midi-dress", "mini-dress", "shirt-dress", "wrap-dress", "jumpsuit", "romper", "other-dress"],
  bag: ["tote", "backpack", "crossbody", "shoulder-bag", "handbag", "clutch", "duffel", "briefcase", "other-bag"],
  jewelry: ["ring", "necklace", "bracelet", "earrings", "watch", "brooch", "anklet", "other-jewelry"],
  accessory: ["belt", "hat", "beanie", "scarf", "gloves", "sunglasses", "tie", "pocket-square", "other-accessory"],
  unknown: ["other-garment"],
} as const;

export type GarmentCategory = keyof typeof GARMENT_TAXONOMY;
export type GarmentSubtype = (typeof GARMENT_TAXONOMY)[GarmentCategory][number];

export interface GarmentHypothesis {
  category: GarmentCategory;
  subtype: GarmentSubtype;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    category: GarmentCategory;
    subtype: GarmentSubtype;
    confidence: number;
    reason: string;
  }>;
}

const categoryAliases: Array<[GarmentCategory, string[]]> = [
  ["shoe", ["shoe", "sneaker", "boot", "sandal", "heel", "loafer", "footwear", "trainer"]],
  ["outerwear", ["outerwear", "jacket", "coat", "blazer", "parka", "overshirt", "vest"]],
  ["top", ["top", "shirt", "tee", "t-shirt", "sweater", "hoodie", "sweatshirt", "blouse", "knit", "polo", "cardigan"]],
  ["bottom", ["bottom", "pant", "trouser", "jean", "short", "skirt", "legging", "chino", "sweatpant"]],
  ["dress", ["dress", "gown", "jumpsuit", "romper"]],
  ["bag", ["bag", "backpack", "tote", "purse", "handbag", "clutch", "duffel", "briefcase"]],
  ["jewelry", ["jewelry", "jewellery", "ring", "necklace", "bracelet", "earring", "watch", "brooch", "anklet"]],
  ["accessory", ["accessory", "hat", "cap", "scarf", "belt", "glove", "sunglass", "beanie", "tie"]],
];

const subtypeAliases: Partial<Record<GarmentSubtype, string[]>> = {
  "t-shirt": ["t-shirt", "tshirt", "tee"],
  "dress-shirt": ["dress shirt", "formal shirt"],
  "casual-shirt": ["casual shirt", "button-down", "button down", "overshirt"],
  "tank-top": ["tank top", "tank", "camisole"],
  "dress-pants": ["dress pants", "formal trousers"],
  "casual-pants": ["casual pants", "trousers"],
  "bomber-jacket": ["bomber jacket", "bomber"],
  "denim-jacket": ["denim jacket", "jean jacket"],
  "leather-jacket": ["leather jacket"],
  "puffer-jacket": ["puffer jacket", "puffer"],
  "rain-jacket": ["rain jacket", "raincoat"],
  ...Object.fromEntries(SHOE_KNOWLEDGE.map((entry)=>[entry.subtype,[...entry.aliases]])),
  "shoulder-bag": ["shoulder bag"],
  "pocket-square": ["pocket square"],
};

function displayWords(value:string) {
  return value.replace(/[_]+/g," ").replace(/\s+/g," ").trim();
}

function titleCase(value:string) {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g,(_,boundary:string,letter:string)=>`${boundary}${letter.toUpperCase()}`);
}

export function garmentSubtypeLabel(subtype:GarmentSubtype,wearableUnit:"single"|"pair"="pair") {
  const shoe=SHOE_KNOWLEDGE.find((entry)=>entry.subtype===subtype);
  if(shoe)return wearableUnit==="single"?shoe.singularLabel:shoe.label;
  return titleCase(displayWords(subtype.replace(/-/g," ")));
}

function usefulColor(value:string|undefined) {
  const cleaned=displayWords(value??"");
  return /^(|unknown|unconfirmed|n\/a|none)$/i.test(cleaned)?"":cleaned;
}

/**
 * Normalizes provider-authored names only. Manual names never pass through this helper.
 * Footwear labels respect whether the photo shows one unmatched shoe or one wearable pair.
 */
export function autoGarmentDisplayName(input:{name?:string;category:GarmentCategory;subtype:GarmentSubtype;color?:string;wearableUnit?:"single"|"pair"}) {
  const raw=displayWords(input.name??"").replace(/^(?:an?\s+|one\s+|pair\s+of\s+)/i,"").trim();
  const color=usefulColor(input.color);
  if(input.category==="shoe") {
    const entry=shoeKnowledgeForSubtype(input.subtype);
    const noun=garmentSubtypeLabel(input.subtype,input.wearableUnit==="single"?"single":"pair");
    const normalized=raw.toLowerCase().replace(/-/g," ");
    const aliases=[entry.label,entry.singularLabel,...entry.aliases,input.subtype].map(value=>value.toLowerCase().replace(/-/g," "));
    const colorPrefix=color.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const withoutColor=color?normalized.replace(new RegExp(`^${colorPrefix}\\s+`),""):normalized;
    if(!raw||/^(unknown|unconfirmed|footwear|shoe|shoes)$/i.test(raw)||aliases.includes(normalized)||aliases.includes(withoutColor)) {
      return titleCase([color,noun].filter(Boolean).join(" "));
    }
  }
  const subtypeLabel=displayWords(input.subtype.replace(/-/g," "));
  if(!raw||/^(unknown|unconfirmed|garment|clothing|apparel|piece)$/i.test(raw)||raw.toLowerCase().replace(/-/g," ")===subtypeLabel) {
    return titleCase([color,subtypeLabel].filter(Boolean).join(" "))||"Unrecognized Piece";
  }
  return titleCase(raw);
}

function normalizedWords(value: string) {
  return value.trim().toLowerCase().replace(/[_/]+/g, "-").replace(/\s+/g, " ");
}

export function normalizeGarmentCategory(value: string): GarmentCategory {
  const cleaned = normalizedWords(value);
  for (const [category, words] of categoryAliases) {
    if (words.some((word) => cleaned === word || cleaned.includes(word))) return category;
  }
  return Object.prototype.hasOwnProperty.call(GARMENT_TAXONOMY, cleaned) ? cleaned as GarmentCategory : "unknown";
}

export function subtypeForCategory(category: GarmentCategory, value: string): GarmentSubtype {
  const cleaned = normalizedWords(value).replace(/ /g, "-");
  for (const subtype of GARMENT_TAXONOMY[category]) {
    if (cleaned === subtype) return subtype;
    const aliases = subtypeAliases[subtype as GarmentSubtype] ?? [];
    if (aliases.some((alias) => normalizedWords(value) === alias)) return subtype;
  }
  return GARMENT_TAXONOMY[category].at(-1) as GarmentSubtype;
}

export function normalizeGarmentClassification(categoryValue: string, subtypeValue: string) {
  const category = normalizeGarmentCategory(categoryValue || subtypeValue);
  return { category, subtype: subtypeForCategory(category, subtypeValue) };
}

export function cleanHypothesis(value: unknown): GarmentHypothesis | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.category !== "string" || typeof candidate.subtype !== "string") return null;
  const primary = normalizeGarmentClassification(candidate.category, candidate.subtype);
  const alternatives = (Array.isArray(candidate.alternatives) ? candidate.alternatives : [])
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .slice(0, 3)
    .map((entry) => {
      const normalized = normalizeGarmentClassification(String(entry.category ?? ""), String(entry.subtype ?? ""));
      return {
        ...normalized,
        confidence: Math.max(0, Math.min(95, Math.round(Number(entry.confidence) || 0))),
        reason: String(entry.reason ?? "Alternative visible interpretation").trim().slice(0, 200),
      };
    })
    .filter((entry) => entry.category !== primary.category || entry.subtype !== primary.subtype);
  return {
    ...primary,
    confidence: Math.max(0, Math.min(95, Math.round(Number(candidate.confidence) || 0))),
    reasoning: String(candidate.reasoning ?? "").trim().slice(0, 300),
    alternatives,
  };
}

/** Every phrase that names a subtype: its canonical id, its display labels, and its aliases. */
function subtypePhrases(subtype: GarmentSubtype) {
  const phrases = [
    subtype.replace(/-/g, " "),
    garmentSubtypeLabel(subtype, "pair"),
    garmentSubtypeLabel(subtype, "single"),
    ...(subtypeAliases[subtype] ?? []),
  ];
  return [...new Set(phrases.map((phrase) => normalizedWords(phrase).replace(/-/g, " ")))].filter(Boolean);
}

function isFallbackSubtype(subtype: string) {
  return subtype.startsWith("other-");
}

export interface TypedGarmentType {
  category: GarmentCategory;
  subtype: GarmentSubtype;
  /** The person's own words, kept only when no controlled subtype fits them. */
  customType: string | null;
}

/**
 * Resolves what a person typed into the Type field.
 *
 * AI recognition fills Type from a controlled list, but it will not always know: a
 * garment the model could not classify, or one Racked has no subtype for. The person must
 * then be able to type what it is. Their words map onto the controlled taxonomy where they
 * fit, because outfit ranking and Community filters depend on it; where they do not fit,
 * the subtype falls back to the category's "other" entry and their words are kept verbatim
 * rather than silently discarded.
 *
 * A phrase is matched exactly first, then by the longest known phrase contained in it as
 * whole words — so "white high top sneakers" resolves to high-top sneakers, not to plain
 * sneakers. When the category is still unknown, the typed words may settle it.
 */
export function resolveTypedGarmentType(category: GarmentCategory, typed: string): TypedGarmentType | null {
  const text = normalizedWords(typed).replace(/-/g, " ").slice(0, 60).trim();
  if (!text) return null;

  const resolvedCategory = category === "unknown" ? normalizeGarmentCategory(text) : category;
  const candidates = GARMENT_TAXONOMY[resolvedCategory] as readonly GarmentSubtype[];

  for (const subtype of candidates) {
    if (subtypePhrases(subtype).includes(text)) return { category: resolvedCategory, subtype, customType: null };
  }

  let best: { subtype: GarmentSubtype; length: number } | null = null;
  for (const subtype of candidates) {
    if (isFallbackSubtype(subtype)) continue;
    for (const phrase of subtypePhrases(subtype)) {
      const pattern = new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
      if (pattern.test(text) && (!best || phrase.length > best.length)) best = { subtype, length: phrase.length };
    }
  }
  if (best) return { category: resolvedCategory, subtype: best.subtype, customType: null };

  const fallback = candidates.find(isFallbackSubtype) ?? candidates[candidates.length - 1];
  return { category: resolvedCategory, subtype: fallback, customType: titleCase(typed.trim().replace(/\s+/g, " ").slice(0, 60)) };
}

/** Suggestions for the Type field: display labels for every subtype in a category. */
export function garmentTypeSuggestions(category: GarmentCategory, wearableUnit: "single" | "pair" = "pair") {
  return (GARMENT_TAXONOMY[category] as readonly GarmentSubtype[]).map((subtype) => ({ subtype, label: garmentSubtypeLabel(subtype, wearableUnit) }));
}

export function garmentTaxonomyPrompt() {
  return Object.entries(GARMENT_TAXONOMY)
    .map(([category, subtypes]) => `${category}: ${subtypes.join(", ")}`)
    .join("; ");
}
