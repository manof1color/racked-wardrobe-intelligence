# Racked

**Privacy-first wardrobe intelligence for real consumers and real brands.**

Live application: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

> **Judge note:** Racked no longer relies on public sample accounts, seeded wardrobes, test-upload buttons, or fictional brand metrics. New Consumer and Brand accounts begin empty and persist to account-owned AWS records. Start with the [competition checklist](docs/competition-checklist.md), then use the [presentation script](docs/demo-script.md).

## The problem

Purchase history tells a brand what sold, but not whether the product is actually worn, repeats an ignored category, or works with what someone owns. Racked lets a consumer build a useful private wardrobe and lets a verified brand see only privacy-safe aggregate wear for its own products.

## Working product flows

### Consumer

1. Create a Consumer account with explicit image-processing consent.
2. Upload a real front photo from the phone camera or photo library.
3. Amazon Bedrock analyzes visible garment attributes.
4. The server rotates, trims, and resizes the image into an avatar-ready private asset.
5. The consumer confirms the result before it is stored in their wardrobe.
6. The Avatar view layers saved garment photos, saves outfits, and records wear.
7. The Stylist Agent builds only from that account’s owned pieces and recorded context.
8. The consumer may separately opt in to anonymous brand aggregates and may publish a selected outfit to Community.

### Brand

1. Create a Brand account bound to the represented brand name.
2. Enroll authorized front, back, and label images with SKU/MPN, optional GTIN, aliases, and approved label text.
3. Consumer label evidence can connect a wardrobe item to the brand-authorized registry record.
4. The Brand dashboard reports actual wears, active owners, and repeat-wear rate only when at least 25 opted-in owners qualify.
5. The Brand Wear Intelligence Agent is restricted to the brand’s own products and the same thresholded aggregates.

## Production architecture

```text
AWS Amplify Hosting (Next.js SSR and API routes)
  ├─ signed HTTP-only Consumer and Brand sessions
  ├─ Amazon Bedrock / Nova Lite multimodal garment analysis
  ├─ DynamoDB account-owned users, garments, outfits, wear, catalog, consent, posts
  └─ private encrypted S3 images returned through short-lived signed links
```

The Amplify compute role has only the DynamoDB, S3-object, and Bedrock permissions required by these flows. No AWS credentials or secrets are committed to GitHub.

## Security and privacy boundaries

- Passwords are salted with a random value and hashed with scrypt.
- Sessions are signed, expiring, secure, HTTP-only cookies.
- Garment saves require a server-signed confirmation token tied to the account and private image key.
- S3 public access is blocked; URLs expire after one hour.
- Consumer photos and raw wardrobe records are never returned to brands.
- Brand metrics count only opted-in owners and fail closed below `k ≥ 25`.
- Production image analysis stops if Bedrock fails; it never saves invented fallback attributes.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

## Rubric map

| Criterion | Judge evidence |
| --- | --- |
| Problem & relevance — 20% | This README and [one-page summary](docs/one-page-summary.md) |
| Functionality — 25% | Real accounts, uploads, persistent wardrobe/outfits, brand registry, live AWS URL |
| AI & innovation — 20% | Bedrock vision, human confirmation, avatar preparation, two account-bounded agents |
| Code, docs & GitHub — 15% | Typed modules, tests, CI/CodeQL, architecture/privacy/API documents, incremental PRs |
| UX & polish — 10% | Responsive Consumer app, camera upload, empty/loading/error states, installable PWA |
| Business impact — 10% | Actual-wear, active-owner, repeat-wear, brand registry, and thresholded intelligence |
| Bonus | Consent, private object storage, k-anonymity, accessibility, cross-disciplinary analytics |

## Local setup

Requirements: Node.js 22+ and pnpm.

```bash
pnpm install --frozen-lockfile
copy .env.example .env.local
pnpm dev
```

Local account and upload mutations require a DynamoDB table, private S3 bucket, and AWS credentials with the same narrow permissions as `infra/template.yaml`. Never commit `.env.local`.

## Verification

```bash
pnpm lint
pnpm test
pnpm build
```

The repository keeps automated unit fixtures under `tests/` for repeatable verification, but no test-upload images or fixture-loading controls are shipped in the public application.

## Install on a phone

Open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com). On iPhone use **Safari → Share → Add to Home Screen**. On Android use **Chrome → Install app** or **Add to Home screen**.

## Documentation

- [Competition checklist](docs/competition-checklist.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md)
- [AI use and limitations](docs/ai-use-log.md)
- [Privacy and ethics](docs/privacy-and-ethics.md)
- [AWS deployment](docs/aws-deployment.md)
- [Presentation script](docs/demo-script.md)
- [One-page summary](docs/one-page-summary.md)

## Status and claims

The AWS production data stack and Bedrock model access are configured. The application does not claim garment recognition accuracy, sales lift, fit prediction, or production-scale validation until those are measured in an opt-in pilot.
