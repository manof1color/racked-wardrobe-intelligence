# Recognition results — live scan path, round 2

Generated from `data/evaluation-live-2026-10-29-r2.json` by `scripts/run-live-detection-evaluation.mjs`. Every locked photo was attempted.

The benchmark runs `detectLookOrManualReview` and `detectGarmentsInLook` — the functions `POST /api/garments/detect` runs — on the same 1,600-pixel JPEG the route prepares. Models: `us.amazon.nova-pro-v1:0`. Prompt SHA-256 `509b9e45f0a7f632…`. Answers were locked in `data/evaluation-lock-r2.json` before any model call. Bedrock spend counted with a 1.5× margin: $1.76 (hard cap $3.50).

## External: Clothing Dataset for Second-Hand Fashion (CC BY 4.0), front photos

300 of 300 locked photos attempted.

| Measure | Result |
| --- | --- |
| Category correct | 272 of 293 (92.8%, 95% CI 89.3%–95.3%) |
| Exact type correct (photos whose label names a type) | 138 of 185 (74.6%, 95% CI 67.9%–80.3%) |
| Service did not answer | 7 of 300 (2.3%, 95% CI 1.1%–4.7%) |
| Came back as "needs your label" | 0 of 293 (0.0%, 95% CI 0.0%–1.3%) |
| Products marked verified without registry evidence | 0 (must be 0) |

Most common misses (correct → proposed):

| Miss | Photos |
| --- | ---: |
| dress → top | 11 |
| top → dress | 6 |
| outerwear → bottom | 1 |
| top → bag | 1 |
| top → bottom | 1 |
| top → outerwear | 1 |

A category is scored on the detection covering most of the photo. These are results on the photos named in the lock, not a guarantee for every photo.
