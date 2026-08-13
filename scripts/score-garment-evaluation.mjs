import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scoreGarmentEvaluation } from "../lib/evaluation-dataset.ts";

const [manifestArgument, predictionsArgument, outputArgument] = process.argv.slice(2);
if (!manifestArgument || !predictionsArgument) {
  console.error("Usage: pnpm eval:score <manifest.json> <predictions.json> [report.json]");
  process.exitCode = 1;
} else {
  const manifestPath = resolve(manifestArgument);
  const predictionsPath = resolve(predictionsArgument);
  const outputPath = resolve(outputArgument ?? "evaluation-report.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const predictions = JSON.parse(await readFile(predictionsPath, "utf8"));
  if (!Array.isArray(manifest) || !Array.isArray(predictions)) {
    throw new TypeError("Manifest and predictions files must both contain JSON arrays.");
  }
  const report = scoreGarmentEvaluation(manifest, predictions);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}
