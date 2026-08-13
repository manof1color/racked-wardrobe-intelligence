import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeSecondHandAnnotation, SECOND_HAND_FASHION_DATASET } from "../lib/evaluation-dataset.ts";

const [inputDirectoryArgument, outputArgument] = process.argv.slice(2);
if (!inputDirectoryArgument) {
  console.error("Usage: node --experimental-strip-types scripts/audit-second-hand-label-coverage.mjs <rows-directory> [report.json]");
  process.exitCode = 1;
} else {
  const inputDirectory = resolve(inputDirectoryArgument);
  const files = (await readdir(inputDirectory)).filter((name) => /^hf-rows-\d+\.json$/i.test(name)).sort();
  const sourceTypes = new Map();
  const categories = new Map();
  let rows = 0;
  let categoryEligible = 0;
  let subtypeEligible = 0;
  let brandEligible = 0;

  for (const file of files) {
    const response = JSON.parse(await readFile(resolve(inputDirectory, file), "utf8"));
    for (const wrapper of Array.isArray(response.rows) ? response.rows : []) {
      const annotation = wrapper?.row;
      if (!annotation || typeof annotation !== "object") continue;
      rows += 1;
      const sourceType = String(annotation.type ?? "unknown");
      sourceTypes.set(sourceType, (sourceTypes.get(sourceType) ?? 0) + 1);
      const truth = normalizeSecondHandAnnotation(annotation);
      categories.set(truth.category, (categories.get(truth.category) ?? 0) + 1);
      if (truth.category !== "unknown") categoryEligible += 1;
      if (truth.subtype) subtypeEligible += 1;
      if (truth.brand) brandEligible += 1;
    }
  }

  const sortedCounts = (entries) => Object.fromEntries([...entries].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
  const ratio = (count) => rows ? Number((count / rows).toFixed(4)) : null;
  const report = {
    source: SECOND_HAND_FASHION_DATASET.name,
    sourceVersion: SECOND_HAND_FASHION_DATASET.version,
    mirror: "fnauman/fashion-second-hand-front-only-rgb",
    purpose: "taxonomy-label coverage audit; not model accuracy",
    sampledRows: rows,
    sampleFiles: files,
    categoryEligible,
    categoryCoverage: ratio(categoryEligible),
    subtypeEligible,
    subtypeCoverage: ratio(subtypeEligible),
    brandTextEligible: brandEligible,
    brandTextCoverage: ratio(brandEligible),
    mappedCategories: sortedCounts(categories),
    sourceTypes: sortedCounts(sourceTypes),
  };
  if (outputArgument) await writeFile(resolve(outputArgument), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}
