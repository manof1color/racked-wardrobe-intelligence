# Backend API judge map

All mutation routes enforce a signed HTTP-only session on the server. Consumer and Brand roles are checked separately. The local competition demo uses a process-local store so the workflows are fully runnable without cloud credentials; production replaces that adapter with DynamoDB.

| Route | Access | Working behavior | Judge evidence |
| --- | --- | --- | --- |
| `POST /api/garments/analyze` | Consumer | Accepts a front-only quick scan or front/back/label evidence. With server-only Anthropic configuration, actual image bytes are analyzed in request memory by Claude Haiku 4.5 using a strict JSON schema; no raw upload is written to disk. AI-visible label text is only evidence: an enrolled label hash, image set, GTIN, or Brand + SKU registry match is still required to verify identity. Every provider/configuration failure returns the deterministic demo result. | Scanner UI and multimodal/fallback/registry tests in `tests/three-view-upload.test.ts` |
| `GET /api/brand/products` | Brand | Lists only products owned by the signed-in Brand subject | Brand registry panel |
| `POST /api/brand/products` | Brand | Enrolls front/back/label hashes, account-bound brand, SKU/MPN, optional GTIN, aliases, and approved label text | Brand registry panel and `tests/product-registry.test.ts` |
| `POST /api/agents/consumer` | Consumer | Uses wardrobe, wear, outfit, and weather tools to assemble a grounded outfit from owned pieces | Consumer Stylist Agent panel and `tests/agents.test.ts` |
| `POST /api/agents/brand` | Brand | Uses product, aggregate wear, and privacy-threshold tools to return brand-safe wear intelligence AND an engagement-trend signal (bundled in one response as `reply` and `retention`); a below-threshold cohort (`productId: "p7"` / SKU `NA-AC-6044`, computed cohort of 1) returns a suppressed reply with no wear rate or trend instead of an aggregate. Shares an anti-enumeration query budget with `/api/brand/metrics` below — one query against the budget covers both the wear-rate reply and the trend. | Brand dashboard Agent panel and `tests/agents.test.ts`, `tests/privacy.test.ts`, `tests/retention.test.ts` |
| `POST /api/brand/metrics` | Brand | Computes the four segment metrics (opportunity, gap prevalence, duplicate risk, segment size) server-side against the live cohort, applying the same `k ≥ 25` gate and enumeration budget as the agent route above. Replaces a prior client-side computation that shipped the underlying population data into the browser bundle. | Brand dashboard match panel and `tests/privacy.test.ts` |
| `GET /api/community` | Public | Returns public fictional outfit posts and product/brand destinations | `/community` and `tests/community-store.test.ts` |
| `POST /api/community` | Consumer | Publishes an outfit with allowlisted public fields | Consumer Agent “Share” flow |
| `PATCH /api/community` | Public | Persists a fictional inspiration/like count in the demo backend | Community cards and `tests/community-store.test.ts` |
| `POST /api/wears` | Consumer | Records one wear or every unique piece in an agent-created outfit and returns updated counts | Consumer dashboard and Stylist Agent |
| `GET /api/wears` | Brand | Returns category-level synthetic aggregates only; item IDs and identities are excluded | Brand Wear Agent |
| `GET /api/consumer/consent` | Consumer | Returns whether the signed-in Consumer's wear data is currently included in brand-facing cohorts | Consumer dashboard consent toggle |
| `PATCH /api/consumer/consent` | Consumer | Sets that consent flag; takes effect on the next Brand-side cohort computation (verified live: a product's `segmentSize` moves by exactly one as this is toggled) | Consumer dashboard consent toggle and `tests/privacy.test.ts` |

## Three-view fixture

Use the **Load runnable test set** control in the Consumer upload dialog. It loads:

- `public/test-uploads/northstar-overshirt-front.png`
- `public/test-uploads/northstar-overshirt-back.png`
- `public/test-uploads/northstar-overshirt-label.png`

The checked-in manifest is `data/three-view-test-dataset.json`. Enroll this set in the Brand workspace first; a subsequent Consumer scan resolves through the exact label-image hash. All fixture records and images are synthetic.

## Persistence boundary

The checked-in demo store survives requests for the life of the local Next.js process and resets when the server restarts. That is intentional for a repeatable public judge demo. The AWS target persists consent, wardrobe records, aggregate wear events, and public posts in separate DynamoDB partitions; temporary private images use S3 lifecycle deletion.
