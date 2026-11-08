/**
 * Judges see five minutes of Racked. The demo commits to one consumer flow and one brand flow, and
 * everything else is listed as an additional live feature. A skeptical judge also asks which "agent" actions really call
 * a model. These tests keep both answers in the README, the AI use log, and the script.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildWearUsageAnalytics, releaseWearAnalytics } from "../lib/metrics.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const section = (start: string, end: string) => readme.slice(readme.indexOf(start), readme.indexOf(end));

test("the judge path is the two committed flows and nothing else", () => {
  const path = section("## Five-Minute Judge Path", "## Demo Access");
  assert.match(path, /A person: scan → confirm → recommendation/);
  assert.match(path, /A brand: anonymous cohort → wear evidence → campaign brief/);
  for (const offPath of ["Community", "Recreate", "Shop the Look", "Demo Bag", "storefront"]) {
    assert.doesNotMatch(path, new RegExp(offPath), `${offPath} is an additional live feature, not the demo path`);
  }
});

test("everything outside the demo is listed as a live feature, apart from future work, with Community private by default", () => {
  const live = section("## Additional Live Features", "### Next Steps");
  for (const feature of ["Community & Recreate", "Shop the Look", "Brand linking", "Brand enrollment", "Batch scanning"]) {
    assert.ok(live.includes(feature), `${feature} is listed as live`);
  }
  assert.match(live, /^Built, live and tested, but outside the five-minute demo:$/m);
  assert.match(live, /Private by default:/);
  assert.match(live, /\*\*Unpublish\*\* takes it down again at any time/, "and sharing can be taken back");
  assert.doesNotMatch(readme, /## Roadmap|\]\(#roadmap\)/, "REGRESSION: built features were labelled roadmap, which reads as unbuilt");
  assert.match(section("### Next Steps", "## How AI Is Used"), /^Not built yet:/m, "future work is labelled apart");
});

test("the judge path says where to start and which demo account each flow uses", () => {
  const path = section("## Five-Minute Judge Path", "**A person: scan");
  assert.match(path, /\[sign-in page\]\(https:\/\/main\.d2iv0khybuuaeh\.amplifyapp\.com\/login\)/);
  assert.match(path, /choose \*\*Judge Consumer\*\* for the first flow, then \*\*Judge Brand\*\* for the second/);
});

test("the synthetic cohort table is labelled raw, and says what the release rules withhold", () => {
  // A 25-owner cohort with 22 active owners and 19 repeat wearers, as the seed defines: 3 owners never
  // wore it and 3 wore it once. The exact spread of the others does not change what is withheld.
  const counts = [0, 0, 0, 1, 1, 1, ...Array(17).fill(4), 3, 2];
  const now = new Date("2026-11-08T12:00:00Z");
  const dates = Array.from({ length: 76 }, (_, i) => new Date(now.getTime() - (i % 50) * 86_400_000).toISOString());
  const raw = buildWearUsageAnalytics(counts, dates, now);
  assert.equal(counts.reduce((sum, value) => sum + value, 0), 76);
  assert.deepEqual([raw.activeOwners, raw.engagementRate, raw.repeatWearRate, raw.zeroWearOwners], [22, 88, 76, 3], "the raw figures the README prints");
  const released = releaseWearAnalytics(counts, dates, now);
  for (const field of ["engagementRate", "repeatWearRate", "zeroWearOwners", "activeOwners", "actualWears"] as const) {
    assert.equal(released[field], null, `${field} is withheld for this cohort`);
  }
  const block = section("**Synthetic demo cohort.**", "Before the benchmark");
  assert.match(block, /\*\*raw synthetic seed values\*\*/);
  assert.doesNotMatch(block, /what a brand would see/, "REGRESSION: the raw seed figures were presented as released");
  const rows = block.split("\n").filter((line) => /^\| (Engagement|Repeat use|Zero-wear)/.test(line));
  assert.equal(rows.length, 3);
  for (const row of rows) assert.match(row, /\| Withheld \|$/);
});

test("every break-even illustration uses whole units that cover the $480 year", () => {
  assert.ok(19 * 25 < 40 * 12 && 20 * 25 >= 40 * 12, "20 units at $25 are the first to cover $480");
  for (const path of ["README.md", "docs/one-page-summary.md", "docs/sustainability-and-business-impact.md", "docs/demo-script.md"]) {
    const text = read(path);
    assert.doesNotMatch(text, /\b19 excess units/, `REGRESSION: ${path} said 19 units, $5 short of the $480 year`);
    assert.match(text, /\b20 excess units/, `${path} gives the corrected figure`);
  }
});

test("the README and the AI use log say plainly which actions call a model", () => {
  const table = section("### What calls a model, and what does not", "> **Is the AI trained");
  assert.match(table, /Only the consumer Hanger is an agent/);
  const rows = table.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Action") && !line.startsWith("| ---"));
  assert.ok(rows.length >= 10, "one row per action");
  const modelRows = rows.filter((row) => row.split("|")[2].includes("**Yes"));
  assert.equal(modelRows.length, 3, "exactly three actions call a model: garment detection, the consumer Hanger, Brand Hanger");
  for (const deterministic of ["Looks: today's pick", "Verifying a brand product", "Whether a brand may see an aggregate"]) {
    const row = rows.find((line) => line.includes(deterministic));
    assert.ok(row && row.split("|")[2].trim().startsWith("No"), `${deterministic} is deterministic`);
  }
  const log = read("docs/ai-use-log.md");
  assert.ok(log.indexOf("## What calls a model, and what does not") < log.indexOf("## Garment vision"), "the AI use log opens with it");
  assert.match(log, /only the consumer Hanger is an agent/);
});

test("the presentation script follows the same two flows and keeps the other live features to the close", () => {
  const script = read("docs/demo-script.md");
  assert.match(script, /## 0:30–2:15 — A person: scan, confirm, recommendation/);
  assert.match(script, /## 2:15–3:45 — A brand: anonymous cohort, wear evidence, campaign brief/);
  assert.match(script, /## 4:30–5:00 — Close, and what else is live/);
  assert.match(script, /You call them agents/, "the agent question has a prepared answer");
  assert.match(script, /public outfit feed at odds with privacy-first/, "and so does the privacy question");
});

test("the orphaned partner placeholder pages are gone", () => {
  assert.ok(!existsSync(new URL("../app/partners", import.meta.url)));
  assert.doesNotMatch(read("app/page.tsx"), /\/partners/);
  assert.doesNotMatch(read("app/community/page.tsx"), /\/partners/);
});
