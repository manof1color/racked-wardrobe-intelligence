// Builds the locked case set for the live-path recognition benchmark (work order W2). No model is
// called and nothing in AWS is touched: it reads public dataset metadata, downloads only the sampled
// front photos to a folder OUTSIDE the repository, and writes the manifest and lock that a later run
// must match exactly. Commit the manifest and lock before running the benchmark.
//
//   node --experimental-strip-types scripts/build-live-evaluation-set.mjs [--pilot <labels.csv>]
//
// RACKED_EVAL_IMAGES sets the photo folder (default ../racked-eval-images). The pilot CSV has the
// header `file,category,subtype,pieces,conditions` (conditions separated by ";"), and its photos sit
// beside it. An existing lock is never replaced unless --relock is given before any run.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deterministicEvaluationSample, normalizeSecondHandAnnotation, SECOND_HAND_FASHION_DATASET } from "../lib/evaluation-dataset.ts";
import { createLock } from "../lib/live-evaluation.ts";
import { normalizeGarmentClassification } from "../lib/garment-taxonomy.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIRROR = "fnauman/fashion-second-hand-front-only-rgb";
const EXTERNAL_CASES = 300;
const WINDOWS = 10, WINDOW_ROWS = 100;
const MANIFEST = join(ROOT, "data/evaluation-live-manifest.json");
const LOCK = join(ROOT, "data/evaluation-lock.json");
const IMAGES = resolve(process.env.RACKED_EVAL_IMAGES ?? join(ROOT, "..", "racked-eval-images"));
const args = process.argv.slice(2);
const pilotCsv = args.includes("--pilot") ? resolve(args[args.indexOf("--pilot") + 1] ?? "") : null;

if (existsSync(LOCK) && !args.includes("--relock")) throw new Error("data/evaluation-lock.json already exists. Answers are locked; use --relock only if no benchmark has run yet.");
if (IMAGES.startsWith(ROOT)) throw new Error("Keep the photos outside the repository (RACKED_EVAL_IMAGES).");
await mkdir(IMAGES, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rowsUrl = (offset, length) => `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(MIRROR)}&config=default&split=train&offset=${offset}&length=${length}`;

// Ten evenly spaced windows of 100 metadata rows, as in the label-coverage audit.
const first = await (await fetch(rowsUrl(0, 1))).json();
const total = Number(first.num_rows_total);
if (!Number.isSafeInteger(total) || total < WINDOWS * WINDOW_ROWS) throw new Error("The dataset mirror did not report its size.");
const candidates = [];
for (let window = 0; window < WINDOWS; window++) {
  const offset = Math.floor((window * (total - WINDOW_ROWS)) / (WINDOWS - 1));
  const page = await (await fetch(rowsUrl(offset, WINDOW_ROWS))).json();
  for (const wrapper of page.rows ?? []) {
    const truth = normalizeSecondHandAnnotation(wrapper.row ?? {});
    if (truth.category === "unknown" || !wrapper.row?.image?.src) continue;
    candidates.push({ externalId: `hf3-row-${wrapper.row_idx}`, row: wrapper.row_idx, src: wrapper.row.image.src, truth });
  }
}
const sample = deterministicEvaluationSample(candidates, EXTERNAL_CASES);
console.log(`${candidates.length} labelled candidates in ${WINDOWS} windows; sampling ${sample.length}.`);

const cases = [];
for (const [index, candidate] of sample.entries()) {
  const response = await fetch(candidate.src);
  if (!response.ok) throw new Error(`Photo for ${candidate.externalId} did not download (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const image = `${candidate.externalId}.jpg`;
  await writeFile(join(IMAGES, image), bytes);
  cases.push({
    id: candidate.externalId, set: "external", image, imageSha256: hash(bytes),
    truth: { category: candidate.truth.category, ...(candidate.truth.subtype ? { subtype: candidate.truth.subtype } : {}), pieces: 1 },
    source: { dataset: `${SECOND_HAND_FASHION_DATASET.name} v${SECOND_HAND_FASHION_DATASET.version} (${SECOND_HAND_FASHION_DATASET.license})`, mirror: MIRROR, row: candidate.row },
  });
  if ((index + 1) % 50 === 0) console.log(`  ${index + 1} photos downloaded`);
}

if (pilotCsv) {
  const [header, ...lines] = (await readFile(pilotCsv, "utf8")).trim().split(/\r?\n/);
  if (header.trim() !== "file,category,subtype,pieces,conditions") throw new Error("The pilot CSV header must be: file,category,subtype,pieces,conditions");
  for (const line of lines) {
    const [file, category, subtype, pieces, conditions] = line.split(",").map((cell) => cell.trim());
    const count = Number(pieces);
    if (!file || !category || !Number.isSafeInteger(count) || count < 1) throw new Error(`Incomplete pilot label: ${line}`);
    const bytes = await readFile(join(dirname(pilotCsv), file));
    const image = `pilot-${file}`;
    await copyFile(join(dirname(pilotCsv), file), join(IMAGES, image));
    // Labels are mapped onto the same controlled taxonomy the scan answers in.
    const label = normalizeGarmentClassification(category, subtype || category);
    if (label.category === "unknown") throw new Error(`Unrecognised category in pilot label: ${line}`);
    cases.push({ id: `pilot-${file.replace(/\.[^.]+$/, "")}`, set: "pilot", image, imageSha256: hash(bytes), truth: { category: label.category, ...(subtype && !label.subtype.startsWith("other-") ? { subtype: label.subtype } : {}), pieces: count, ...(conditions ? { conditions: conditions.split(";").map((value) => value.trim()).filter(Boolean) } : {}) } });
  }
}

await writeFile(MANIFEST, `${JSON.stringify(cases, null, 2)}\n`);
await writeFile(LOCK, `${JSON.stringify(createLock(cases, new Date().toISOString()), null, 2)}\n`);
console.log(`Wrote ${cases.length} cases (${cases.filter((entry) => entry.set === "pilot").length} pilot). Photos are in ${IMAGES}. Commit data/evaluation-live-manifest.json and data/evaluation-lock.json before running the benchmark.`);
