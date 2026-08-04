# Backend API judge map

All mutation routes enforce a signed HTTP-only session on the server. Consumer and Brand roles are checked separately. The local competition demo uses a process-local store so the workflows are fully runnable without cloud credentials; production replaces that adapter with DynamoDB.

| Route | Access | Working behavior | Judge evidence |
| --- | --- | --- | --- |
| `POST /api/garments/analyze` | Consumer | Validates exactly one front, back, and label image (JPG/PNG/WebP, 5 MB each), then returns evidence, confidence, SKU, and brand match | Three-view uploader and `tests/three-view-upload.test.ts` |
| `POST /api/agents/consumer` | Consumer | Uses wardrobe, wear, outfit, and weather tools to assemble a grounded outfit from owned pieces | Consumer Stylist Agent panel and `tests/agents.test.ts` |
| `POST /api/agents/brand` | Brand | Uses product, aggregate wear, and privacy-threshold tools to return brand-safe wear intelligence | Brand dashboard Agent panel and `tests/agents.test.ts` |
| `GET /api/community` | Public | Returns public fictional outfit posts and product/brand destinations | `/community` and `tests/community-store.test.ts` |
| `POST /api/community` | Consumer | Publishes an outfit with allowlisted public fields | Consumer Agent “Share” flow |
| `POST /api/wears` | Consumer | Records a demo wear event and returns the updated count | Consumer dashboard |
| `GET /api/wears` | Brand | Returns aggregate counts only | Brand Wear Agent |

## Three-view fixture

Use the **Load runnable test set** control in the Consumer upload dialog. It loads:

- `public/test-uploads/northstar-overshirt-front.png`
- `public/test-uploads/northstar-overshirt-back.png`
- `public/test-uploads/northstar-overshirt-label.png`

The checked-in manifest is `data/three-view-test-dataset.json`. All records, images, brands, SKUs, and behavioral data in this fixture are synthetic.

## Persistence boundary

The checked-in demo store survives requests for the life of the local Next.js process and resets when the server restarts. That is intentional for a repeatable public judge demo. The AWS target persists consent, wardrobe records, aggregate wear events, and public posts in separate DynamoDB partitions; temporary private images use S3 lifecycle deletion.
