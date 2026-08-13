import { normalizeGarmentClassification, type GarmentCategory, type GarmentSubtype } from "./garment-taxonomy.ts";

export const SECOND_HAND_FASHION_DATASET = {
  name: "Clothing Dataset for Second-Hand Fashion",
  version: "3",
  recordUrl: "https://zenodo.org/records/13788681",
  doi: "10.5281/zenodo.13788681",
  itemCount: 31_638,
  goldSetCount: 100,
  license: "CC BY 4.0",
  views: ["front", "back", "label"] as const,
} as const;

export interface EvaluationTruth {
  category: GarmentCategory;
  subtype?: GarmentSubtype;
  brand?: string;
  color?: string;
  pattern?: string;
  material?: string;
}

export interface EvaluationCase {
  externalId: string;
  source: typeof SECOND_HAND_FASHION_DATASET.name;
  views: {
    front: string;
    back: string;
    label: string;
  };
  truth: EvaluationTruth;
}

export interface EvaluationPrediction {
  externalId: string;
  providerStatus: "ok" | "failed";
  category?: GarmentCategory;
  subtype?: GarmentSubtype;
  brandLabel?: string;
  confidence?: number;
  verified?: boolean;
  registryEvidence?: "gtin" | "brand-sku";
}

function textValue(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned : undefined;
}

function attributeValue(value: unknown) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ") || undefined;
  return textValue(value);
}

function brandValue(value: unknown) {
  const brand = textValue(value);
  if (!brand || /^(not applicable|n\/?a|none|unknown)$/i.test(brand)) return undefined;
  return brand;
}

function comparable(value: string | undefined) {
  return value?.normalize("NFKC").trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Converts the research dataset's human annotations into Racked's controlled
 * taxonomy. The dataset's `type` is the useful garment class; its `category`
 * can describe the intended wearer, so it is only a fallback.
 */
export function normalizeSecondHandAnnotation(annotation: Record<string, unknown>): EvaluationTruth {
  const garmentType = textValue(annotation.type) ?? textValue(annotation.garmentType) ?? textValue(annotation.category) ?? "unknown";
  const normalized = normalizeGarmentClassification(garmentType, garmentType);
  return {
    category: normalized.category,
    subtype: normalized.subtype.startsWith("other-") ? undefined : normalized.subtype,
    brand: brandValue(annotation.brand),
    color: attributeValue(annotation.colors) ?? textValue(annotation.color),
    pattern: textValue(annotation.pattern),
    material: textValue(annotation.material),
  };
}

function stableHash(value: string, seed: number) {
  let hash = (2_166_136_261 ^ seed) >>> 0;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}

/** Produces a reproducible sample without depending on source-file ordering. */
export function deterministicEvaluationSample(cases: EvaluationCase[], size: number, seed = 20260813) {
  const boundedSize = Math.max(0, Math.min(cases.length, Math.floor(size)));
  return [...cases]
    .sort((left, right) => stableHash(left.externalId, seed) - stableHash(right.externalId, seed) || left.externalId.localeCompare(right.externalId))
    .slice(0, boundedSize);
}

function rate(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

/**
 * Scores only fields for which the research dataset supplies ground truth.
 * Dataset brand text can evaluate OCR/autofill, but can never serve as the
 * registry evidence required for verified product identity.
 */
export function scoreGarmentEvaluation(cases: EvaluationCase[], predictions: EvaluationPrediction[]) {
  const predictionsById = new Map(predictions.map((prediction) => [prediction.externalId, prediction]));
  let completed = 0;
  let providerFailures = 0;
  let categoryCorrect = 0;
  let subtypeCorrect = 0;
  let subtypeEligible = 0;
  let brandEligible = 0;
  let brandCorrect = 0;
  let identityBoundaryViolations = 0;

  for (const evaluationCase of cases) {
    const prediction = predictionsById.get(evaluationCase.externalId);
    if (!prediction || prediction.providerStatus === "failed") {
      providerFailures += 1;
      continue;
    }
    completed += 1;
    if (prediction.category === evaluationCase.truth.category) categoryCorrect += 1;
    if (evaluationCase.truth.subtype) {
      subtypeEligible += 1;
      if (prediction.subtype === evaluationCase.truth.subtype) subtypeCorrect += 1;
    }
    if (evaluationCase.truth.brand) {
      brandEligible += 1;
      if (comparable(prediction.brandLabel) === comparable(evaluationCase.truth.brand)) brandCorrect += 1;
    }
    if (prediction.verified && !prediction.registryEvidence) identityBoundaryViolations += 1;
  }

  return {
    source: SECOND_HAND_FASHION_DATASET.name,
    attempted: cases.length,
    completed,
    providerFailures,
    categoryAccuracy: rate(categoryCorrect, completed),
    subtypeAccuracy: rate(subtypeCorrect, subtypeEligible),
    brandTextAccuracy: rate(brandCorrect, brandEligible),
    identityBoundaryViolations,
  };
}
