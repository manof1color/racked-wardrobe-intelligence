# Independent garment-recognition evaluation

## Selected source

Racked uses the corrected **Clothing Dataset for Second-Hand Fashion, version 3** as its external evaluation source:

- 31,638 main second-hand garments plus a separately identified 100-garment annotator-agreement set;
- front, back, and brand-label photographs for each item when the privacy-cleaned label image is available;
- human annotations including garment type, brand, colors, pattern, and material;
- CC BY 4.0 license;
- DOI: [10.5281/zenodo.13788681](https://doi.org/10.5281/zenodo.13788681).

RISE Research Institutes of Sweden AB curated and released the dataset with data collected by Wargön Innovation AB and Myrorna AB. The work was supported by Vinnova and the EU CISUTAC project. Source photographs remain in the separately downloaded dataset and are not committed to GitHub, copied into Racked's public assets, or deployed to AWS.

## Training claim

Racked is **not trained or fine-tuned on these 31,638 garments**. The documented three-view benchmark calls Amazon Nova Lite through Bedrock; the separate whole-look instance detector uses the US Nova Pro geographic profile because counting and boxing many overlapping objects is a different task. This dataset is an independent benchmark used to measure the three-view system. Describing evaluation data as training data would make the competition claim inaccurate and would contaminate a future held-out test. Whole-look recall and footwear-pair completeness require a separate scene-level evaluation set and are not inferred from this single-garment corpus.

## Evaluation protocol

1. Download the source archive from Zenodo outside the repository. The smaller [version 1 release](https://zenodo.org/records/8386668) contains about 3,000 garments and is suitable for development; version 3 is the corrected 31,638-item benchmark corpus.
2. Retain only records with a readable annotation plus front, back, and label views. Log exclusions, especially the privacy-removed or absent label photos.
3. Convert the source `type` field into Racked's controlled category/subtype vocabulary with `normalizeSecondHandAnnotation`. The source `category` can describe the intended wearer and is not treated as garment identity.
4. Select a deterministic, stratified subset. Keep its manifest and source IDs, but not its photographs, in the evaluation workspace.
5. Run the production multi-view analysis without placing these records into a consumer wardrobe or brand registry. Paths in the manifest are resolved relative to the manifest file, outputs checkpoint after every case, and an interrupted run resumes by external ID:

```bash
pnpm eval:run path/to/manifest.json path/to/predictions.json 100
```

The optional final number is a deterministic maximum case count. The runner uses the production Bedrock multi-view analyzer with an explicitly empty product registry, never persists source images, and always records `verified: false`. Provider/manual-review fallbacks are counted as failures rather than guessed classifications.

6. Score an existing predictions file independently when needed:

```bash
pnpm eval:score path/to/manifest.json path/to/predictions.json path/to/report.json
```

The manifest is a JSON array of `EvaluationCase` records from `lib/evaluation-dataset.ts`; predictions are a JSON array of `EvaluationPrediction` records. Reports contain attempted/completed counts, provider failures, category accuracy, subtype accuracy, normalized brand-text accuracy, and identity-boundary violations.

## Completed label-coverage audit

Before spending model calls, Racked audited 1,000 metadata rows at ten evenly spaced offsets in the version 3 front-image mirror. The reproducible result is [`data/evaluation-label-coverage.json`](../data/evaluation-label-coverage.json): 939/1,000 records map to a supported broad category, 626/1,000 carry a source type specific enough to score an exact Racked subtype, and 940/1,000 have a non-placeholder brand annotation. The 61 out-of-taxonomy records are primarily pajamas, nightgowns, tunics, and robes. They remain explicitly `unknown` rather than being forced into a misleading category.

Run the same audit over downloaded dataset-server row files with:

```bash
pnpm eval:audit-labels path/to/rows-directory path/to/coverage-report.json
```

This is a **schema/label-coverage result, not recognition accuracy**. Recognition accuracy on the live scan path was measured separately on 2026-10-29 — **89.7% category correct** — and is reported in [evaluation-results.md](evaluation-results.md). The three-view protocol above remains unexecuted.

## Live-path benchmark (the scan the app actually runs)

`pnpm eval:run` measures three-view analysis on Nova Lite, which live intake does not use. The live-path benchmark runs `detectLookOrManualReview` around `detectGarmentsInLook` — what `POST /api/garments/detect` runs, with the same prompt, model candidates, parsing, shoe-pair joining and taxonomy mapping — on the same 1,600-pixel JPEG the route prepares. It writes nothing to Racked's table or bucket.

1. **Build and lock the cases (no model calls, no AWS).** `pnpm eval:live:build` reads ten windows of dataset metadata, samples 300 labelled front photos with `deterministicEvaluationSample`, downloads only those photos to a folder outside the repository (`RACKED_EVAL_IMAGES`, default `../racked-eval-images`), and writes `data/evaluation-live-manifest.json` and `data/evaluation-lock.json`. With `--pilot labels.csv` it adds the owner's labelled pilot-brand photos (`file,category,subtype,pieces,conditions`). **Commit both files before any run.**
2. **Check the estimate.** `pnpm eval:live` verifies every case and photo against the lock, prints the cost estimate, and spends nothing.
3. **Run.** `RACKED_EVAL_CONFIRM=yes pnpm eval:live`, where AWS credentials with Bedrock access are available. Each call is sent only if, at its worst (full output, largest input seen, prices × 1.5), the counted total stays within **$3.50** — lower with `RACKED_EVAL_BUDGET_USD`, never higher. Spend is counted from the tokens Bedrock reports and saved after every photo, so a rerun resumes and cannot spend the cap twice. Three service failures in a row stop the run.
4. **Publish.** The run writes `data/evaluation-live-<date>.json` (aggregates only) and `docs/evaluation-results.md`: category accuracy, exact-type accuracy on photos whose label names a type, pieces found in multi-piece photos, service failures and needs-your-label rate, each with a 95% Wilson interval, plus the most common misses and any product marked verified without registry evidence (must be 0). A partial run says so and gives its denominators.

## What the benchmark can and cannot prove

It can test broad category, specific subtype, front-versus-multi-view behavior, visible attributes, label OCR/autofill, provider failures, and confidence behavior. A label transcription is still only evidence for an editable brand suggestion.

It cannot establish exact SKU/GTIN identity because the dataset is not an authorized Racked brand registry. Any model output that becomes `verified` without registry GTIN or brand-plus-SKU evidence is counted as an identity-boundary violation. A separate consented pilot set of authorized products is required to measure exact-product verification.

## Reporting rule

The README may state the published corpus size and the number of records actually attempted. Accuracy must not be published until a complete report exists, includes the denominator and exclusion count, and remains reproducible from the evaluation manifest. No commercial, sales-lift, or production-accuracy conclusion should be inferred from this research benchmark.
