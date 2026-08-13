export const GARMENT_TAXONOMY = {
  top: ["t-shirt", "polo", "dress-shirt", "casual-shirt", "blouse", "hoodie", "sweatshirt", "sweater", "cardigan", "tank-top", "other-top"],
  bottom: ["jeans", "chinos", "dress-pants", "casual-pants", "shorts", "sweatpants", "leggings", "skirt", "other-bottom"],
  outerwear: ["blazer", "suit-jacket", "bomber-jacket", "denim-jacket", "leather-jacket", "puffer-jacket", "overcoat", "rain-jacket", "vest", "other-outerwear"],
  shoe: ["sneakers", "running-shoes", "dress-shoes", "loafers", "boots", "sandals", "heels", "other-shoes"],
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
  "running-shoes": ["running shoes", "running shoe", "trainers"],
  "dress-shoes": ["dress shoes", "dress shoe", "oxford", "derby"],
  "shoulder-bag": ["shoulder bag"],
  "pocket-square": ["pocket square"],
};

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

export function garmentTaxonomyPrompt() {
  return Object.entries(GARMENT_TAXONOMY)
    .map(([category, subtypes]) => `${category}: ${subtypes.join(", ")}`)
    .join("; ");
}
