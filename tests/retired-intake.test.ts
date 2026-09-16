import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path: string) => existsSync(new URL(`../${path}`, import.meta.url));

// The three-photo flow stopped being reachable when intake became one photo. Its component and
// the two routes only it called are removed, not merely unused, so nothing can drift back.
test("the retired three-photo intake is gone, not merely unused", () => {
  assert.equal(exists("components/three-view-uploader.tsx"), false);
  assert.equal(exists("app/api/garments/classify/route.ts"), false);
  assert.equal(exists("app/api/garments/analyze/route.ts"), false);
  assert.ok(!("garmentAnalyze" in RATE_LIMIT_RULES) && !("garmentClassify" in RATE_LIMIT_RULES), "their rate limits went with them");
  assert.doesNotMatch(read("app/globals.css"), /\.(three-view-(flow|grid)|photo-plan(-meta|-requests)?|view-upload|evidence-grid)(?![\w-])/, "and so did their styles");
});

test("what the retirement must not take with it is still there", () => {
  // The scan's category list, the evaluation benchmark path, and the brand-cohort privacy tests
  // all live in modules the first cut list wrongly marked as dead.
  assert.match(read("components/garment-intake.tsx"), /PLANNED_CATEGORIES/);
  assert.match(read("scripts/run-garment-evaluation.mjs"), /analyzeGarmentImages/);
  assert.equal(exists("lib/agents.ts"), true);
  assert.match(read("components/garment-intake.tsx"), /import type \{ GarmentOverrides \} from "@\/lib\/types";/);
});

// REGRESSION: the demo script told the presenter to tap an "AI photo plan" button that no longer
// existed, which would have failed live in front of judges.
test("REGRESSION: judge-facing docs describe the intake that actually ships", () => {
  assert.doesNotMatch(read("docs/demo-script.md"), /AI photo plan/);
  assert.doesNotMatch(read("docs/demo-checklist.md"), /photo plan reverts/);
  const readme = read("README.md");
  assert.doesNotMatch(readme, /`\/classify`|app\/api\/garments\/(classify|analyze)\//);
  assert.doesNotMatch(readme, /An optional AI photo plan proposes/);
  assert.doesNotMatch(read("docs/backend-api.md"), /POST \/api\/garments\/(classify|analyze)/);
});
