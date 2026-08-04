# Architecture

## Design goal

Deliver one end-to-end wardrobe-to-product-to-explainable-match workflow that is reliable for judging and can migrate to production services without rewriting the scoring model.

## Runtime views

### Checked-in competition demo

```text
Public landing/login
  → POST /api/auth/demo validates fictional credentials + consent
  → signed HTTP-only SameSite session
  → server-enforced /consumer or /brand route
  → typed deterministic seed data
  → pure matching/metrics/privacy modules
```

This mode requires no cloud credentials or model key. Session changes reset on reload by design and are labeled as demo behavior.

### AWS target

```text
Browser
  → AWS Amplify Hosting (Next.js 15 SSR, static pages, API routes)
  → Amazon Cognito user pool (OIDC identity; Consumer/Brand/Admin groups)
  → server authorization boundary
  → Amazon DynamoDB (structured records and score components)
  → private Amazon S3 bucket (validated temporary uploads)
  → optional multimodal provider adapter (server-only key)
```

AWS documents managed Next.js SSR/API-route hosting through Amplify and OIDC identity through Cognito user pools. The precise owner-run sequence is in [aws-deployment.md](aws-deployment.md).

## Domain model

| Model | Purpose | Sensitive boundary |
| --- | --- | --- |
| User / Role | Identity and Consumer/Brand/Admin authorization | Cognito subject; email excluded from brand views |
| Consent | Versioned opt-in, timestamp, withdrawal | Required before wardrobe analysis |
| WardrobeItem | Confirmed attributes and optional private image key | Owner-only |
| WearEvent | Garment use timestamp | Owner-only; aggregate-only to brands |
| Outfit / OutfitItem | Pairing relationships | Owner-only; aggregate-only to brands |
| Brand / Product / ProductAttribute | Brand catalog and confirmed product facts | Brand-owned |
| MatchResult / ScoreComponent / MatchReason | Auditable score and grounded explanation | Consumer-owned or thresholded segment aggregate |
| Segment | Minimum-size anonymous cohort | Suppressed below 25 members |

The demo implements these concepts in typed seed structures; `infra/template.yaml` creates production storage boundaries. A DynamoDB single-table key design can use `PK=USER#<subject>` or `PK=BRAND#<id>` with typed sort-key prefixes. Separate aggregate partitions ensure brand requests never query raw consumer records.

## Trust boundaries

1. The browser is untrusted. It does not receive `SESSION_SECRET`, model keys, or AWS credentials.
2. Authentication is not authorization. Every protected page/API must verify the session and required role on the server.
3. Raw Consumer records and private S3 keys are never returned by Brand endpoints.
4. Uploads are allowlisted to JPG/PNG/WebP, limited to 5 MB, renamed server-side, scanned in a production extension, and deleted after attribute extraction.
5. Explanations consume stored score components. They cannot make new predictions.
6. Aggregate release is gated by `MINIMUM_COHORT_SIZE = 25`.

## Reliability strategy

- Matching and metrics are pure deterministic functions and have no network dependency.
- External model output is treated as a suggestion requiring confirmation.
- Missing or invalid sessions fail closed.
- Empty/recalculation, validation, success, and provider-fallback states are visible.
- Tests protect score weights, deterministic ordering, explanation boundaries, session integrity, and privacy suppression.

## Deliberate MVP exclusions

No social feed, resale marketplace, payments, virtual try-on, full Shopify integration, demographic targeting, sales forecasting, or production PII. These would dilute the competition’s core value proof and expand risk.
