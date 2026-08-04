# Backend API judge map

All mutation routes enforce a signed HTTP-only session on the server. Consumer and Brand roles are checked separately. The local competition demo uses a process-local store so the workflows are fully runnable without cloud credentials; production replaces that adapter with DynamoDB.

| Route | Access | Working behavior | Judge evidence |
| --- | --- | --- | --- |
| `POST /api/garments/analyze` | Consumer | Validates and hashes front/back/label images, then resolves an enrolled label hash, three-view hash set, GTIN, or Brand + SKU label identity | Three-view uploader and registry tests |
| `GET /api/brand/products` | Brand | Lists only products owned by the signed-in Brand subject | Brand registry panel |
| `POST /api/brand/products` | Brand | Enrolls front/back/label hashes, account-bound brand, SKU/MPN, optional GTIN, aliases, and approved label text | Brand registry panel and `tests/product-registry.test.ts` |
| `POST /api/agents/consumer` | Consumer | Uses wardrobe, wear, outfit, and weather tools to assemble a grounded outfit from owned pieces | Consumer Stylist Agent panel and `tests/agents.test.ts` |
| `POST /api/agents/brand` | Brand | Uses product, aggregate wear, and privacy-threshold tools to return brand-safe wear intelligence | Brand dashboard Agent panel and `tests/agents.test.ts` |
| `GET /api/community` | Public | Returns public fictional outfit posts and product/brand destinations | `/community` and `tests/community-store.test.ts` |
| `POST /api/community` | Consumer | Publishes an outfit with allowlisted public fields | Consumer Agent “Share” flow |
| `PATCH /api/community` | Public | Persists a fictional inspiration/like count in the demo backend | Community cards and `tests/community-store.test.ts` |
| `POST /api/wears` | Consumer | Records one wear or every unique piece in an agent-created outfit and returns updated counts | Consumer dashboard and Stylist Agent |
| `GET /api/wears` | Brand | Returns category-level synthetic aggregates only; item IDs and identities are excluded | Brand Wear Agent |

## Three-view fixture

Use the **Load runnable test set** control in the Consumer upload dialog. It loads:

- `public/test-uploads/northstar-overshirt-front.png`
- `public/test-uploads/northstar-overshirt-back.png`
- `public/test-uploads/northstar-overshirt-label.png`

The checked-in manifest is `data/three-view-test-dataset.json`. Enroll this set in the Brand workspace first; a subsequent Consumer scan resolves through the exact label-image hash. All fixture records and images are synthetic.

## Persistence boundary

The checked-in demo store survives requests for the life of the local Next.js process and resets when the server restarts. That is intentional for a repeatable public judge demo. The AWS target persists consent, wardrobe records, aggregate wear events, and public posts in separate DynamoDB partitions; temporary private images use S3 lifecycle deletion.
