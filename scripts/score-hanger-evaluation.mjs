// Hanger blind evaluation, scorer (work order W7). Reads the two raters' filled sheets and the private
// key and run file the runner wrote, and publishes: Hanger's win rate over the random baseline with a
// 95% Wilson interval, inter-rater agreement (Cohen's kappa), the losing cases with the raters' reasons,
// and how Hanger used its tools.
//
//   node --experimental-strip-types scripts/score-hanger-evaluation.mjs --rater-1 <sheet.csv> --rater-2 <sheet.csv>
//
// Options:
//   --dir <folder>        where the runner put key.json and run.json (default RACKED_HANGER_EVAL_DIR, else ../racked-hanger-eval)
//   --date YYYY-MM-DD     the date for the output file name (default: today, UTC)
//   --out-json <file>     default data/hanger-evaluation-<date>.json  (aggregates only)
//   --out-md <file>       default docs/hanger-evaluation-results.md   (includes the losing cases)
//
// It refuses to score if either sheet has a missing or unreadable choice, or does not belong to the key:
// leaving a request out quietly would bias the result. Nothing here calls AWS.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRaterSheet, renderResultsMarkdown, scoreEvaluation } from "../lib/hanger-evaluation.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const sheetPaths = [option("--rater-1"), option("--rater-2")];
if (sheetPaths.some((path) => !path)) throw new Error("Give both filled sheets: --rater-1 <sheet.csv> --rater-2 <sheet.csv>.");
const [first, second] = sheetPaths.map((path) => resolve(path));
if (first === second) throw new Error("--rater-1 and --rater-2 are the same file. Agreement between a rater and themself means nothing.");

const DIR = resolve(option("--dir") ?? process.env.RACKED_HANGER_EVAL_DIR ?? join(ROOT, "..", "racked-hanger-eval"));
const date = option("--date") ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must look like 2026-10-31.");
const outJson = resolve(option("--out-json") ?? join(ROOT, "data", `hanger-evaluation-${date}.json`));
const outMd = resolve(option("--out-md") ?? join(ROOT, "docs", "hanger-evaluation-results.md"));

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const key = readJson(join(DIR, "key.json"));
const run = readJson(join(DIR, "run.json"));
const closets = ["closet-a", "closet-b", "closet-c", "closet-d"].map((id) => readJson(join(ROOT, "data", "hanger-eval", `${id}.json`)));
const requests = readJson(join(ROOT, "data", "hanger-eval", "requests.json")).requests;
if (run.seed !== key.seed) throw new Error("run.json and key.json were made with different seeds; they are not from the same run.");

const sheets = [first, second].map((path) => parseRaterSheet(readFileSync(path, "utf8"), key));
const failed = sheets.flatMap((sheet, index) => sheet.problems.map((problem) => `rater ${index + 1}: ${problem}`));
if (failed.length) {
  console.error(`Not scoring: ${failed.length} problem${failed.length === 1 ? "" : "s"} in the sheets.\n${failed.slice(0, 20).join("\n")}${failed.length > 20 ? `\n…and ${failed.length - 20} more` : ""}`);
  process.exit(1);
}

const { report, losing } = scoreEvaluation({ key, run, raters: [sheets[0].choices, sheets[1].choices], closets, requests, date });
writeFileSync(outJson, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(outMd, renderResultsMarkdown(report, losing));

const h = report.headline;
const rate = h.winRate ? `${(h.winRate.rate * 100).toFixed(1)}% (95% CI ${(h.winRate.low * 100).toFixed(1)}–${(h.winRate.high * 100).toFixed(1)}%)` : "no decided requests";
console.log(`Hanger was preferred on ${h.hangerWins} of ${h.hangerWins + h.baselineWins} decided answerable requests: ${rate}; ${h.ties} tied.`);
console.log(`Rater agreement: kappa ${report.agreement.kappa === null ? "undefined" : report.agreement.kappa.toFixed(2)}, same answer on ${(report.agreement.observed * 100).toFixed(1)}% of requests. Hanger lost ${losing.length}.`);
console.log(`Wrote ${outJson}\nWrote ${outMd}\nThe losing cases quote the raters' reasons verbatim; read them before committing.`);
