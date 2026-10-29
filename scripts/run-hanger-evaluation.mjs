// Hanger blind evaluation, runner (work order W7). For each of 40 synthetic requests it gets
// Hanger's outfit from runHangerAgent — the same agent the chat route runs — and a seeded random
// valid outfit from the same closet, then writes a BLINDED rater sheet and a separate private key.
// Owner-run with AWS access; it stops before Bedrock spending could pass the cap.
//
//   node --experimental-strip-types scripts/run-hanger-evaluation.mjs
//
// Without RACKED_EVAL_CONFIRM=yes it only checks the fixtures and prints the request count and a cost
// estimate: nothing is called and nothing is written. Spending is counted from the tokens Bedrock
// reports for each call, with a safety margin; each call is reserved at its worst case and saved
// before it is sent, so a rerun resumes and can never spend the same money twice. The hard cap is
// $1.50; a lower one can be set with RACKED_EVAL_BUDGET_USD, a higher one is ignored.
//
// Environment:
//   RACKED_EVAL_CONFIRM=yes        actually call Bedrock (otherwise a dry run)
//   RACKED_EVAL_BUDGET_USD=1.00    a lower cap than $1.50
//   RACKED_HANGER_EVAL_DIR=...     where the rater sheet, key and run file go; must be OUTSIDE this
//                                  repository (default: ../racked-hanger-eval)
//   RACKED_HANGER_EVAL_SEED=...    seed for the baseline outfits and the A/B order
//
// Nothing is written to Racked's table, bucket, or any account, and the closets are invented.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { bedrockAgentConverse, runHangerAgent } from "../lib/hanger-agent.ts";
import { hangerModelCandidates } from "../lib/hanger-conversation.ts";
import { buildForecast, buildRaterSheet, isInside, outfitProblems, randomValidOutfit, seededRandom, toWardrobeItem, validateFixtures } from "../lib/hanger-evaluation.ts";
import { HARD_BUDGET_USD, SpendGuard, budgetLimit, estimateRun, meteredAgentCall, newTally } from "../lib/hanger-eval-spend.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "data", "hanger-eval");
const OUT = resolve(process.env.RACKED_HANGER_EVAL_DIR ?? join(ROOT, "..", "racked-hanger-eval"));
const SEED = process.env.RACKED_HANGER_EVAL_SEED?.trim() || "racked-hanger-eval-1";
const RUN_FILE = join(OUT, "run.json");
const CONSECUTIVE_PROVIDER_FAILURES_TO_STOP = 3;

if (isInside(OUT, ROOT)) throw new Error(`RACKED_HANGER_EVAL_DIR (${OUT}) is inside this repository. The rater sheet and key must stay outside it, or they could be committed.`);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const closets = ["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => readJson(join(FIXTURES, `${id}.json`)));
const requests = readJson(join(FIXTURES, "requests.json")).requests;
const problems = validateFixtures(closets, requests);
if (problems.length) throw new Error(`The fixtures are not fit to run:\n${problems.slice(0, 10).join("\n")}`);
const closetOf = new Map(closets.map((closet) => [closet.id, closet]));

// The baseline needs no model, so it is built and checked even on a dry run.
const baselineOf = (request) => randomValidOutfit(closetOf.get(request.closet).pieces, request, seededRandom(SEED, `baseline:${request.id}`));
const invalidBaselines = requests.filter((request) => outfitProblems(baselineOf(request)).length);
if (invalidBaselines.length) throw new Error(`Baseline outfits were not valid for: ${invalidBaselines.map((request) => request.id).join(", ")}`);

const models = hangerModelCandidates();
const budget = budgetLimit(process.env.RACKED_EVAL_BUDGET_USD);
const estimate = estimateRun(requests.length, models, budget);
const run = existsSync(RUN_FILE) ? readJson(RUN_FILE) : { version: 1, seed: SEED, spend: { spentUsd: 0, largestInput: 0, callsSent: 0 }, records: {} };
if (run.seed !== SEED) throw new Error(`${RUN_FILE} was made with seed "${run.seed}", not "${SEED}". Use the same seed to resume, or a different RACKED_HANGER_EVAL_DIR for a new run.`);
const todo = requests.filter((request) => !run.records[request.id]);
const kinds = requests.reduce((count, request) => ({ ...count, [request.kind]: (count[request.kind] ?? 0) + 1 }), {});

console.log(`Fixtures verified: ${closets.length} closets (${closets.map((closet) => closet.pieces.length).join(", ")} pieces), ${requests.length} requests (${Object.entries(kinds).map(([kind, n]) => `${n} ${kind}`).join(", ")}). ${requests.length} baseline outfits built and valid.`);
console.log(`To run now: ${todo.length} of ${requests.length}. Already counted: $${run.spend.spentUsd.toFixed(2)} of $${budget.toFixed(2)} (hard cap $${HARD_BUDGET_USD.toFixed(2)}). Models the agent may call: ${models.join(", ")}.`);
console.log(`Estimate: about $${(estimate.typicalUsd * (todo.length / requests.length)).toFixed(2)} for what remains, counted with the 1.5x margin; each call is allowed only if, at its worst ($${estimate.worstCallUsd.toFixed(3)}), the total stays within the budget, so the run stops itself before the cap.`);
console.log(`Rater sheet, key and run file would go to ${OUT} (outside the repository).`);
if (process.env.RACKED_EVAL_CONFIRM !== "yes") {
  console.log("Nothing was called or written. Set RACKED_EVAL_CONFIRM=yes to run.");
  process.exit(0);
}

process.env.AI_PROVIDER = "bedrock";
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
try { await new BedrockRuntimeClient({ region }).config.credentials(); } catch { throw new Error("No AWS credentials were found. Run this where you are signed in to AWS (for example CloudShell)."); }

mkdirSync(OUT, { recursive: true });
// Saved to a temporary name and renamed, so a crash never leaves a half-written run file. If saving
// fails, nothing more may be spent against a total that was not recorded: stop.
const save = () => {
  try {
    writeFileSync(`${RUN_FILE}.tmp`, `${JSON.stringify(run, null, 2)}\n`);
    renameSync(`${RUN_FILE}.tmp`, RUN_FILE);
  } catch (error) {
    console.error(`Could not save progress to ${RUN_FILE}: ${error.message}. Stopping before any more is spent.`);
    process.exit(1);
  }
};
const guard = new SpendGuard(run.spend, budget, models, save);

let stoppedEarly = false, providerFailuresInARow = 0;
for (const [index, request] of todo.entries()) {
  const closet = closetOf.get(request.closet);
  const wardrobe = closet.pieces.map(toWardrobeItem);
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const tally = newTally();
  let failure = null;
  const result = await runHangerAgent({
    message: request.text,
    history: [],
    wardrobe,
    forecast: request.forecast ? buildForecast(request.forecast, request.today) : null,
    activeOutfit: (request.activeOutfit ?? []).map((id) => byId.get(id)),
    remembered: "",
    rankingBase: {},
    loadTrends: async () => null,
    today: new Date(`${request.today}T12:00:00Z`),
    onFallback: (details) => { failure = details; },
  }, meteredAgentCall(bedrockAgentConverse, guard, tally));

  if (tally.refused) {
    save();
    console.log(`Stopped before ${request.id}: another call could pass the budget. Rerun to continue only if the cap allows; counted so far $${run.spend.spentUsd.toFixed(2)}.`);
    stoppedEarly = true;
    break;
  }
  const providerFailed = failure && ["model-error", "no-response"].includes(failure.kind);
  providerFailuresInARow = providerFailed ? providerFailuresInARow + 1 : 0;
  const first = result?.outfits?.[0];
  run.records[request.id] = {
    hangerOutfit: first?.length ? first.map((item) => item.id) : null,
    baselineOutfit: baselineOf(request).map((piece) => piece.id),
    reply: result?.message ?? "",
    toolsUsed: result?.toolsUsed ?? [],
    fallback: result ? null : (failure ? { kind: failure.kind, ...(failure.errorName ? { errorName: failure.errorName } : {}) } : { kind: "unknown" }),
    modelCalls: tally.modelCalls,
    toolUses: tally.toolUses,
    corrections: tally.corrections,
  };
  save();
  if (providerFailuresInARow === CONSECUTIVE_PROVIDER_FAILURES_TO_STOP) {
    // Three in a row is an outage or a permissions problem, not the requests: forget those three so a
    // rerun tries them again. What they cost stays counted.
    for (const stale of todo.slice(index - CONSECUTIVE_PROVIDER_FAILURES_TO_STOP + 1, index + 1)) delete run.records[stale.id];
    save();
    console.log("Stopped: the model failed three requests in a row. Check Bedrock access (AI_HANGER_MODEL, region, permissions), then rerun to continue.");
    stoppedEarly = true;
    break;
  }
  console.log(`  ${request.id}: ${tally.modelCalls} model calls, ${tally.toolUses} tool calls${result ? "" : `, fell back (${failure?.kind ?? "unknown"})`} — $${run.spend.spentUsd.toFixed(2)} counted`);
}

const done = requests.filter((request) => run.records[request.id]).length;
if (done < requests.length) {
  console.log(`${done} of ${requests.length} requests are recorded in ${RUN_FILE}. ${stoppedEarly ? "" : "Something stopped the run. "}No rater sheet is written until all ${requests.length} are done; rerun to continue.`);
  process.exit(stoppedEarly ? 2 : 1);
}
const sheet = buildRaterSheet({ seed: SEED, closets, requests, records: run.records });
writeFileSync(join(OUT, "rater-sheet.csv"), sheet.csv);
writeFileSync(join(OUT, "key.json"), `${JSON.stringify(sheet.key, null, 2)}\n`);
writeFileSync(join(OUT, "closets.txt"), sheet.closetsText);
console.log(`Done. Counted spend $${run.spend.spentUsd.toFixed(2)}. In ${OUT}:`);
console.log("  rater-sheet.csv and closets.txt  -> give a copy of both to each of the two raters (never the owner)");
console.log("  key.json and run.json            -> keep private; the scorer needs them, the raters must never see them");
