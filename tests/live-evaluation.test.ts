/**
 * The live-path recognition benchmark (work order W2): answers locked before any model call, the
 * exact scan the route runs, a spending cap that cannot be passed, and honest scoring.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { budgetLimit, callCostUsd, caseHash, createLock, HARD_BUDGET_USD, lockProblems, mayStartCall, primaryDetection, renderResultsMarkdown, scoreSet, wilson, worstCaseCallUsd, type LiveCase, type LivePrediction } from "../lib/live-evaluation.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pro = "us.amazon.nova-pro-v1:0";
const entry = (id: string, category = "top", patch: Partial<LiveCase> = {}): LiveCase => ({ id, set: "external", image: `${id}.jpg`, imageSha256: "a".repeat(64), truth: { category, subtype: "t-shirt", pieces: 1 }, ...patch });
const prediction = (id: string, category: string, patch: Partial<LivePrediction> = {}): LivePrediction => ({ id, status: "ok", detections: [{ category, subtype: "t-shirt", area: 0.5, verified: false }], models: [pro], costUsd: 0.005, ...patch });

test("the spending cap is $3.50 at most, whatever is configured", () => {
  assert.equal(HARD_BUDGET_USD, 3.5);
  assert.equal(budgetLimit(undefined), 3.5);
  assert.equal(budgetLimit("10"), 3.5, "a higher setting cannot raise it");
  assert.equal(budgetLimit("1.25"), 1.25, "a lower one can lower it");
  assert.equal(budgetLimit("nonsense"), 3.5);
});

test("a call is allowed only if, at its worst, the total stays within the budget", () => {
  const worst = worstCaseCallUsd(pro, 0);
  // 8,000 input and 3,600 output tokens at $0.80 / $3.20 per million, with the 1.5x margin.
  assert.ok(Math.abs(worst - ((8 * 0.0008 + 3.6 * 0.0032) * 1.5)) < 1e-9);
  assert.equal(mayStartCall(3.5 - worst, pro, 0, 3.5), true);
  assert.equal(mayStartCall(3.5 - worst + 0.0001, pro, 0, 3.5), false);
  assert.ok(worstCaseCallUsd(pro, 20_000) > worst, "a larger photo seen raises the worst case");
  assert.ok(Math.abs(callCostUsd(pro, { inputTokens: 5_000, outputTokens: 400 }) - (5 * 0.0008 + 0.4 * 0.0032) * 1.5) < 1e-9, "actual cost from reported tokens, with the margin");
  assert.throws(() => callCostUsd("some.unknown-model", { inputTokens: 1 }), /No price is known/, "an unpriced model is never called");
});

test("the runner counts every call, refuses to pass the cap, and keeps the total across reruns", () => {
  const runner = read("scripts/run-live-detection-evaluation.mjs");
  assert.match(runner, /if \(!mayStartCall\(progress\.spentUsd, modelId, progress\.largestInput, budget\)\) \{ budgetStopped = true;/, "checked before every call");
  assert.match(runner, /const cost = response\.usage \? callCostUsd\(modelId, response\.usage\) : worstCaseCallUsd\(modelId, progress\.largestInput\);/, "no usage reported is counted at its worst");
  assert.match(runner, /\} catch \(error\) \{\s*\/\/ A call that failed after it was sent may still be billed: count it at its worst\./);
  assert.match(runner, /const progress = existsSync\(PROGRESS\) \? JSON\.parse/, "the spend so far is read back, so a rerun cannot start from zero");
  assert.match(runner, /if \(process\.env\.RACKED_EVAL_CONFIRM !== "yes"\) \{\s*console\.log\("Nothing was spent/, "nothing runs without the owner's yes");
  assert.match(runner, /for \(const modelId of lookDetectionModelCandidates\(\)\) worstCaseCallUsd\(modelId, 0\);/, "every possible model is priced before the first call");
});

test("the runner runs the same scan the route runs, and touches nothing of Racked's", () => {
  const runner = read("scripts/run-live-detection-evaluation.mjs");
  const route = read("app/api/garments/detect/route.ts");
  assert.match(runner, /detectLookOrManualReview\(/);
  assert.match(runner, /detect: \(input\) => detectGarmentsInLook\(input, \{ invoke \}\)/);
  for (const step of [".rotate()", 'resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true})', "jpeg({quality:84,mozjpeg:true})"]) {
    assert.ok(route.replace(/\s/g, "").includes(step.replace(/\s/g, "")), `route: ${step}`);
    assert.ok(runner.replace(/\s/g, "").includes(step.replace(/\s/g, "")), `runner prepares the photo the same way: ${step}`);
  }
  assert.doesNotMatch(runner, /production-store|DynamoDB|S3Client|PutObject/, "no table, no bucket");
});

test("answers and photos are locked before any run, and any change is refused", () => {
  const cases = [entry("a"), entry("b", "bottom")];
  const lock = createLock(cases, "2026-10-29T00:00:00Z");
  assert.deepEqual(lockProblems(cases, lock), []);
  assert.match(lockProblems([entry("a"), entry("b", "top")], lock)[0], /b: its answer or photo changed/);
  assert.match(lockProblems([entry("a"), { ...entry("b", "bottom"), imageSha256: "b".repeat(64) }], lock)[0], /b: its answer or photo changed/, "a swapped photo is caught");
  assert.match(lockProblems([entry("a")], lock)[0], /b: locked but missing/);
  assert.match(lockProblems([...cases, entry("c")], lock)[0], /c: not in the lock/);
  assert.ok(lockProblems(cases, { ...lock, cases: { ...lock.cases, b: caseHash(entry("b", "top")) } }).some((problem) => /lock file itself was edited/.test(problem)));
  assert.match(read("scripts/run-live-detection-evaluation.mjs"), /if \(problems\.length\) throw new Error\(`The cases no longer match the lock; refusing to run/);
  assert.match(read("scripts/build-live-evaluation-set.mjs"), /if \(existsSync\(LOCK\) && !args\.includes\("--relock"\)\) throw/, "a lock is never silently replaced");
  assert.match(read("scripts/build-live-evaluation-set.mjs"), /if \(IMAGES\.startsWith\(ROOT\)\) throw/, "photos stay out of the repository");
});

test("Wilson intervals", () => {
  assert.equal(wilson(0, 0), null);
  const half = wilson(50, 100)!;
  assert.equal(half.rate, 0.5);
  assert.ok(Math.abs(half.low - 0.4038) < 0.001 && Math.abs(half.high - 0.5962) < 0.001);
  const all = wilson(10, 10)!;
  assert.equal(all.high, 1);
  assert.ok(all.low > 0.69 && all.low < 0.73);
});

test("scoring uses the largest detection, counts failures apart, and flags any AI-verified product", () => {
  const cases = [entry("a"), entry("b"), entry("c"), entry("d", "shoe"), { ...entry("e"), set: "pilot" as const, truth: { category: "top", pieces: 3, conditions: ["worn"] } }];
  const predictions = [
    prediction("a", "top"),
    prediction("b", "top", { detections: [{ category: "bottom", subtype: "jeans", area: 0.7, verified: false }, { category: "top", subtype: "t-shirt", area: 0.1, verified: false }] }),
    prediction("c", "unknown", { status: "failed", detections: [] }),
    prediction("d", "unknown", { status: "manual-review", detections: [{ category: "unknown", subtype: "other-garment", area: 1, verified: false }] }),
    prediction("e", "bottom", { detections: [{ category: "bottom", subtype: "jeans", area: 0.4, verified: true }, { category: "shoe", subtype: "sneakers", area: 0.1, verified: false }] }),
  ];
  assert.equal(primaryDetection(predictions[1])!.category, "bottom");
  const score = scoreSet(cases, predictions);
  assert.equal(score.attempted, 5);
  assert.deepEqual([score.providerFailures.successes, score.providerFailures.trials], [1, 5]);
  assert.deepEqual([score.category.successes, score.category.trials], [1, 4], "a failure is not counted against the category; a needs-your-label card is");
  assert.deepEqual([score.needsYourLabel.successes, score.needsYourLabel.trials], [1, 4]);
  assert.deepEqual([score.pieceRecall!.successes, score.pieceRecall!.trials], [2, 3]);
  assert.equal(score.identityBoundaryViolations, 1);
  assert.deepEqual(score.misses[0], { key: "top → bottom", count: 2 });
  assert.ok(score.missesByCondition.some((entry) => entry.key === "worn"));
  assert.equal(scoreSet([entry("z")], []).notAttempted, 1);
});

test("the published results say how much was attempted and what it cost", () => {
  const cases = [entry("a"), entry("b")];
  const report = { date: "2026-11-01", complete: false, spentUsd: 1.23, models: [pro], promptSha256: "f".repeat(64), external: scoreSet(cases, [prediction("a", "top")]), pilot: null };
  const text = renderResultsMarkdown(report);
  assert.match(text, /\*\*Partial run:\*\*/);
  assert.match(text, /1 of 2 locked photos attempted/);
  assert.match(text, /\| Category correct \| 1 of 1 \(100\.0%, 95% CI /);
  assert.match(text, /\$1\.23 \(hard cap \$3\.50\)/);
  assert.match(text, /must be 0/);
});
