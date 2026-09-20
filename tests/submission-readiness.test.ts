import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The competition's submission checklist requires a LICENSE at the repository root. It suggests MIT,
// which would let anyone ship this work as their own product; this project keeps its rights instead,
// and stays readable by judges. These assertions exist so that boundary cannot be softened by
// accident — an MIT text pasted over this file would fail here.
test("the repository is source-available for review, with rights reserved", () => {
  const license = read("LICENSE");
  assert.match(license, /All rights reserved/i);
  assert.match(license, /evaluating or reviewing it/i, "judges and reviewers may run it");
  assert.match(license, /NOT PERMITTED/, "and the limits are stated, not implied");
  assert.doesNotMatch(license, /Permission is hereby granted, free of charge/i, "this is not MIT");
  assert.match(license, /training or fine-tuning data for a machine\s+learning model/i);
  assert.match(read("README.md"), /\[LICENSE\]\(LICENSE\)/);
});

// Judges run a 10-minute block: 0:30 intro, 5:00 demo on a hard timer, 3:00 Q&A, 1:30 transition.
// A script written for eight minutes gets a red card two segments from the end.
test("the presentation script fits the demo slot judges actually run", () => {
  const script = read("docs/demo-script.md");
  assert.match(script, /# Presentation script \(5 minutes, plus 3 minutes of Q&A\)/);
  const segments = [...script.matchAll(/^## (\d):(\d\d)[–-](\d):(\d\d)/gm)].map((match) => ({
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4]),
  }));
  assert.ok(segments.length >= 5, `expected the demo broken into segments, found ${segments.length}`);
  assert.equal(segments[0].start, 0);
  assert.equal(segments.at(-1)!.end, 300, "the last segment ends at 5:00, before the red card");
  for (const [index, segment] of segments.entries()) {
    if (index === 0) continue;
    assert.equal(segment.start, segments[index - 1].end, "segments run back to back with no gap");
  }
  assert.match(script, /## Prepared answers for the 3-minute Q&A/, "judges score during Q&A, so the answers are prepared");
  assert.match(script, /cold start/i);
  assert.match(script, /I don't claim/i, "including the accuracy question, answered honestly");
});

test("the one-page summary carries the sections the submission checklist requires", () => {
  const summary = read("docs/one-page-summary.md");
  for (const heading of ["## Problem", "## Solution", "## Key technical choices", "## Lessons learned"]) {
    assert.ok(summary.includes(heading), `missing required section: ${heading}`);
  }
  const words = summary.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 750, `a one-page summary must stay one page; this is ${words} words`);
  const lessons = summary.slice(summary.indexOf("## Lessons learned"));
  assert.ok((lessons.match(/^- \*\*/gm) ?? []).length >= 3, "three to five lessons, the section judges read most");
  assert.match(summary, /I do not claim recognition accuracy/, "and the claims boundary survives the short form");
});
