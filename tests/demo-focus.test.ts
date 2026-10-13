/**
 * Judges see five minutes of Racked. The demo commits to one consumer flow and one brand flow, and
 * everything else is labelled roadmap. A skeptical judge also asks which "agent" actions really call
 * a model. These tests keep both answers in the README, the AI use log, and the script.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const section = (start: string, end: string) => readme.slice(readme.indexOf(start), readme.indexOf(end));

test("the judge path is the two committed flows and nothing else", () => {
  const path = section("## Five-Minute Judge Path", "## Demo Access");
  assert.match(path, /A person: scan → confirm → recommendation/);
  assert.match(path, /A brand: anonymous cohort → wear evidence → campaign brief/);
  for (const offPath of ["Community", "Recreate", "Shop the Look", "Demo Bag", "storefront"]) {
    assert.doesNotMatch(path, new RegExp(offPath), `${offPath} is roadmap, not the demo path`);
  }
});

test("everything outside the demo is listed as roadmap, with Community private by default", () => {
  const roadmap = section("## Roadmap", "## How AI Is Used");
  for (const feature of ["Community & Recreate", "Shop the Look", "Brand linking", "Brand enrollment", "Batch scanning"]) {
    assert.ok(roadmap.includes(feature), `${feature} is on the roadmap`);
  }
  assert.match(roadmap, /Private by default:/);
  assert.match(roadmap, /\*\*Unpublish\*\* takes it down again at any time/, "and sharing can be taken back");
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

test("the presentation script follows the same two flows and keeps the roadmap to the close", () => {
  const script = read("docs/demo-script.md");
  assert.match(script, /## 0:30–2:15 — A person: scan, confirm, recommendation/);
  assert.match(script, /## 2:15–3:45 — A brand: anonymous cohort, wear evidence, campaign brief/);
  assert.match(script, /## 4:30–5:00 — Close, and the roadmap/);
  assert.match(script, /You call them agents/, "the agent question has a prepared answer");
  assert.match(script, /public outfit feed at odds with privacy-first/, "and so does the privacy question");
});

test("the orphaned partner placeholder pages are gone", () => {
  assert.ok(!existsSync(new URL("../app/partners", import.meta.url)));
  assert.doesNotMatch(read("app/page.tsx"), /\/partners/);
  assert.doesNotMatch(read("app/community/page.tsx"), /\/partners/);
});
