import test from "node:test";
import assert from "node:assert/strict";
import {
  SECOND_HAND_FASHION_DATASET,
  deterministicEvaluationSample,
  normalizeSecondHandAnnotation,
  scoreGarmentEvaluation,
  type EvaluationCase,
} from "../lib/evaluation-dataset.ts";

const cases: EvaluationCase[] = [
  {
    externalId: "garment-c",
    source: SECOND_HAND_FASHION_DATASET.name,
    views: { front: "c-front.jpg", back: "c-back.jpg", label: "c-label.jpg" },
    truth: { category: "outerwear", subtype: "bomber-jacket", brand: "Example Brand" },
  },
  {
    externalId: "garment-a",
    source: SECOND_HAND_FASHION_DATASET.name,
    views: { front: "a-front.jpg", back: "a-back.jpg", label: "a-label.jpg" },
    truth: { category: "top", subtype: "polo" },
  },
  {
    externalId: "garment-b",
    source: SECOND_HAND_FASHION_DATASET.name,
    views: { front: "b-front.jpg", back: "b-back.jpg", label: "b-label.jpg" },
    truth: { category: "shoe", subtype: "loafers" },
  },
];

test("external annotations map into the controlled taxonomy without using wearer category as garment identity", () => {
  assert.deepEqual(normalizeSecondHandAnnotation({
    category: "Ladies",
    type: "Bomber jacket",
    brand: " Example Brand ",
    colors: "Black",
  }), {
    category: "outerwear",
    subtype: "bomber-jacket",
    brand: "Example Brand",
    color: "Black",
    pattern: undefined,
    material: undefined,
  });
});

test("evaluation samples are deterministic and do not depend on input ordering", () => {
  const first = deterministicEvaluationSample(cases, 2, 42).map((entry) => entry.externalId);
  const second = deterministicEvaluationSample([...cases].reverse(), 2, 42).map((entry) => entry.externalId);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
});

test("evaluation reports accuracy, provider failure, and AI-only verification violations separately", () => {
  const report = scoreGarmentEvaluation(cases, [
    { externalId: "garment-c", providerStatus: "ok", category: "outerwear", subtype: "bomber-jacket", brandLabel: "example-brand", verified: true },
    { externalId: "garment-a", providerStatus: "ok", category: "top", subtype: "t-shirt" },
    { externalId: "garment-b", providerStatus: "failed" },
  ]);
  assert.deepEqual(report, {
    source: SECOND_HAND_FASHION_DATASET.name,
    attempted: 3,
    completed: 2,
    providerFailures: 1,
    categoryAccuracy: 1,
    subtypeAccuracy: 0.5,
    brandTextAccuracy: 1,
    identityBoundaryViolations: 1,
  });
});

test("generic source types and placeholder brands are excluded from subtype and OCR denominators", () => {
  const truth = normalizeSecondHandAnnotation({ type: "Top", category: "Ladies", brand: "Not Applicable", colors: ["Blue", "White"] });
  assert.deepEqual(truth, {
    category: "top",
    subtype: undefined,
    brand: undefined,
    color: "Blue, White",
    pattern: undefined,
    material: undefined,
  });
});
