# Recognition results — live scan path

Generated from `data/evaluation-live-2026-10-29.json` by `scripts/run-live-detection-evaluation.mjs`. Every locked photo was attempted.

The benchmark runs `detectLookOrManualReview` and `detectGarmentsInLook` — the functions `POST /api/garments/detect` runs — on the same 1,600-pixel JPEG the route prepares. Models: `us.amazon.nova-pro-v1:0`. Prompt SHA-256 `b93e7625a4e755f2…`. Answers were locked in `data/evaluation-lock.json` before any model call. Bedrock spend counted with a 1.5× margin: $1.75 (hard cap $3.50).

## External: Clothing Dataset for Second-Hand Fashion (CC BY 4.0), front photos

300 of 300 locked photos attempted.

| Measure | Result |
| --- | --- |
| Category correct | 262 of 292 (89.7%, 95% CI 85.7%–92.7%) |
| Exact type correct (photos whose label names a type) | 100 of 168 (59.5%, 95% CI 52.0%–66.6%) |
| Service did not answer | 8 of 300 (2.7%, 95% CI 1.4%–5.2%) |
| Came back as "needs your label" | 0 of 292 (0.0%, 95% CI 0.0%–1.3%) |
| Products marked verified without registry evidence | 0 (must be 0) |

Most common misses (correct → proposed):

| Miss | Photos |
| --- | ---: |
| top → outerwear | 18 |
| dress → top | 4 |
| top → dress | 4 |
| outerwear → top | 2 |
| bottom → dress | 1 |
| top → accessory | 1 |

A category is scored on the detection covering most of the photo. These are results on the photos named in the lock, not a guarantee for every photo.
