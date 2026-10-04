/**
 * The README is how a judge finds everything: a scorecard that maps each rubric category to the
 * code, tests, and documents that prove it. A link that rots when a file moves sends a judge to a
 * 404 at exactly the moment they are scoring. These tests keep every link a judge can follow alive.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens, repeats numbered. */
function headingAnchors(markdown: string) {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("```")) { fenced = !fenced; continue; }
    const heading = fenced ? null : /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = heading[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count ? `${base}-${count}` : base);
  }
  return anchors;
}

function brokenLinks(path: string) {
  const markdown = read(path);
  const anchors = headingAnchors(markdown);
  const broken: string[] = [];
  for (const [, link] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(?:https?:|mailto:)/.test(link)) continue;
    if (link.startsWith("#")) {
      if (!anchors.has(link.slice(1))) broken.push(link);
      continue;
    }
    if (!existsSync(join(root, dirname(path), link.split("#")[0]))) broken.push(link);
  }
  return broken;
}

test("every file and section the README links to exists", () => {
  assert.deepEqual(brokenLinks("README.md"), []);
});

test("every relative link in the docs and the build log resolves", () => {
  const documents = ["PROGRESS.md", ...readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`)];
  for (const document of documents) assert.deepEqual(brokenLinks(document), [], document);
});

test("the judge scorecard leads the README and covers every rubric category", () => {
  const readme = read("README.md");
  const scorecard = readme.indexOf("## Judge Scorecard");
  assert.ok(scorecard > 0 && scorecard < readme.indexOf("## Five-Minute Judge Path"), "the scorecard comes before everything else");
  for (const [category, weight] of [["Problem & relevance", "20%"], ["Functionality", "25%"], ["AI integration & innovation", "20%"], ["Code, docs & GitHub", "15%"], ["UX & polish", "10%"], ["Business impact", "10%"]]) {
    assert.ok(readme.includes(`| **${category}** | ${weight} |`), category);
  }
});

test("the README never prints a demo password", () => {
  const readme = read("README.md");
  assert.match(readme, /Passwords are deliberately not in this repository/);
  assert.doesNotMatch(readme, /password\s*[:=]\s*\S{6,}/i);
});
