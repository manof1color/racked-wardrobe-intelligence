// Live-path recognition benchmark (work order W2). Runs the exact detection the scan route runs —
// detectLookOrManualReview around detectGarmentsInLook, on the same 1,600-pixel JPEG — on every
// locked photo, and stops before Bedrock spending could pass the cap. Owner-run with AWS access.
//
//   node --experimental-strip-types scripts/run-live-detection-evaluation.mjs [--set external|pilot|all]
//
// Without RACKED_EVAL_CONFIRM=yes it only checks the lock and prints the cost estimate. Spending is
// counted from the tokens Bedrock reports for each call, with a safety margin, and saved after every
// photo, so a rerun resumes and can never spend the cap twice. The hard cap is $3.50; a lower one can
// be set with RACKED_EVAL_BUDGET_USD. Nothing is written to Racked's table, bucket, or any account.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { buildLookDetectionPrompt, detectGarmentsInLook, lookDetectionModelCandidates } from "../lib/look-garment-detection.ts";
import { detectLookOrManualReview } from "../lib/look-scan-resilience.ts";
import { BEDROCK_LOOK_TIMEOUT_MS } from "../lib/bedrock-timeout.ts";
import { budgetLimit, callCostUsd, HARD_BUDGET_USD, lockProblems, mayStartCall, renderResultsMarkdown, roundSuffix, scoreSet, worstCaseCallUsd } from "../lib/live-evaluation.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = resolve(process.env.RACKED_EVAL_IMAGES ?? join(ROOT, "..", "racked-eval-images"));
const args = process.argv.slice(2);
// --round N runs a later, separately locked set; its spend and progress are kept apart from round 1.
const round = args.includes("--round") ? args[args.indexOf("--round") + 1] : null;
const suffix = roundSuffix(round);
const PROGRESS = join(IMAGES, `live-progress${suffix}.json`);
const which = args.includes("--set") ? args[args.indexOf("--set") + 1] : "external";
if (!["external", "pilot", "all"].includes(which)) throw new Error("--set must be external, pilot, or all.");

const manifest = JSON.parse(await readFile(join(ROOT, `data/evaluation-live-manifest${suffix}.json`), "utf8"));
const lock = JSON.parse(await readFile(join(ROOT, `data/evaluation-lock${suffix}.json`), "utf8"));
const problems = lockProblems(manifest, lock);
if (problems.length) throw new Error(`The cases no longer match the lock; refusing to run:\n${problems.slice(0, 10).join("\n")}`);
for (const entry of manifest) {
  const bytes = await readFile(join(IMAGES, entry.image));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.imageSha256) throw new Error(`${entry.image} is not the locked photo.`);
}

const progress = existsSync(PROGRESS) ? JSON.parse(await readFile(PROGRESS, "utf8")) : { spentUsd: 0, largestInput: 0, predictions: [] };
const budget = budgetLimit(process.env.RACKED_EVAL_BUDGET_USD);
const done = new Set(progress.predictions.map((prediction) => prediction.id));
const todo = manifest.filter((entry) => (which === "all" || entry.set === which) && !done.has(entry.id));
const [primaryModel] = lookDetectionModelCandidates();
const typical = 0.006, worst = worstCaseCallUsd(primaryModel, progress.largestInput);
console.log(`Lock verified: ${manifest.length} cases. To run now: ${todo.length} (${which}). Already spent: $${progress.spentUsd.toFixed(2)} of $${budget.toFixed(2)} (hard cap $${HARD_BUDGET_USD.toFixed(2)}).`);
console.log(`Estimate: about $${(todo.length * typical).toFixed(2)} at a typical $${typical} a photo; each call is allowed only if, at its worst ($${worst.toFixed(3)}), the total stays within budget.`);
if (process.env.RACKED_EVAL_CONFIRM !== "yes") {
  console.log("Nothing was spent. Set RACKED_EVAL_CONFIRM=yes to run.");
  process.exit(0);
}

// Every model the scan may call must have a known price, or the cap cannot be kept.
for (const modelId of lookDetectionModelCandidates()) worstCaseCallUsd(modelId, 0);
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2" });
try { await client.config.credentials(); } catch { throw new Error("No AWS credentials were found. Run this where you are signed in to AWS (for example CloudShell)."); }
let budgetStopped = false, failuresInARow = 0;
const save = () => writeFile(PROGRESS, `${JSON.stringify(progress, null, 2)}\n`);

for (const [index, entry] of todo.entries()) {
  const models = [];
  let costUsd = 0;
  // The same Converse request detectGarmentsInLook builds; only the transport is wrapped so each
  // call's real token usage is counted, and a call that could pass the cap is never sent.
  const invoke = async (modelId, request) => {
    if (!mayStartCall(progress.spentUsd, modelId, progress.largestInput, budget)) { budgetStopped = true; throw new Error("Benchmark budget reached"); }
    let response;
    try {
      response = await client.send(new ConverseCommand(request), { abortSignal: AbortSignal.timeout(BEDROCK_LOOK_TIMEOUT_MS) });
    } catch (error) {
      // A call that failed after it was sent may still be billed: count it at its worst.
      const charge = worstCaseCallUsd(modelId, progress.largestInput);
      progress.spentUsd += charge; costUsd += charge; models.push(modelId);
      throw error;
    }
    // No usage reported means no way to know the cost, so it is counted at its worst too.
    const cost = response.usage ? callCostUsd(modelId, response.usage) : worstCaseCallUsd(modelId, progress.largestInput);
    progress.spentUsd += cost; costUsd += cost; models.push(modelId);
    progress.largestInput = Math.max(progress.largestInput, response.usage?.inputTokens ?? 0);
    return response;
  };
  const prepared = await sharp(await readFile(join(IMAGES, entry.image))).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const result = await detectLookOrManualReview(
    { base64: prepared.data.toString("base64"), contentType: "image/jpeg", image: { width: prepared.info.width, height: prepared.info.height } },
    { detect: (input) => detectGarmentsInLook(input, { invoke }) },
  );
  if (budgetStopped) { await save(); console.log(`Stopped before photo ${index + 1}: another call could pass the budget.`); break; }
  const manual = result.detections.length === 1 && result.detections[0].analysis.provider === "manual-review";
  progress.predictions.push({
    id: entry.id,
    status: result.providerFailed ? "failed" : manual ? "manual-review" : "ok",
    detections: result.detections.map((detection) => ({ category: detection.analysis.garment.category, subtype: detection.analysis.garment.subtype, area: Number((detection.bounds.width * detection.bounds.height).toFixed(4)), verified: detection.analysis.label.matched === true })),
    models,
    costUsd: Number(costUsd.toFixed(5)),
  });
  failuresInARow = result.providerFailed ? failuresInARow + 1 : 0;
  if (failuresInARow === 3) {
    // Three in a row is an outage or a permissions problem, not the photos: stop, and leave those
    // three unrecorded so a rerun tries them again.
    progress.predictions.splice(-3, 3);
    await save();
    console.log("Stopped: the service failed three photos in a row. Check Bedrock access, then rerun to continue.");
    break;
  }
  await save();
  if ((index + 1) % 25 === 0) console.log(`  ${index + 1}/${todo.length} photos, $${progress.spentUsd.toFixed(2)} counted`);
}

const date = new Date().toISOString().slice(0, 10);
const forSet = (set) => manifest.filter((entry) => entry.set === set);
const report = {
  date,
  ...(suffix ? { round } : {}),
  complete: manifest.every((entry) => progress.predictions.some((prediction) => prediction.id === entry.id)),
  spentUsd: Number(progress.spentUsd.toFixed(2)),
  models: [...new Set(progress.predictions.flatMap((prediction) => prediction.models))],
  promptSha256: createHash("sha256").update(buildLookDetectionPrompt()).digest("hex"),
  external: forSet("external").length ? scoreSet(forSet("external"), progress.predictions) : null,
  pilot: forSet("pilot").length ? scoreSet(forSet("pilot"), progress.predictions) : null,
};
await writeFile(join(ROOT, `data/evaluation-live-${date}${suffix}.json`), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(ROOT, `docs/evaluation-results${suffix}.md`), renderResultsMarkdown(report));
console.log(`Report: data/evaluation-live-${date}${suffix}.json and docs/evaluation-results${suffix}.md. Counted spend $${report.spentUsd.toFixed(2)}.`);
