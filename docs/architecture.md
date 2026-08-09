# Production architecture and trust boundaries

## Request path

```text
Phone/browser
  → AWS Amplify HTTPS
  → Next.js server routes
      → DynamoDB (account-owned structured state)
      → private S3 (authorized and consumer garment images)
      → Amazon Bedrock Nova Lite (visible garment analysis)
```

## Identity

`POST /api/auth/register` creates a Consumer or Brand record. Email is normalized, passwords are salted and scrypt-hashed, and a signed HTTP-only session carries only the account subject, role, and expiry. Protected pages enforce the role on the server.

## Consumer ownership boundary

All Consumer records use `PK=USER#<subject>` with typed sort keys such as `GARMENT#`, `OUTFIT#`, and `PROFILE`. An analyzed garment image is saved under `wardrobe/<subject>/…` in private S3. The confirmation API rejects an image outside that prefix and verifies a server HMAC over the account, key, garment fields, and registry result.

## Brand ownership boundary

Brand products use the same account partition with `PRODUCT#<id>` sort keys. The brand name comes from the authenticated account, not a submitted form field. Authorized product images are private. A cross-product registry index contains only product registry records needed for label/SKU resolution.

## Image and AI path

1. Validate JPG/PNG/WebP and size before processing.
2. Require front, back, and label views, then send only those views to Amazon Bedrock with instructions that prohibit person or demographic inference.
3. Parse the structured visible-attribute result.
4. Prefill recognized major-brand names only as editable suggestions; verify identity only against a brand-enrolled GTIN or brand-and-SKU record.
5. Use Sharp to rotate, trim a plain background, resize, and encode an avatar-ready PNG.
6. Store privately and return a one-hour signed link plus server confirmation token.
7. Require human confirmation and allow bounded name, brand, and SKU corrections before creating the wardrobe record. Corrections never create a registry product link.

In production, provider failure opens an explicitly unverified manual-review result. The Consumer can save their own reviewed labels, but Racked creates no invented AI attributes or verified product link.

## Brand analytics boundary

Garments connected to an enrolled product are indexed by product ID. Brand metrics first confirm product ownership, then retrieve connected garments, batch-read only the relevant consent flags, remove non-opted-in owners, and enforce `k ≥ 25` before computing actual wears, active owners, or repeat-wear rate.

## AWS infrastructure

`infra/template.yaml` provisions:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a future OIDC migration;
- an Amplify compute role limited to required DynamoDB, S3-object, and Bedrock actions.

## Explicit non-claims

The avatar is an outfit visualizer, not photorealistic virtual try-on or body-fit prediction. Racked does not predict purchase likelihood, sales lift, identity, income, age, gender, ethnicity, or body measurements.
