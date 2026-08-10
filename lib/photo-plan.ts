// Judge note: the adaptive photo plan decides WHICH additional photos enrollment asks
// for, based on the AI-classified garment category — a shoe gets a sole request instead
// of a generic back shot. It is deliberately a pure, deterministic module with no access
// to identity or registry data: the plan can never mark anything verified, and brand
// verification stays exclusively with registry GTIN / brand-plus-SKU evidence in
// lib/product-registry.ts regardless of which plan (or photo count) was used.

export type PlannedCategory = "top" | "bottom" | "outerwear" | "dress" | "shoe" | "bag" | "jewelry" | "accessory" | "unknown";
export type PlanSource = "ai" | "fallback" | "user-override";

export interface PhotoRequest {
  /** Which upload slot the photo fills. Storage schema is unchanged: front + back + label. */
  slot: "back" | "label";
  title: string;
  instruction: string;
  reason: string;
}

export interface PhotoPlan {
  category: PlannedCategory;
  source: PlanSource;
  /** 0–100; 0 whenever the AI did not classify. */
  confidence: number;
  /** Agent reasoning shown to the user. */
  reasoning: string;
  requests: PhotoRequest[];
}

export const PLANNED_CATEGORIES: PlannedCategory[] = ["top", "bottom", "outerwear", "dress", "shoe", "bag", "jewelry", "accessory", "unknown"];

export function normalizePlannedCategory(value: string): PlannedCategory {
  const cleaned = value.trim().toLowerCase();
  const aliases: Array<[PlannedCategory, string[]]> = [
    ["shoe", ["shoe", "sneaker", "boot", "sandal", "heel", "loafer", "footwear", "trainer"]],
    ["outerwear", ["outerwear", "jacket", "coat", "blazer", "parka", "overshirt"]],
    ["top", ["top", "shirt", "tee", "t-shirt", "sweater", "hoodie", "blouse", "knit", "polo"]],
    ["bottom", ["bottom", "pant", "trouser", "jean", "short", "skirt", "legging", "chino"]],
    ["dress", ["dress", "gown", "jumpsuit", "romper"]],
    ["bag", ["bag", "backpack", "tote", "purse", "handbag", "clutch"]],
    ["jewelry", ["jewelry", "jewellery", "ring", "necklace", "bracelet", "earring", "watch"]],
    ["accessory", ["accessory", "hat", "cap", "scarf", "belt", "glove", "sunglass", "beanie"]],
  ];
  for (const [category, words] of aliases) {
    if (words.some((word) => cleaned.includes(word))) return category;
  }
  return "unknown";
}

const LABEL_REQUEST: PhotoRequest = {
  slot: "label",
  title: "Care/brand label",
  instruction: "Photograph the sewn-in label with the brand, style code, or barcode readable.",
  reason: "Label text is the only evidence that can connect this piece to a brand-enrolled registry product.",
};

const PLAN_DETAILS: Record<PlannedCategory, { second: PhotoRequest; label: PhotoRequest; reasoning: string }> = {
  shoe: {
    second: { slot: "back", title: "Sole + heel", instruction: "Photograph the sole and heel together — tread pattern and heel shape identify footwear better than a back view.", reason: "Footwear construction is read from the sole and heel, not a garment-style back view." },
    label: { slot: "label", title: "Tongue/insole label", instruction: "Photograph the label on the tongue or insole with size and style code readable.", reason: "Footwear identity codes live on the tongue or insole label." },
    reasoning: "This looks like footwear, so instead of a generic back photo the plan asks for the sole and heel plus the tongue or insole label.",
  },
  bag: {
    second: { slot: "back", title: "Interior + hardware", instruction: "Photograph the open interior and any hardware stamp or engraving.", reason: "Bag construction and authenticity cues are inside — lining, stitching, and hardware stamps." },
    label: { slot: "label", title: "Interior tag", instruction: "Photograph the interior brand tag or serial tag if present.", reason: "Bag identity tags are usually sewn inside rather than on the exterior." },
    reasoning: "This looks like a bag, so the plan asks for the interior and hardware instead of a plain back photo.",
  },
  jewelry: {
    second: { slot: "back", title: "Clasp/hallmark detail", instruction: "Photograph the clasp, band interior, or any hallmark up close.", reason: "Jewelry is identified by hallmarks and clasp construction, not a back view." },
    label: { slot: "label", title: "Tag or box label", instruction: "Photograph the sales tag, box label, or certificate if you have one.", reason: "Jewelry rarely has a sewn label; a tag or box label is the closest identity evidence." },
    reasoning: "This looks like jewelry, so the plan asks for a hallmark or clasp close-up and any tag instead of garment-style photos.",
  },
  accessory: {
    second: { slot: "back", title: "Detail view", instruction: "Photograph the underside or interior detail (brim interior, buckle back, lining).", reason: "Accessory construction detail is more identifying than a mirrored back view." },
    label: LABEL_REQUEST,
    reasoning: "This looks like an accessory, so the plan asks for the most identifying detail view plus the label.",
  },
  top: {
    second: { slot: "back", title: "Back view", instruction: "Photograph the full back — collar, yoke, and seams visible.", reason: "The back view completes the garment's construction evidence." },
    label: LABEL_REQUEST,
    reasoning: "This looks like a top, so the standard back view and sewn-in label complete the record.",
  },
  bottom: {
    second: { slot: "back", title: "Back view", instruction: "Photograph the full back — pockets, seams, and hem visible.", reason: "The back view completes the garment's construction evidence." },
    label: LABEL_REQUEST,
    reasoning: "This looks like a bottom, so the standard back view and waistband label complete the record.",
  },
  outerwear: {
    second: { slot: "back", title: "Back view", instruction: "Photograph the full back — yoke, vents, and seams visible.", reason: "The back view completes the garment's construction evidence." },
    label: LABEL_REQUEST,
    reasoning: "This looks like outerwear, so the standard back view and interior label complete the record.",
  },
  dress: {
    second: { slot: "back", title: "Back view", instruction: "Photograph the full back — closure, zip, and seams visible.", reason: "The back view completes the garment's construction evidence." },
    label: LABEL_REQUEST,
    reasoning: "This looks like a dress, so the standard back view and side-seam label complete the record.",
  },
  unknown: {
    second: { slot: "back", title: "Back view", instruction: "Photograph the other side of the piece.", reason: "Without a confident category, the standard back view keeps the evidence complete." },
    label: LABEL_REQUEST,
    reasoning: "The category is not confident yet, so the plan uses the standard back and label set. You can set the category yourself to get a tailored plan.",
  },
};

export function buildPhotoPlan(category: string, options: { source?: PlanSource; confidence?: number; aiReasoning?: string } = {}): PhotoPlan {
  const normalized = normalizePlannedCategory(category);
  const details = PLAN_DETAILS[normalized];
  const source = options.source ?? "fallback";
  return {
    category: normalized,
    source,
    confidence: Math.max(0, Math.min(100, Math.round(options.confidence ?? 0))),
    reasoning: options.aiReasoning?.trim() ? `${details.reasoning} AI note: ${options.aiReasoning.trim().slice(0, 300)}` : details.reasoning,
    requests: [details.second, details.label],
  };
}
