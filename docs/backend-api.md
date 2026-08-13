# Backend API

All private routes verify the signed HTTP-only session and role on the server. Structured state persists in DynamoDB; image objects persist in private S3.

## Abuse controls

Endpoints that create accounts, invoke Amazon Bedrock, release aggregates, or accept public writes apply sliding-window rate limits and answer excess traffic with HTTP 429 plus a `retry-after` header: sign-in (per client and per email), registration, garment analysis, both Hanger agents, brand metrics, community publishing, and community likes. Counters are held in compute-instance memory (documented in `SECURITY.md` as a first layer). Separately, brand aggregate reads are governed by a persistent DynamoDB enumeration budget — at most six distinct products per brand account per five minutes — enforced inside the shared metrics function so the dashboard and Brand Hanger cannot be used to sweep near-threshold cohorts.

| Route | Access | Production behavior |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Creates a real Consumer or Brand account, salts and scrypt-hashes the password, then starts a 7-day session |
| `POST /api/auth/login` | Public | Verifies the password using constant-time comparison and starts the role session |
| `POST /api/auth/logout` | Signed in | Expires the session cookie |
| `GET /api/consumer/wardrobe` | Consumer | Returns only that account’s garments and outfits with one-hour private image links |
| `POST /api/garments/classify` | Consumer | Classifies the first photo into a controlled category/subtype hypothesis with confidence, visible reasoning, and bounded alternatives; returns a category-specific photo plan, stores nothing, exposes no identity fields, and falls back honestly on provider failure |
| `POST /api/garments/analyze` | Consumer | Receives front/back/label views plus the bounded initial hypothesis, asks Bedrock to confirm or revise it, normalizes subtype/pattern/material/alternatives, separately resolves registry identity, stores private evidence plus an auto-cropped display image, and returns an HMAC-signed confirmation |
| `POST /api/consumer/wardrobe` | Consumer | Verifies the account/image confirmation HMAC and persists controlled category/subtype plus bounded Consumer-confirmed name, brand, and optional SKU; descriptive corrections cannot create a verified product link |
| `POST /api/consumer/outfits` | Consumer | Saves an account-owned outfit of 1–10 unique wardrobe items |
| `POST /api/wears` | Consumer | Atomically increments owned-item totals and writes a timestamped product wear event when the garment is registry-linked |
| `GET/PATCH /api/consumer/consent` | Consumer | Reads or changes that account’s brand-aggregate opt-in |
| `POST /api/agents/consumer` | Consumer | Accepts a free-form message plus at most eight bounded chat turns, reloads that account’s current garments/wears/outfits, and returns a grounded answer with validated save/wear actions |
| `GET /api/brand/products` | Brand | Lists only products enrolled by that brand account |
| `POST /api/brand/products` | Brand | Encrypts authorized three-view images and registers brand-bound SKU identity |
| `POST /api/brand/metrics` | Brand | Confirms product ownership, filters owners and wear events by consent, applies `k ≥ 25`, then returns total/average/median usage, engagement, repeat wear, frequency distribution, and an eight-week trend |
| `POST /api/brand/community-metrics` | Brand | Confirms product ownership, then aggregates intentionally public outfit appearances, likes, recreate requests, outbound clicks, and pairings without returning handles or account identifiers; this is explicitly separate from private `k ≥ 25` wear analytics |
| `POST /api/agents/brand` | Brand | Accepts a free-form strategy question plus bounded chat history, reloads the selected brand-owned product and consent-filtered aggregate, and discusses only released metrics; below `k=25`, the context contains the privacy rule rather than suppressed values |
| `GET/POST/PATCH /api/community` | Public/Consumer | Lists posts, publishes one explicitly selected account-owned saved outfit, and records likes. Each piece has an explicit product-resolution state; only exact verified products project brand links. Public allowlisting removes owner/outfit/wardrobe IDs and storage keys |
| `GET /api/community/images/[postId]/[garmentId]` | Public | Streams an image only when that public garment ID is explicitly attached to the published post; returns no S3 key or signed private-storage URL |
| `POST /api/community/[postId]/recreate` | Consumer | Loads the public outfit plus only the signed-in account's wardrobe, returns deterministic exact/substitute/missing matches with component evidence and coverage, then records an identity-free recreate-request event |
| `GET /api/products/[productId]/outbound` | Public | Reloads the enrolled product, validates its stored public HTTPS destination, optionally validates source-post attribution, records a privacy-safe click, and redirects; accepts no destination query parameter |
| `GET/POST /api/brand/looks` | Brand | Lists that account's Brand Looks or creates one from only that account's enrolled product IDs; may publish a clearly labeled Brand Look to Community |

## Image security

- Types: JPG, PNG, WebP.
- Browser preparation: mobile images are resized to at most 1800 px and approximately 1.2 MB each before the AWS request, preventing Amplify from replacing JSON with a 413 hosting response.
- Server maximum: 5 MB per view and 16 MB per prepared three-view request.
- Public access: blocked.
- Browser access: one-hour signed S3 link.
- Save authorization: HMAC binds owner, S3 key, AI garment fields, and registry result.
- Production provider failure: returns explicit manual review; no AI attributes or verified product link are invented.

## PLANNED — similar products (not yet implemented)

> **Status: PLANNED. This endpoint does not exist yet.** The client is already built against this contract and probes for it on load; while it returns 404 the "Find similar" control is never rendered, so there is no dead button. Implementing this exactly is Work Order B.

```text
GET /api/products/similar?garmentId=<publicGarmentId>&postId=<postId>
```

Response:

```jsonc
{
  "similar": [
    {
      "registryProductId": "…",   // required
      "sku": "…",
      "name": "…",                // required
      "brand": "…",
      "brandSlug": "…",
      "category": "…",
      "price": 110,                // optional
      "currency": "USD",          // optional
      "score": 82,                 // 0–100
      "reasons": ["Same category", "Similar color"],
      "commerceState": "SIMILAR_AVAILABLE",
      "outboundUrl": "/api/products/<id>/outbound"  // same-origin path only
    }
  ]
}
```

Rules the implementation must honour:

- Rank **enrolled registry products only**. Never rank another consumer's wardrobe items, and never expose private wardrobe data.
- **Same category only.** A suggestion must never cross categories.
- Exclude the source product itself, and exclude archived products.
- Reuse the weighted comparison already proven in `lib/recreate-look.ts` and return inspectable `reasons`.
- A suggestion is **never** an exact match. The client enforces this defensively — `parseSimilarSuggestions()` downgrades any `EXACT_*` state to `SIMILAR_AVAILABLE`/`NO_DESTINATION` and rejects any `outboundUrl` that is not a same-origin path, so a suggestion cannot become an open redirect even if the server misbehaves.
- Rate limit it like other public read endpoints.

## DynamoDB key design

```text
USER#<id> / PROFILE
USER#<id> / GARMENT#<id>
USER#<id> / OUTFIT#<time>#<id>
USER#<brand-id> / PRODUCT#<id>
PRODUCT#<product-id> / WEAR#<time>#<id>
COMMUNITY / POST#<time>#<id>
COMMUNITY / EVENT#<time>#<id>               (identity-free public interactions)
AGGQ#<brand-id> / PRODUCT#<product-id>   (aggregate enumeration-budget log)
```

The `GSI1` index supports normalized email lookup, registry listing, and product-to-owner aggregation without scanning unrelated wardrobe partitions.

Accounts and seeded domain records may carry `dataClassification: DEMO | PILOT | REGULAR`. Normal registration always creates `REGULAR`; the deterministic seed writes only `DEMO`; and the guarded `scripts/classify-pilot-brand.mjs` path refuses to reclassify a synthetic account as `PILOT`.
