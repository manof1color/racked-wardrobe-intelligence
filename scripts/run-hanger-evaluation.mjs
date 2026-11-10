// Hanger blind evaluation, runner (work order W7). For each of 40 synthetic requests it gets
// Hanger's outfit from runConsumerHangerTurn — the turn the chat route runs, grounded fallback
// included — and a seeded random valid outfit from the same closet, then writes a BLINDED rater
// sheet and a separate private key. Owner-run with AWS access; it stops before Bedrock spending
// could pass the cap.
//
//   node --experimental-strip-types scripts/run-hanger-evaluation.mjs
//
// Without RACKED_EVAL_CONFIRM=yes it only checks the fixtures, prints the request count and a cost
// estimate, and runs the DRY-RUN CHECK: every request through the same turn with the model switched
// off, counting how many outfits are valid and how many swaps changed only the slot asked for. That
// calls nothing and writes nothing. Spending in a real run is counted from the tokens Bedrock
// reports for each call, with a safety margin; each call is reserved at its worst case and saved
// before it is sent, so a rerun resumes and can never spend the same money twice. The hard cap is
// $1.50; a lower one can be set with RACKED_EVAL_BUDGET_USD, a higher one is ignored.
//
// Environment:
//   RACKED_EVAL_CONFIRM=yes        actually call Bedrock (otherwise a dry run)
//   RACKED_EVAL_BUDGET_USD=1.00    a lower cap than $1.50
//   RACKED_HANGER_EVAL_SET=...     the fixture set: "original" (default, data/hanger-eval/) or a
//                                  folder beside it such as holdout-1
//   RACKED_HANGER_EVAL_DIR=...     where the rater sheet, key and run file go; must be OUTSIDE this
//                                  repository (default: ../racked-hanger-eval, or ../racked-hanger-eval-<set>)
//   RACKED_HANGER_EVAL_SEED=...    seed for the baseline outfits and the A/B order
//   RACKED_EVAL_ALLOW_DIRTY=yes    run with uncommitted changes; the commit is then recorded as "-dirty"
//
// Nothing is written to Racked's table, bucket, or any account, and the closets are invented.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { bedrockAgentConverse } from "../lib/hanger-agent.ts";
import { runConsumerHangerTurn } from "../lib/hanger-consumer-turn.ts";
import { hangerModelCandidates } from "../lib/hanger-conversation.ts";
import { ORIGINAL_SET, buildForecast, buildRaterSheet, closetIdsOf, conversationShowing, evaluationSetFolder, evaluationSetName, isInside, mechanicalChecks, outfitProblems, randomValidOutfit, seededRandom, toWardrobeItem, validateFixtures } from "../lib/hanger-evaluation.ts";
import { HARD_BUDGET_USD, SpendGuard, budgetLimit, estimateRun, meteredAgentCall, newTally } from "../lib/hanger-eval-spend.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SET = evaluationSetName(process.env.RACKED_HANGER_EVAL_SET);
const FIXTURES = join(ROOT, "data", "hanger-eval", ...evaluationSetFolder(SET));
const OUT = resolve(process.env.RACKED_HANGER_EVAL_DIR ?? join(ROOT, "..", SET === ORIGINAL_SET ? "racked-hanger-eval" : `racked-hanger-eval-${SET}`));
const SEED = process.env.RACKED_HANGER_EVAL_SEED?.trim() || (SET === ORIGINAL_SET ? "racked-hanger-eval-1" : `racked-hanger-eval-${SET}`);
const RUN_FILE = join(OUT, "run.json");
const CONSECUTIVE_PROVIDER_FAILURES_TO_STOP = 3;
const AGENT_TOOL_NAMES = ["wardrobe search", "outfit builder", "weather", "Racked trends"];

if (isInside(OUT, ROOT)) throw new Error(`RACKED_HANGER_EVAL_DIR (${OUT}) is inside this repository. The rater sheet and key must stay outside it, or they could be committed.`);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
if (!existsSync(join(FIXTURES, "requests.json"))) throw new Error(`No fixture set "${SET}" at ${FIXTURES}.`);
const requests = readJson(join(FIXTURES, "requests.json")).requests;
const closets = closetIdsOf(requests).map((id) => readJson(join(FIXTURES, `${id}.json`)));
const problems = validateFixtures(closets, requests);
if (problems.length) throw new Error(`The fixtures are not fit to run:\n${problems.slice(0, 10).join("\n")}`);
const closetOf = new Map(closets.map((closet) => [closet.id, closet]));

// The baseline needs no model, so it is built and checked even on a dry run.
const baselineOf = (request) => randomValidOutfit(closetOf.get(request.closet).pieces, request, seededRandom(SEED, `baseline:${request.id}`));
const invalidBaselines = requests.filter((request) => outfitProblems(baselineOf(request)).length);
if (invalidBaselines.length) throw new Error(`Baseline outfits were not valid for: ${invalidBaselines.map((request) => request.id).join(", ")}`);

/** The commit being tested. A run with uncommitted changes cannot honestly name one. */
function commitUnderTest() {
  try {
    const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain") !== "" };
  } catch {
    return { commit: "unknown", dirty: false };
  }
}
const tested = commitUnderTest();
const commitLabel = `${tested.commit}${tested.dirty ? "-dirty" : ""}`;

/** One request through the turn the route runs. The model callers are the only thing that differs. */
async function answer(request, { agentEnabled, agentCall, onAgentFallback }) {
  const closet = closetOf.get(request.closet);
  const today = new Date(`${request.today}T12:00:00Z`);
  const onScreen = (request.activeOutfit ?? []).map((id) => closet.pieces.find((piece) => piece.id === id));
  // The agent logs why it fell back; in a run that is recorded per request instead.
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await runConsumerHangerTurn({
      message: request.text,
      wardrobe: closet.pieces.map(toWardrobeItem),
      outfits: [],
      inspiration: { lookCount: 0, styleHints: [], colors: [], categories: [], subtypes: [], recentLookTitles: [] },
      stored: conversationShowing(onScreen, today),
      forecast: request.forecast ? buildForecast(request.forecast, request.today) : null,
      agentEnabled, aiPaused: false, today,
      loadTrends: async () => null,
      agentCall,
      // Raters see outfits, never wording, so the grounded pipeline's plain model reply is not bought.
      plainCall: async () => null,
      onAgentFallback,
    });
  } finally {
    console.warn = warn;
  }
}
const cardOf = (turn) => { const ids = (turn.reply.selection ?? []).map((piece) => piece.id); return ids.length ? ids : null; };
const describeChecks = (checks) => [
  `${checks.outfits.valid} of ${checks.outfits.offered} outfits offered are valid (${checks.outfits.offered} of ${checks.outfits.answerable} answerable requests got one)${checks.outfits.invalid.length ? `; not valid: ${checks.outfits.invalid.map((entry) => `${entry.id} (${entry.problems.join("; ")})`).join(", ")}` : ""}`,
  `${checks.swaps.exact} of ${checks.swaps.requests} swaps changed only the slot asked for${checks.swaps.inexact.length ? `; not: ${checks.swaps.inexact.map((entry) => `${entry.id} (${entry.problems.join("; ")})`).join(", ")}` : ""}`,
].join(". ");

const models = hangerModelCandidates();
const budget = budgetLimit(process.env.RACKED_EVAL_BUDGET_USD);
const estimate = estimateRun(requests.length, models, budget);
const run = existsSync(RUN_FILE) ? readJson(RUN_FILE) : { version: 1, seed: SEED, set: SET, commit: commitLabel, spend: { spentUsd: 0, largestInput: 0, callsSent: 0 }, records: {} };
if (run.seed !== SEED) throw new Error(`${RUN_FILE} was made with seed "${run.seed}", not "${SEED}". Use the same seed to resume, or a different RACKED_HANGER_EVAL_DIR for a new run.`);
if ((run.set ?? ORIGINAL_SET) !== SET) throw new Error(`${RUN_FILE} was made with fixture set "${run.set ?? ORIGINAL_SET}", not "${SET}". Use a different RACKED_HANGER_EVAL_DIR for this set.`);
const todo = requests.filter((request) => !run.records[request.id]);
const kinds = requests.reduce((count, request) => ({ ...count, [request.kind]: (count[request.kind] ?? 0) + 1 }), {});

console.log(`Fixtures verified: ${closets.length} closets (${closets.map((closet) => closet.pieces.length).join(", ")} pieces), ${requests.length} requests (${Object.entries(kinds).map(([kind, n]) => `${n} ${kind}`).join(", ")}). ${requests.length} baseline outfits built and valid.`);
console.log(`Fixture set: ${SET}. Commit under test: ${tested.commit}${tested.dirty ? " with uncommitted changes" : ""}.`);
console.log(`To run now: ${todo.length} of ${requests.length}. Already counted: $${run.spend.spentUsd.toFixed(2)} of $${budget.toFixed(2)} (hard cap $${HARD_BUDGET_USD.toFixed(2)}). Models the agent may call: ${models.join(", ")}.`);
console.log(`Estimate: about $${(estimate.typicalUsd * (todo.length / requests.length)).toFixed(2)} for what remains, counted with the 1.5x margin; each call is allowed only if, at its worst ($${estimate.worstCallUsd.toFixed(3)}), the total stays within the budget, so the run stops itself before the cap.`);
console.log(`Rater sheet, key and run file would go to ${OUT} (outside the repository).`);
if (process.env.RACKED_EVAL_CONFIRM !== "yes") {
  // The dry-run check: the same turn with no model at all. It shows what the wardrobe logic does on
  // its own — every outfit valid, every swap exact — and says nothing about which outfit a person prefers.
  const dry = {};
  for (const request of requests) dry[request.id] = { hangerOutfit: cardOf(await answer(request, { agentEnabled: false, agentCall: async () => null })) };
  console.log(`Dry-run check (no model, nothing spent): ${describeChecks(mechanicalChecks(dry, closets, requests))}.`);
  console.log("Nothing was called or written. Set RACKED_EVAL_CONFIRM=yes to run.");
  process.exit(0);
}

if (tested.dirty && process.env.RACKED_EVAL_ALLOW_DIRTY !== "yes") throw new Error("There are uncommitted changes, so no commit describes what would be tested. Commit them, or set RACKED_EVAL_ALLOW_DIRTY=yes to record the run as \"-dirty\".");
if (run.commit && run.commit !== commitLabel && Object.keys(run.records).length) throw new Error(`${RUN_FILE} holds results from commit ${run.commit}, and this is ${commitLabel}. One sheet must not mix two versions of Hanger: use a different RACKED_HANGER_EVAL_DIR.`);
run.set = SET;
run.commit = commitLabel;

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
  const tally = newTally();
  const toolCalls = [];
  let failure = null;
  const metered = meteredAgentCall(bedrockAgentConverse, guard, tally);
  // Every tool call and its arguments are kept in the private run file, so a lost request can be
  // traced to what the model actually asked for rather than reconstructed afterwards.
  const recording = async (sent) => {
    const response = await metered(sent);
    for (const block of response?.content ?? []) if (block.toolUse) toolCalls.push({ name: block.toolUse.name, args: block.toolUse.input });
    return response;
  };
  const turn = await answer(request, { agentEnabled: true, agentCall: recording, onAgentFallback: (details) => { failure = details; } });

  if (tally.refused) {
    save();
    console.log(`Stopped before ${request.id}: another call could pass the budget. Rerun to continue only if the cap allows; counted so far $${run.spend.spentUsd.toFixed(2)}.`);
    stoppedEarly = true;
    break;
  }
  const providerFailed = failure && ["model-error", "no-response"].includes(failure.kind);
  providerFailuresInARow = providerFailed ? providerFailuresInARow + 1 : 0;
  const byAgent = turn.reply.provider === "amazon-bedrock";
  run.records[request.id] = {
    hangerOutfit: cardOf(turn),
    baselineOutfit: baselineOf(request).map((piece) => piece.id),
    reply: turn.reply.message,
    toolsUsed: (turn.reply.toolsUsed ?? []).filter((name) => AGENT_TOOL_NAMES.includes(name)),
    fallback: byAgent ? null : (failure ? { kind: failure.kind, ...(failure.errorName ? { errorName: failure.errorName } : {}) } : { kind: "unknown" }),
    modelCalls: tally.modelCalls,
    toolUses: tally.toolUses,
    corrections: tally.corrections,
    answeredBy: byAgent ? "agent" : "grounded",
    toolCalls,
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
  console.log(`  ${request.id}: ${tally.modelCalls} model calls, ${tally.toolUses} tool calls${byAgent ? "" : `, the agent fell back (${failure?.kind ?? "unknown"}) and the grounded reply answered`} — $${run.spend.spentUsd.toFixed(2)} counted`);
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
console.log(`Done. Fixture set ${SET}, commit ${run.commit}. Counted spend $${run.spend.spentUsd.toFixed(2)}. In ${OUT}:`);
console.log(`Checks that need no rater: ${describeChecks(mechanicalChecks(run.records, closets, requests))}.`);
console.log("  rater-sheet.csv and closets.txt  -> give a copy of both to each of the two raters (never the owner)");
console.log("  key.json and run.json            -> keep private; the scorer needs them, the raters must never see them");
