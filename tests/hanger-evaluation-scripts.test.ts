import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRaterSheet, parseCsv, randomValidOutfit, seededRandom, toCsv, type EvalCloset, type EvalRequest, type RunFile, type RunRecord } from "../lib/hanger-evaluation.ts";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const closets = ["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => JSON.parse(read(`data/hanger-eval/${id}.json`)) as EvalCloset);
const requests = (JSON.parse(read("data/hanger-eval/requests.json")) as { requests: EvalRequest[] }).requests;

const scratch = mkdtempSync(join(tmpdir(), "hanger-eval-test-"));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

/** A script's output, with no AWS access and no confirmation, exactly as a cautious owner would first run it. */
function runScript(script: string, args: string[] = [], env: Record<string, string> = {}) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(AWS_|RACKED_EVAL_CONFIRM|RACKED_HANGER_EVAL|RACKED_EVAL_BUDGET)/.test(name)));
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(root, "scripts", script), ...args], { env: { ...clean, ...env } as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

// ── The runner ─────────────────────────────────────────────────────────────────

test("by default the runner is a dry run: it counts the requests, estimates the cost, and calls and writes nothing", () => {
  const dir = join(scratch, "never-created");
  const run = runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir });
  assert.equal(run.status, 0, run.err);
  assert.match(run.out, /4 closets \(19, 23, 23, 23 pieces\), 40 requests \(16 occasion, 12 weather, 8 swap, 4 impossible\)\. 40 baseline outfits built and valid\./);
  assert.match(run.out, /To run now: 40 of 40\. Already counted: \$0\.00 of \$1\.50 \(hard cap \$1\.50\)/);
  assert.match(run.out, /Estimate: about \$0\.\d\d for what remains/);
  assert.match(run.out, /Nothing was called or written\. Set RACKED_EVAL_CONFIRM=yes to run\./);
  assert.equal(existsSync(dir), false, "a dry run creates nothing");
});

test("any value other than exactly yes is still a dry run", () => {
  for (const value of ["", "y", "YES", "true", "1", "yes "]) {
    const run = runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: join(scratch, "never-created"), RACKED_EVAL_CONFIRM: value });
    assert.equal(run.status, 0, `"${value}": ${run.err}`);
    assert.match(run.out, /Nothing was called or written/, `"${value}" must not start a real run`);
  }
});

test("the printed cap can be lowered by the environment and never raised", () => {
  const dir = join(scratch, "never-created");
  assert.match(runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir, RACKED_EVAL_BUDGET_USD: "0.4" }).out, /of \$0\.40 \(hard cap \$1\.50\)/);
  assert.match(runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir, RACKED_EVAL_BUDGET_USD: "99" }).out, /of \$1\.50 \(hard cap \$1\.50\)/);
});

test("the runner refuses to put the rater sheet and key inside the repository", () => {
  for (const dir of [join(root, "hanger-out"), join(root, "data"), root]) {
    const run = runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir });
    assert.notEqual(run.status, 0, dir);
    assert.match(run.err, /is inside this repository/, dir);
  }
});

test("the runner will not resume a run made with a different seed", () => {
  const dir = join(scratch, "other-seed");
  mkdirSync(dir);
  writeFileSync(join(dir, "run.json"), JSON.stringify({ version: 1, seed: "someone-elses-seed", spend: { spentUsd: 0.5, largestInput: 0, callsSent: 4 }, records: {} }));
  const run = runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir });
  assert.notEqual(run.status, 0);
  assert.match(run.err, /was made with seed "someone-elses-seed"/);
});

test("a resumed run reports what is already counted and only what remains", () => {
  const dir = join(scratch, "resumed");
  mkdirSync(dir);
  const records = Object.fromEntries(requests.slice(0, 10).map((request) => [request.id, {}]));
  writeFileSync(join(dir, "run.json"), JSON.stringify({ version: 1, seed: "racked-hanger-eval-1", spend: { spentUsd: 0.31, largestInput: 4000, callsSent: 22 }, records }));
  const run = runScript("run-hanger-evaluation.mjs", [], { RACKED_HANGER_EVAL_DIR: dir });
  assert.equal(run.status, 0, run.err);
  assert.match(run.out, /To run now: 30 of 40\. Already counted: \$0\.31 of \$1\.50/);
});

test("the runner reaches Bedrock only after the confirmation check, and sends no model request itself", () => {
  const source = read("scripts/run-hanger-evaluation.mjs");
  const confirm = source.indexOf('process.env.RACKED_EVAL_CONFIRM !== "yes"');
  assert.ok(confirm > 0);
  assert.ok(source.indexOf("new BedrockRuntimeClient(") > confirm, "no client is built before the check");
  assert.ok(source.indexOf("runHangerAgent(") > confirm, "no agent turn runs before the check");
  assert.ok(source.indexOf('process.env.AI_PROVIDER = "bedrock"') > confirm, "the agent is not even enabled before the check");
  assert.doesNotMatch(source, /ConverseCommand|\.send\(/, "every model call goes through the metered agent call");
  assert.match(source, /meteredAgentCall\(bedrockAgentConverse, guard, tally\)/);
  assert.match(source, /if \(tally\.refused\)/, "a refused call stops the run");
});

// ── The scorer ─────────────────────────────────────────────────────────────────

/** A finished fake run on the real fixtures, with two raters' sheets, in a scratch folder. */
function finishedRun(name: string, seed = "racked-hanger-eval-1") {
  const dir = join(scratch, name);
  mkdirSync(dir);
  const records: Record<string, RunRecord> = {};
  for (const request of requests) {
    const closet = closets.find((entry) => entry.id === request.closet)!;
    const ids = (label: string) => randomValidOutfit(closet.pieces, request, seededRandom(seed, label)).map((piece) => piece.id);
    records[request.id] = {
      hangerOutfit: request.id === "b-10" ? null : ids(`fake-hanger:${request.id}`), baselineOutfit: ids(`baseline:${request.id}`),
      reply: "A made-up reply.", toolsUsed: ["outfit builder"], fallback: null, modelCalls: 2, toolUses: 1, corrections: 0,
    };
  }
  const run: RunFile = { version: 1, seed, spend: { spentUsd: 0.42, largestInput: 3500, callsSent: 80 }, records };
  const { csv, key } = buildRaterSheet({ seed, closets, requests, records });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run));
  writeFileSync(join(dir, "key.json"), JSON.stringify(key));
  const fill = (name: string, choose: (index: number) => string) => {
    const rows = parseCsv(csv).map((row, index) => (index === 0 ? row : [row[0], row[1], row[2], row[3], choose(index), `reason, with "quotes"\nand a line break (${index})`]));
    writeFileSync(join(dir, name), toCsv(rows));
    return join(dir, name);
  };
  return { dir, fill, csv };
}

test("the scorer turns two filled sheets into aggregates-only JSON and a results page, from a run made outside the repo", () => {
  const { dir, fill } = finishedRun("scored");
  const one = fill("rater1.csv", (index) => (index % 7 === 0 ? "tie" : index % 3 === 0 ? "B" : "A"));
  const two = fill("rater2.csv", (index) => (index % 5 === 0 ? "tie" : index % 2 === 0 ? "B" : "A"));
  const outJson = join(dir, "out.json"), outMd = join(dir, "out.md");
  const run = runScript("score-hanger-evaluation.mjs", ["--dir", dir, "--rater-1", one, "--rater-2", two, "--date", "2026-11-02", "--out-json", outJson, "--out-md", outMd]);
  assert.equal(run.status, 0, run.err);
  assert.match(run.out, /Hanger was preferred on \d+ of \d+ decided answerable requests: [\d.]+% \(95% CI [\d.]+–[\d.]+%\); \d+ tied\./);
  assert.match(run.out, /Rater agreement: kappa [-\d.]+, same answer on [\d.]+% of requests\./);

  const report = JSON.parse(readFileSync(outJson, "utf8"));
  assert.equal(report.date, "2026-11-02");
  assert.equal(report.headline.requests, 36, "the four impossible asks are reported apart");
  assert.equal(report.allRequests.requests, 40);
  assert.equal(report.impossibleAsks.requests, 4);
  assert.equal(report.impossibleAsks.hangerOfferedNone, 1);
  assert.equal(report.raters, 2);
  assert.equal(report.toolUse.turns, 40);
  assert.equal(report.toolUse.countedSpendUsd, 0.42);
  const pieceNames = closets.flatMap((closet) => closet.pieces.map((piece) => piece.name));
  const raw = readFileSync(outJson, "utf8");
  assert.ok(!pieceNames.some((name) => raw.includes(name)), "the published JSON holds aggregates, no outfits");
  assert.doesNotMatch(raw, /reason, with|A made-up reply/);

  const markdown = readFileSync(outMd, "utf8");
  assert.match(markdown, /^# Hanger evaluation results/);
  assert.match(markdown, /## Where Hanger lost/);
  assert.match(markdown, /Rater 1 chose/);
  assert.match(markdown, /Cohen's kappa/);
  assert.match(markdown, /40 synthetic requests across 4 synthetic closets/);
});

test("the scorer refuses to score a sheet with a missing choice, and writes nothing", () => {
  const { dir, fill } = finishedRun("incomplete");
  const good = fill("good.csv", () => "A");
  const gaps = fill("gaps.csv", (index) => (index === 3 || index === 9 ? "" : "B"));
  const outJson = join(dir, "never.json"), outMd = join(dir, "never.md");
  const run = runScript("score-hanger-evaluation.mjs", ["--dir", dir, "--rater-1", good, "--rater-2", gaps, "--out-json", outJson, "--out-md", outMd]);
  assert.equal(run.status, 1);
  assert.match(run.err, /Not scoring: 2 problems/);
  assert.match(run.err, /rater 2: a-03: choice must be A, B or tie/);
  assert.match(run.err, /rater 2: a-09: choice must be A, B or tie/);
  assert.equal(existsSync(outJson) || existsSync(outMd), false);
});

test("the scorer refuses the same file twice, and a key from a different run", () => {
  const { dir, fill } = finishedRun("misuse");
  const sheet = fill("one.csv", () => "A");
  const twice = runScript("score-hanger-evaluation.mjs", ["--dir", dir, "--rater-1", sheet, "--rater-2", sheet, "--out-json", join(dir, "x.json"), "--out-md", join(dir, "x.md")]);
  assert.notEqual(twice.status, 0);
  assert.match(twice.err, /are the same file/);
  const missing = runScript("score-hanger-evaluation.mjs", ["--dir", dir, "--rater-1", sheet]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.err, /Give both filled sheets/);

  const other = finishedRun("other-run", "a-different-seed");
  const foreign = other.fill("foreign.csv", () => "B");
  const crossed = runScript("score-hanger-evaluation.mjs", ["--dir", dir, "--rater-1", sheet, "--rater-2", foreign, "--out-json", join(dir, "y.json"), "--out-md", join(dir, "y.md")]);
  assert.equal(crossed.status, 1);
  assert.match(crossed.err, /rater 2: .*its outfits differ from the sheet this key was made for/);
});

// ── Lanes and docs ─────────────────────────────────────────────────────────────

test("AGENTS.md names both evaluation scripts in the temporary lane exception, and the how-to says raters must not be the owner", () => {
  const exception = read("AGENTS.md").split("\n").find((line) => line.startsWith("| **Claude Code, temporary**"))!;
  assert.ok(exception, "the temporary lane row exists");
  assert.ok(exception.includes("`scripts/run-hanger-evaluation.mjs`") && exception.includes("`scripts/score-hanger-evaluation.mjs`"));
  const guide = read("docs/hanger-evaluation.md");
  assert.match(guide, /must not be the owner/i);
  assert.match(guide, /cannot prove/i);
  assert.match(guide, /RACKED_EVAL_CONFIRM=yes/);
  assert.match(guide, /\$1\.50/);
});
