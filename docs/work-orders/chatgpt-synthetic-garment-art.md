# Work order — synthetic garment art (executor: ChatGPT / Codex · reviewer: Claude)

Opened 2026-09-22. One item, one branch, one PR. Branch `codex/synthetic-garment-art`.

## The problem

Every synthetic garment and product image in the demo is drawn by two near-identical copies of the
same SVG — [`scripts/seed-judge-accounts.mjs`](../../scripts/seed-judge-accounts.mjs) (`garmentImage`,
`productImage`) and [`scripts/seed-test-cohort.mjs`](../../scripts/seed-test-cohort.mjs) (`imageFor`).

That SVG draws **one shape: a t-shirt**. It is used for every category. In the seeded judge closet
today:

| Garment | Category | What the image actually shows |
| --- | --- | --- |
| Judge Leather Derby | shoe | a t-shirt |
| Judge Wool Trouser | bottom | a t-shirt |
| Judge Tailored Blazer | outerwear | a t-shirt |
| Judge Archive Cap | accessory | a t-shirt |

A judge opening the Closet, Community, or a brand catalogue sees a grid of identical navy t-shirts
with different words printed on them. It reads as unfinished, and it undersells recognition —
the pieces the app is reasoning about look like nothing at all.

## What to build

A single shared module that draws a **category-appropriate silhouette**, used by both seeds.

Suggested location: `scripts/lib/synthetic-garment-art.mjs`. Both seed scripts import from it and
their local copies are deleted — the duplication is part of the problem.

### Required exports

```js
export function garmentArt({ name, category, subtype, color, brand })   // → SVG string
export function productArt({ name, sku, brand, category, subtype, color, view })  // view: front | back | label
```

Keep the seeds' existing call sites working: they currently `await` a PNG `Buffer` produced by
`sharp(Buffer.from(svg)).png().toBuffer()`. Returning SVG strings and letting the seeds rasterize is
fine and preferable — it makes the art testable without `sharp`.

### Silhouettes

One distinct, recognisable shape per category in `GARMENT_TAXONOMY`:

`top`, `bottom`, `outerwear`, `shoe`, `dress`, `bag`, `jewelry`, `accessory`, and a sensible
fallback for `unknown`.

Go one level further where the subtype clearly changes the outline and it is cheap to do:
`jeans` vs `shorts` vs `skirt`; `sneakers` vs `boots` vs `dress-shoes`; `hat` vs `belt` vs
`scarf`. Do not attempt every subtype — a good category shape beats forty mediocre ones.

### Colour

Use the garment's own `color` field to fill the silhouette, mapped through a small controlled
palette (the field is free text; `"indigo"`, `"charcoal"`, `"sand"`, `"olive"` all appear in the
seeds today). Unrecognised colours fall back to a neutral. Keep enough contrast against the
background that the shape stays legible in a grid thumbnail, and keep the existing warm paper
background so the set still looks like one family.

## Hard constraints

These are not style preferences. Breaking any of them fails review.

1. **The synthetic label stays.** Every image keeps a visible `SYNTHETIC DEMO` marking. It is how
   this project honours "clearly labeled synthetic data" to the judges, and it is asserted in
   `docs/dataset-provenance.md` and `docs/test-cohort.md`. Make it look better if you like —
   do not remove it, shrink it to illegibility, or move it off-canvas.
2. **Nothing photorealistic.** These must read as illustrations. An image that could be mistaken
   for a real product photograph defeats the labelling above. No imported photographs, no
   AI-generated imagery, no texture packs.
3. **No real brands.** No existing logo, wordmark, monogram, or trade dress, and no shape that
   evokes a specific real product. The brand names in the seeds are fictional; keep them that way.
4. **No new dependencies and no network access.** SVG built in-process, rasterized with the `sharp`
   already present. The seed must run offline.
5. **Deterministic.** Same input, same bytes, every time. The seed is idempotent and re-running it
   must not churn S3 objects or change checksums. No `Math.random()`, no `Date.now()` in the art.
6. **Sane size.** Keep each PNG under ~150 KB at the current 900×1100. The judge seed writes 21
   objects and the cohort seed many more.
7. **Do not touch the data.** Categories, subtypes, SKUs, wear counts, owner links, the `k ≥ 25`
   cohort, and every id stay exactly as they are. This work order changes *pixels only*. If a
   change seems to require editing a garment record, stop and say so in the PR instead.

## Tests

`tests/judge-accounts.test.ts` runs the seed in dry-run mode, where images are stubbed — so the art
is currently untested. Add `tests/synthetic-garment-art.test.ts` covering at minimum:

- Each taxonomy category returns a **distinct** silhouette — assert the path data differs between
  categories, so a future refactor cannot quietly collapse them back to one shape.
- `unknown` and an unrecognised colour both return valid SVG rather than throwing.
- The `SYNTHETIC DEMO` marking is present in every output, including all three product views.
- The same input returns a byte-identical string twice (determinism).
- The output contains no `<image>`, no `href`, and no `data:` URI — a cheap structural guarantee
  that nothing photographic crept in.

## Gate

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:prod` — all green, summary
pasted into the PR.

Also paste `pnpm seed:judge:dry` output showing item and object counts unchanged from `main`
(151 items / 21 objects at the time of writing). A changed count means data moved, which this work
order forbids.

## Docs in the same PR

A `PROGRESS.md` phase and the test count in `README.md` and `docs/competition-checklist.md`.
Do not add this work order to the README documentation index — work orders are internal.

## Reviewer notes

Claude reviews against the constraints above, and will specifically check:

- that the `SYNTHETIC DEMO` marking survived in all views;
- that no seeded record changed — a diff touching anything but the art module, the two seed call
  sites, the new test, and docs needs an explanation;
- **patch hygiene**: after any scripted edit, scan changed files for raw control characters and for
  regexes that lost a backslash (`\s` written as `s`). This has bitten this repository twice.
