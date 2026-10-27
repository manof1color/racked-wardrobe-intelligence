import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { buildWearUsageAnalytics } from "../lib/metrics.ts";
import { MAX_SCAN_PHOTOS, MAX_BATCH_PIECES } from "../lib/look-scan-batch.ts";
import { MINIMUM_COHORT_SIZE } from "../lib/privacy.ts";
import { SHOE_KNOWLEDGE } from "../lib/shoe-knowledge.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");

test("README test counts agree with the other current judge documents and test-file inventory", () => {
  const count = readme.match(/\*\*(\d+) passing tests\*\* in (\d+) files \(verified (\d{4}-\d{2}-\d{2})\)/);
  assert.ok(count, "the measured total and file count must be stated");
  assert.equal(Number(count[2]), readdirSync(new URL("../tests/", import.meta.url)).filter(name => name.endsWith(".test.ts")).length);
  assert.ok(readme.includes(`**${count[1]} tests** in ${count[2]} files`));
  assert.ok(readme.includes(`${count[2]} test files, ${count[1]} tests`));
  assert.ok(read("docs/one-page-summary.md").includes(`**${count[1]} tests`));
  assert.ok(read("docs/demo-script.md").includes(`${count[1]} tests in ${count[2]} files`));
  assert.ok(read("docs/demo-script.md").includes(`Verification snapshot (${count[3]})`));
  assert.ok(read("docs/competition-checklist.md").includes(`re-verified ${count[3]}`));
  assert.ok(read("docs/competition-checklist.md").includes(`Measured coverage (${count[3]})`));
  assert.ok(readme.includes(`over the whole suite (${count[3]})`));
  assert.ok(readme.includes(`**Last updated:** ${count[3]}`));
  assert.match(readme, /\*\*\d+ merged PRs\*\* counted on \d{4}-\d{2}-\d{2} before this documentation merge/);
  assert.doesNotMatch(readme, /\b(?:finds|finding) every garment\b/i);
  assert.ok(read("docs/competition-checklist.md").includes(`${count[1]} automated tests`));
});

test("README synthetic hero metrics are recomputed from the seed's wear pattern by the app's analytics", () => {
  const seed = read("scripts/seed-test-cohort.mjs");
  const pattern = seed.match(/wearPattern=(\[[\d,]+\])/);
  const owners = seed.match(/for\(let index=1;index<=(\d+);index\+\+\)/);
  assert.ok(pattern && owners, "read the actual seed inputs, never execute the live-writing seed");
  const counts = JSON.parse(pattern[1]) as number[];
  const cohortSize = Number(owners[1]);
  const wearCounts = Array.from({ length: cohortSize }, (_, index) => counts[index % counts.length]);
  const metrics = buildWearUsageAnalytics(wearCounts, []);
  const repeatOwners = wearCounts.filter(count => count >= 2).length;
  assert.ok(readme.includes(`${metrics.actualWears} confirmed wears across ${cohortSize} opted-in owners`));
  assert.ok(readme.includes(`${metrics.activeOwners} of ${cohortSize} active owners (${metrics.engagementRate}%)`));
  assert.ok(readme.includes(`${repeatOwners} of ${cohortSize} repeat wearers (${metrics.repeatWearRate}%)`));
  assert.ok(readme.includes(`${metrics.zeroWearOwners} of ${cohortSize} owners`));
  assert.match(readme, /seed expectations, not a live-table audit or real-user statistics/);
});

test("README label-coverage percentages match the committed audit counts rather than model accuracy", () => {
  const audit = JSON.parse(read("data/evaluation-label-coverage.json")) as Record<string, number>;
  assert.ok(readme.includes(audit.sampledRows.toLocaleString("en-US")));
  for (const [eligible, reported] of [["categoryEligible", "categoryCoverage"], ["subtypeEligible", "subtypeCoverage"], ["brandTextEligible", "brandTextCoverage"]]) {
    const fraction = audit[eligible] / audit.sampledRows;
    assert.equal(audit[reported], fraction);
    assert.ok(readme.includes(`**${(fraction * 100).toFixed(1)}%**`));
  }
  assert.match(readme, /benchmark compatibility, not model accuracy/);
});

test("README operational limits, progress phase, and proposed prices match their source files", () => {
  assert.ok(readme.includes(`at least ${MINIMUM_COHORT_SIZE} opted-in owners`));
  assert.ok(readme.toLowerCase().includes(`up to **${MAX_SCAN_PHOTOS} photos**`));
  assert.ok(readme.includes(`bounded at ${MAX_BATCH_PIECES} pieces`));
  assert.ok(readme.includes(`${SHOE_KNOWLEDGE.length} generic shoe classes`));
  const phases = [...read("PROGRESS.md").matchAll(/^## Phase (\d+)\b/gm)].map(match => Number(match[1]));
  assert.ok(readme.includes(`through Phase ${Math.max(...phases)}`));
  const prices = [...read("app/pricing/page.tsx").matchAll(/tier: "([^"]+)", price: "([^"]+)"/g)];
  assert.ok(prices.length > 0);
  for (const [, tier, price] of prices) assert.ok(readme.includes(`| ${tier} | ${price} |`));
});
