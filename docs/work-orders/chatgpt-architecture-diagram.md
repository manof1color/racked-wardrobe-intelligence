# Work order — architecture diagram (executor: ChatGPT / Codex · reviewer: Claude)

Opened 2026-10-05. One item, one branch, one PR. Branch `codex/architecture-diagram`, cut from
`main` **after PRs #157 and #158 are merged** — #158 is where the README's current architecture
section comes from.

## The problem

The README's [Architecture Overview](../../README.md#architecture-overview) is the one picture a
judge looks at to understand how Racked is built, and today it is a Mermaid flowchart: correct, but
small grey boxes that GitHub renders at whatever size it likes. The previous contest's winning
README led its architecture section with a designed image (`architecture.svg`). Racked should too.

**Draw it as an SVG you write, not a generated bitmap.** Image generators misspell and invent text
in diagrams — a box reading "Nova Lie" or an arrow to a service Racked does not use would put a
false statement in front of judges. An SVG authored by you keeps every label exact, stays sharp at
any zoom, is a few kilobytes, and can be checked by a test. Do not use DALL·E or any image
generator for this file, and do not embed raster images in it.

## What to build

1. `docs/architecture.svg` — the diagram.
2. `tests/architecture-diagram.test.ts` — exactly as given [below](#the-test), added unchanged.
3. The README change [below](#readme-change).

## The content — exactly this, nothing more

This is the system as built. Every box and every arrow below must appear; **no other boxes or
arrows may appear.** Where wording is in quotes, use it verbatim — the test checks it. You may add
small icons and the legend, title, and tagline described under design.

### Boxes

| Box | Title (verbatim) | Detail line(s) (verbatim) | Colour role |
| --- | --- | --- | --- |
| Client | "Phone or desktop browser" | "Installable PWA" | neutral |
| Container | "AWS Amplify Hosting" | "Next.js 15" — server rendering and API routes | container |
| Entry | "Session & role check" | "Rate limits" | app |
| Intake | "Photo intake" | "One bounded crop per piece" | AI |
| Hanger | "Hanger agents" | "wardrobe search · outfit builder · weather · trends" | AI |
| Builder | "Outfit builder" | "Stylist knowledge" | app |
| Gate | "Privacy gate" | "Consent → k ≥ 25 → enumeration budget" | privacy |
| Store | "Owner-scoped store" | "Every read checks the account" | storage |
| Bedrock | "Amazon Bedrock" | "Nova Pro: garment detection + Hanger" and "Nova Lite fallback" | AI |
| Weather | "Open-Meteo" | "Coordinates rounded to ~1 km" | external |
| DynamoDB | "DynamoDB" | single table | storage |
| S3 | "Private S3" | encrypted · "1-hour links" | storage |
| Brands | "Brand dashboard" | "Released aggregates only" | privacy |

Entry, Intake, Hanger, Builder, Gate, and Store sit **inside** the Amplify container. Client,
Bedrock, Weather, DynamoDB, S3, and Brands sit **outside** it.

### Arrows

| From | To | Label |
| --- | --- | --- |
| Client | Entry | "HTTPS · signed HTTP-only session" |
| Entry | Intake | — |
| Entry | Hanger | — |
| Entry | Gate | — |
| Hanger | Builder | — |
| Intake | Store | — |
| Hanger | Store | — |
| Gate | Store | — |
| Intake | Bedrock | — |
| Hanger | Bedrock | — |
| Hanger | Weather | — |
| Store | DynamoDB | — |
| Store | S3 | — |
| Gate | Brands | the emphasised privacy path |

**The Gate → Brands arrow is the point of the picture.** It is the only line that reaches brands.
Draw a dashed coral **privacy boundary** along the container edge it crosses, and put this callout
beside the Brands box, verbatim: **"Never names, emails, photos, wardrobes, or owner IDs"**. Nothing
else — not the store, DynamoDB, or S3 — may connect to Brands.

### Delivery strip

A slim footer band showing how code reaches production. Use these words (the test checks "CodeQL"
and "/api/version"):

> Pull request → CI: audit · lint · type check · tests · build + CodeQL → merge to `main` → Amplify builds → `/api/version` reports the commit

### Things that must not appear

These are false or unclaimed, and the test rejects them: Lambda, Cognito, API Gateway, SageMaker,
Stable Image, SES, OpenAI, GPT, Claude, Stripe, "try-on", "sales", and any line pairing Nova Lite
with garment analysis or with Hanger as its main model. No uptime, latency, user, or traffic
numbers. **No logos** — not AWS, Amazon, Next.js, Open-Meteo, or GitHub; write the names as text
and use simple generic glyphs instead.

## Design

**Size.** `viewBox="0 0 1200 800"` is a good target (the test allows width 1000–1600, height
600–1200). GitHub shows README images about 880 px wide on desktop, so a 1200-unit canvas is
scaled to roughly 73%. The test therefore requires **no text smaller than width ÷ 60** — 20 units on
a 1200-wide canvas, which displays at about 14.6 px. Titles 26–30, details 20–22. If a label does
not fit, shorten the layout, not the font.

**Fonts.** GitHub displays README SVGs through `<img>`, which cannot load web fonts. Use
`font-family="Inter, 'Segoe UI', Helvetica, Arial, sans-serif"` and leave about 15% spare width in
every box, because the reader's fallback font may be wider than yours. Font sizes in px or plain
user units — no `em`, `rem`, or `%`.

**Background.** Fill the whole canvas with Racked paper, `#f5f2ea`, as the first element, ideally as
a rounded card. Without it the diagram vanishes against GitHub's dark theme.

**Palette — Racked's own** (from `app/globals.css`):

| Role | Fill | Use |
| --- | --- | --- |
| Text and arrows | ink `#171914` | all titles, arrows 2–3 px |
| Detail text | muted `#716f68` | detail lines only, never below 20 units |
| Container | cream `#ece6d8`, border line `#d9d4c8` | the Amplify box |
| AI | lilac `#cfc5ff` | Intake, Hanger, Bedrock |
| Privacy | coral `#ff6846`, emphasis `#e94f30` | Gate, Brands, the boundary, the privacy arrow |
| Storage | green `#b8ddb7` | Store, DynamoDB, S3 |
| External | acid `#d5f66d` | Open-Meteo |
| Neutral | white `#fffdf8` | Client, Entry, Builder |

Put text in ink on every coloured fill — it passes contrast on all of them. Colour never carries
meaning alone: add a small legend (AI · privacy · storage · external).

**Suggested composition** — a starting point; improve it, but keep the story: AI services above,
storage below, people on the left, brands on the right behind one door.

```text
                    [ Amazon Bedrock ]                 [ Open-Meteo ]
                         ▲        ▲                          ▲
 [ Phone or    ]   ┌──── AWS Amplify Hosting · Next.js 15 ───────────────┐
 [ desktop     ]──▶│ [Session & role check] ─▶ [Photo intake]            │
 [ browser     ]   │            │           ─▶ [Hanger agents] ─▶ [Outfit builder]
                   │            └──────────▶ [Privacy gate] ═════════════╪══▶ [Brand dashboard]
                   │      intake · Hanger · gate ▼                       ┊   "Never names, emails…"
                   │              [ Owner-scoped store ]                 ┊ ← privacy boundary
                   └──────────────────┬──────────────┬───────────────────┘
                                      ▼              ▼
                                [ DynamoDB ]   [ Private S3 ]
 ── Pull request → CI … + CodeQL → merge to main → Amplify builds → /api/version reports the commit ──
```

No crossing arrows. If two must cross, draw a small bridge hop. Small line glyphs drawn in the SVG
itself are welcome — a coat hanger for Hanger, a phone, a camera for intake, a shield for the gate,
a cylinder for DynamoDB, a box for S3, a cloud-and-sun for the forecast, a bar chart for brands.

**Header.** Title "Racked — system architecture" and tagline "One door to brands: the privacy gate."

**Accessibility.** A `<title>` and a `<desc>` that narrates the flow in a sentence or two. All words
as real `<text>`/`<tspan>` — never converted to outlines or paths, which the test cannot read and
screen readers cannot either. Write `&amp;` for "&" (XML requires it); write `·`, `→`, `≥`, and `~`
as plain UTF-8 characters.

## README change

In `README.md`, under `## Architecture Overview`, make the image the first thing and fold the
existing Mermaid block beneath it. The section should begin exactly like this (the test checks the
image line, its order, and the summary text):

````markdown
## Architecture Overview

![Racked architecture: a phone or desktop browser connects over HTTPS to AWS Amplify Hosting, where a session and role check routes requests to photo intake, the Hanger agents, and the privacy gate; intake and Hanger call Amazon Bedrock, Hanger reads the Open-Meteo forecast, an owner-scoped store reads and writes DynamoDB and private S3, and only the privacy gate reaches the brand dashboard, with released aggregates only.](docs/architecture.svg)

<details>
<summary><strong>The same diagram as text — expand</strong></summary>

```mermaid
…the existing Mermaid block, unchanged…
```

</details>
````

Leave everything after the Mermaid block — the "Brands receive released aggregates only" sentence
and the **Infrastructure** paragraph — exactly as it is.

## The test

Add this file as `tests/architecture-diagram.test.ts`, unchanged. It was run against a compliant
fixture (all six pass) and against six broken ones — a stale model label, 12-unit text, a missing
label, an embedded raster, no background, and an un-updated README — each of which fails the right
test. You may add assertions; do not remove or loosen any.

````ts
/**
 * The architecture image is the first picture a judge sees in the README. It is drawn as SVG rather
 * than a generated bitmap so that every label is real text: a box naming the wrong model, a service
 * Racked does not use, or text too small to read on GitHub fails here instead of in front of a judge.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const path = new URL("../docs/architecture.svg", import.meta.url);
const svg = readFileSync(path, "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** What a viewer reads: every text element's content, entities decoded, whitespace collapsed. */
function visibleText(source: string) {
  return [...source.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map(([, inner]) => inner.replace(/<[^>]+>/g, " "))
    .join(" ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const viewBox = /<svg\b[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
const width = Number(viewBox?.[1]);
const height = Number(viewBox?.[2]);
const words = visibleText(svg);

test("the diagram is a self-contained, safe SVG of a size GitHub shows well", () => {
  assert.ok(viewBox, "the root <svg> declares viewBox=\"0 0 W H\"");
  assert.ok(width >= 1000 && width <= 1600, `width ${width} is between 1000 and 1600`);
  assert.ok(height >= 600 && height <= 1200, `height ${height} is between 600 and 1200`);
  assert.ok(statSync(path).size < 150_000, "under 150 KB");
  assert.match(svg, /<title>[^<]{10,}<\/title>/, "has a <title>");
  assert.match(svg, /<desc>[^<]{40,}<\/desc>/, "has a <desc> describing the flow");
  for (const forbidden of [/<script\b/i, /<foreignObject\b/i, /<image\b/i, /\bhref="https?:/i, /data:/i, /@import/i, /url\(\s*['"]?https?:/i]) {
    assert.doesNotMatch(svg, forbidden, `contains ${forbidden}`);
  }
});

test("it has its own background, so it reads on GitHub's light and dark themes", () => {
  const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map(([, attributes]) => attributes);
  const fullSize = (value: string | undefined, size: number) => value === "100%" || Number(value) >= size;
  const background = rects.find((attributes) => {
    const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
    const fill = attribute("fill");
    return fullSize(attribute("width"), width) && fullSize(attribute("height"), height) && fill && !/^(none|transparent)$/i.test(fill);
  });
  assert.ok(background, "a filled rectangle covers the whole canvas");
});

test("no text is too small to read at GitHub's README width", () => {
  const sizes = [...svg.matchAll(/font-size(?:="|:\s*)([^";}]+)/g)].map(([, value]) => value.trim());
  assert.ok(sizes.length > 0, "font sizes are declared");
  for (const size of sizes) {
    assert.match(size, /^[\d.]+(px)?$/, `font-size ${size} is in px or user units`);
    assert.ok(parseFloat(size) >= width / 60, `font-size ${size} is at least ${(width / 60).toFixed(1)}`);
  }
});

test("every component, the privacy boundary, and the delivery path are labelled exactly", () => {
  for (const label of [
    "Phone or desktop browser", "Installable PWA", "HTTPS · signed HTTP-only session",
    "AWS Amplify Hosting", "Next.js 15",
    "Session & role check", "Rate limits",
    "Photo intake", "One bounded crop per piece",
    "Hanger agents", "wardrobe search · outfit builder · weather · trends",
    "Outfit builder", "Stylist knowledge",
    "Privacy gate", "Consent → k ≥ 25 → enumeration budget",
    "Owner-scoped store", "Every read checks the account",
    "Amazon Bedrock", "Nova Pro: garment detection + Hanger", "Nova Lite fallback",
    "Open-Meteo", "Coordinates rounded to ~1 km",
    "DynamoDB", "Private S3", "1-hour links",
    "Brand dashboard", "Released aggregates only",
    "Never names, emails, photos, wardrobes, or owner IDs",
    "CodeQL", "/api/version",
  ]) {
    assert.ok(words.includes(label), `missing label: ${label}`);
  }
});

test("it names nothing Racked does not run and claims nothing it does not do", () => {
  for (const forbidden of [/\bLambda\b/, /\bCognito\b/, /API Gateway/, /SageMaker/, /Stable Image/, /\bSES\b/, /OpenAI/, /\bGPT\b/, /\bClaude\b/, /Stripe/, /try-on/i, /\bsales\b/i, /Nova Lite: garment/i]) {
    assert.doesNotMatch(words, forbidden, `names ${forbidden}`);
  }
});

test("the README shows the image first in its architecture section and keeps the text diagram", () => {
  const section = readme.slice(readme.indexOf("## Architecture Overview"), readme.indexOf("## Repository Map"));
  assert.match(section, /^!\[Racked architecture: [^\]]{120,}\]\(docs\/architecture\.svg\)$/m, "the image, with a descriptive alt text");
  assert.ok(section.indexOf("docs/architecture.svg") < section.indexOf("```mermaid"), "the image comes before the text diagram");
  assert.match(section, /<details>\s*<summary><strong>The same diagram as text — expand<\/strong><\/summary>\s*```mermaid/, "the Mermaid diagram stays, folded");
});
````

## Hard constraints

Breaking any of these fails review.

1. **Exactly the boxes and arrows above.** An extra arrow is a false claim about the system.
2. **Text is text.** No generated bitmaps, no `<image>`, no `data:` URIs, no outlined lettering.
3. **No logos or trade dress** of any company, including the ones Racked uses.
4. **Nothing else changes.** The PR touches `docs/architecture.svg`, the new test, the README's
   architecture section, and the docs listed below — no application code.
5. **`tests/readme-links.test.ts` must still pass.** It checks every link in the README, including
   the new image.

## Gate

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:prod` — all green, summary
pasted into the PR. Run the suite on `main` first and report both totals, rather than trusting a
number written here.

## Docs in the same PR

A `PROGRESS.md` phase, and the test count (and test-file count) in `README.md` and
`docs/competition-checklist.md`. Do not add this work order to the README documentation index —
work orders are internal.

## Reviewer notes

Claude reviews against the content tables above and will specifically check:

- the rendered README on GitHub in **both light and dark themes**, on desktop and phone width;
- every arrow against the arrow table — none missing, none added — and that nothing but the Gate
  reaches Brands;
- that the image is legible without zooming at GitHub's README width;
- **patch hygiene**: after any scripted edit, scan changed files for raw control characters and for
  regexes that lost a backslash (`\s` written as `s`). This has bitten this repository three times.
