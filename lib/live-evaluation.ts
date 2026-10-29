import { createHash } from "node:crypto";

/**
 * The live-path recognition benchmark (work order W2): the exact detection the scan route runs,
 * on photos whose correct answers were locked before any model call, scored with 95% intervals.
 *
 * This module is pure — no AWS, no files — so the scoring, the lock, and the spending cap are all
 * tested. The runner (`scripts/run-live-detection-evaluation.mjs`) supplies photos and model calls.
 */

export interface LiveCaseTruth {
  category: string;
  /** Present only when the label is specific enough to score the exact type. */
  subtype?: string;
  /** Visible wearable pieces in the photo; 1 for the external set. */
  pieces: number;
  /** Optional photo conditions from the labeller, used to group misses: "worn", "flat-lay", "occluded"… */
  conditions?: string[];
}

export interface LiveCase {
  id: string;
  set: "external" | "pilot";
  /** File name inside the images folder, which stays outside the repository. */
  image: string;
  imageSha256: string;
  truth: LiveCaseTruth;
  /** Where an external case came from, for reproducibility. */
  source?: { dataset: string; mirror: string; row: number };
}

export interface LiveDetection {
  category: string;
  subtype: string;
  /** Share of the photo the detection's box covers, 0–1. */
  area: number;
  verified: boolean;
}

export interface LivePrediction {
  id: string;
  /** "ok": the model answered; "manual-review": nothing usable came back, so the person would label it; "failed": the service did not answer. */
  status: "ok" | "manual-review" | "failed";
  detections: LiveDetection[];
  models: string[];
  costUsd: number;
}

// ── Lock ───────────────────────────────────────────────────────────────────────

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter((key) => (value as Record<string, unknown>)[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** One case's fingerprint: its answer and its photo's bytes, so neither can change after locking. */
export const caseHash = (entry: LiveCase) => sha256(canonical({ id: entry.id, set: entry.set, imageSha256: entry.imageSha256, truth: entry.truth }));

export interface EvaluationLock { lockedAt: string; caseCount: number; combined: string; cases: Record<string, string> }

export function createLock(cases: LiveCase[], lockedAt: string): EvaluationLock {
  const hashes = Object.fromEntries([...cases].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => [entry.id, caseHash(entry)]));
  return { lockedAt, caseCount: cases.length, combined: sha256(canonical(hashes)), cases: hashes };
}

/** Every reason the cases no longer match the lock. Empty means the run may go ahead. */
export function lockProblems(cases: LiveCase[], lock: EvaluationLock) {
  const problems: string[] = [];
  const ids = new Set(cases.map((entry) => entry.id));
  for (const entry of cases) {
    const locked = lock.cases[entry.id];
    if (!locked) problems.push(`${entry.id}: not in the lock`);
    else if (locked !== caseHash(entry)) problems.push(`${entry.id}: its answer or photo changed after locking`);
  }
  for (const id of Object.keys(lock.cases)) if (!ids.has(id)) problems.push(`${id}: locked but missing from the manifest`);
  if (sha256(canonical(Object.fromEntries(Object.keys(lock.cases).sort().map((id) => [id, lock.cases[id]])))) !== lock.combined) problems.push("the lock file itself was edited");
  return problems;
}

// ── Spending cap ───────────────────────────────────────────────────────────────

/** Never more than this, whatever is configured. The owner set $4 as the absolute limit. */
export const HARD_BUDGET_USD = 3.5;
/** Published on-demand prices are multiplied by this before counting, to cover regional differences. */
export const PRICE_SAFETY = 1.5;
/** US dollars per 1,000 tokens. Nova Pro $0.80 / $3.20 per million; Nova Lite $0.06 / $0.24. */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "us.amazon.nova-pro-v1:0": { input: 0.0008, output: 0.0032 },
  "amazon.nova-pro-v1:0": { input: 0.0008, output: 0.0032 },
  "us.amazon.nova-lite-v1:0": { input: 0.00006, output: 0.00024 },
  "amazon.nova-lite-v1:0": { input: 0.00006, output: 0.00024 },
};
/** The detection request's output ceiling (lib/look-garment-detection.ts). */
export const DETECTION_MAX_OUTPUT_TOKENS = 3600;
/** Assumed input size before any call has reported one: prompt plus a 1600-pixel photo, generously. */
export const ASSUMED_MAX_INPUT_TOKENS = 8000;

export const budgetLimit = (configured: string | undefined) => {
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? Math.min(value, HARD_BUDGET_USD) : HARD_BUDGET_USD;
};

const price = (modelId: string) => {
  const found = MODEL_PRICES[modelId];
  if (!found) throw new Error(`No price is known for ${modelId}; refusing to call it.`);
  return found;
};

/** What a finished call cost, by the tokens Bedrock reported, with the safety margin. */
export function callCostUsd(modelId: string, usage: { inputTokens?: number; outputTokens?: number }) {
  const rates = price(modelId);
  return (((usage.inputTokens ?? 0) / 1000) * rates.input + ((usage.outputTokens ?? 0) / 1000) * rates.output) * PRICE_SAFETY;
}

/** The most the next call could cost: the largest input seen so far (or the assumption) and a full output. */
export function worstCaseCallUsd(modelId: string, largestInputSeen: number) {
  return callCostUsd(modelId, { inputTokens: Math.max(largestInputSeen, ASSUMED_MAX_INPUT_TOKENS), outputTokens: DETECTION_MAX_OUTPUT_TOKENS });
}

/** A call may start only if, at its worst, it still leaves the total within the budget. */
export const mayStartCall = (spentUsd: number, modelId: string, largestInputSeen: number, budgetUsd: number) => spentUsd + worstCaseCallUsd(modelId, largestInputSeen) <= budgetUsd;

// ── Scoring ────────────────────────────────────────────────────────────────────

/** Wilson score interval, 95%. */
export function wilson(successes: number, trials: number) {
  if (!trials) return null;
  const z = 1.959964, p = successes / trials, z2 = z * z;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / (1 + z2 / trials);
  const round = (value: number) => Number(value.toFixed(4));
  return { rate: round(p), low: round(Math.max(0, centre - half)), high: round(Math.min(1, centre + half)) };
}

const proportion = (successes: number, trials: number) => ({ successes, trials, ...(wilson(successes, trials) ?? { rate: null, low: null, high: null }) });

/** The garment a single-garment photo is about: the detection covering the most of it. */
export const primaryDetection = (prediction: LivePrediction) => [...prediction.detections].sort((a, b) => b.area - a.area)[0] ?? null;

export function scoreSet(cases: LiveCase[], predictions: LivePrediction[]) {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  const attempted = cases.filter((entry) => byId.has(entry.id));
  let failed = 0, manual = 0, categoryCorrect = 0, answered = 0, subtypeCorrect = 0, subtypeEligible = 0, piecesFound = 0, piecesExpected = 0, multiPhotos = 0, violations = 0;
  const misses = new Map<string, number>();
  const missConditions = new Map<string, number>();
  for (const entry of attempted) {
    const prediction = byId.get(entry.id)!;
    violations += prediction.detections.filter((detection) => detection.verified).length;
    if (prediction.status === "failed") { failed++; continue; }
    if (prediction.status === "manual-review") { manual++; }
    answered++;
    const primary = primaryDetection(prediction);
    const category = prediction.status === "manual-review" ? "unknown" : primary?.category ?? "unknown";
    if (category === entry.truth.category) categoryCorrect++;
    else {
      const key = `${entry.truth.category} → ${category}`;
      misses.set(key, (misses.get(key) ?? 0) + 1);
      for (const condition of entry.truth.conditions ?? ["not recorded"]) missConditions.set(condition, (missConditions.get(condition) ?? 0) + 1);
    }
    if (entry.truth.subtype) {
      subtypeEligible++;
      if (prediction.status === "ok" && primary?.subtype === entry.truth.subtype) subtypeCorrect++;
    }
    if (entry.truth.pieces > 1) {
      multiPhotos++;
      piecesExpected += entry.truth.pieces;
      piecesFound += Math.min(prediction.status === "ok" ? prediction.detections.length : 0, entry.truth.pieces);
    }
  }
  const sorted = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
  return {
    cases: cases.length,
    attempted: attempted.length,
    notAttempted: cases.length - attempted.length,
    providerFailures: proportion(failed, attempted.length),
    needsYourLabel: proportion(manual, answered),
    category: proportion(categoryCorrect, answered),
    exactSubtype: proportion(subtypeCorrect, subtypeEligible),
    pieceRecall: multiPhotos ? proportion(piecesFound, piecesExpected) : null,
    identityBoundaryViolations: violations,
    misses: sorted(misses),
    missesByCondition: sorted(missConditions),
  };
}

export type SetScore = ReturnType<typeof scoreSet>;

export interface LiveReport {
  date: string;
  /** A later, separately locked round of fresh photos; absent for the first. */
  round?: string;
  complete: boolean;
  spentUsd: number;
  models: string[];
  promptSha256: string;
  external: SetScore | null;
  pilot: SetScore | null;
}

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);
const interval = (score: { successes: number; trials: number; rate: number | null; low: number | null; high: number | null }) =>
  score.trials ? `${score.successes} of ${score.trials} (${pct(score.rate)}, 95% CI ${pct(score.low)}–${pct(score.high)})` : "no eligible photos";

/** File-name suffix for a later round: "" for the first, "-r2" for round 2. */
export function roundSuffix(round: string | null | undefined) {
  if (round === null || round === undefined || round === "1") return "";
  if (!/^[2-9]$/.test(round)) throw new Error("--round must be a single digit from 2 to 9.");
  return `-r${round}`;
}

/** docs/evaluation-results.md, written from the report and nothing else. */
export function renderResultsMarkdown(report: LiveReport) {
  const suffix = roundSuffix(report.round);
  const lines = [
    `# Recognition results — live scan path${report.round ? `, round ${report.round}` : ""}`,
    "",
    `Generated from \`data/evaluation-live-${report.date}${suffix}.json\` by \`scripts/run-live-detection-evaluation.mjs\`. ${report.complete ? "Every locked photo was attempted." : "**Partial run:** not every locked photo was attempted; the denominators below say how many were."}`,
    "",
    `The benchmark runs \`detectLookOrManualReview\` and \`detectGarmentsInLook\` — the functions \`POST /api/garments/detect\` runs — on the same 1,600-pixel JPEG the route prepares. Models: ${report.models.map((model) => `\`${model}\``).join(", ") || "none called"}. Prompt SHA-256 \`${report.promptSha256.slice(0, 16)}…\`. Answers were locked in \`data/evaluation-lock${suffix}.json\` before any model call. Bedrock spend counted with a ${PRICE_SAFETY}× margin: $${report.spentUsd.toFixed(2)} (hard cap $${HARD_BUDGET_USD.toFixed(2)}).`,
    "",
  ];
  for (const [title, score] of [["External: Clothing Dataset for Second-Hand Fashion (CC BY 4.0), front photos", report.external], ["Pilot brands' products, photographed and labelled by the owner", report.pilot]] as const) {
    if (!score) continue;
    lines.push(`## ${title}`, "", `${score.attempted} of ${score.cases} locked photos attempted.`, "", "| Measure | Result |", "| --- | --- |");
    lines.push(`| Category correct | ${interval(score.category)} |`);
    lines.push(`| Exact type correct (photos whose label names a type) | ${interval(score.exactSubtype)} |`);
    if (score.pieceRecall) lines.push(`| Pieces found in multi-piece photos | ${interval(score.pieceRecall)} |`);
    lines.push(`| Service did not answer | ${interval(score.providerFailures)} |`);
    lines.push(`| Came back as "needs your label" | ${interval(score.needsYourLabel)} |`);
    lines.push(`| Products marked verified without registry evidence | ${score.identityBoundaryViolations} (must be 0) |`, "");
    if (score.misses.length) {
      lines.push("Most common misses (correct → proposed):", "", "| Miss | Photos |", "| --- | ---: |", ...score.misses.slice(0, 10).map((miss) => `| ${miss.key} | ${miss.count} |`), "");
    }
    if (score.missesByCondition.some((entry) => entry.key !== "not recorded")) {
      lines.push("Misses by photo condition:", "", "| Condition | Misses |", "| --- | ---: |", ...score.missesByCondition.map((entry) => `| ${entry.key} | ${entry.count} |`), "");
    }
  }
  lines.push("A category is scored on the detection covering most of the photo. These are results on the photos named in the lock, not a guarantee for every photo.");
  return lines.join("\n") + "\n";
}
