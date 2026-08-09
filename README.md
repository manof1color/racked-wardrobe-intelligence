# Racked

**Privacy-first wardrobe intelligence for real consumers and real brands.**

Live application: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. A separate, clearly marked [25-person synthetic test cohort](docs/test-cohort.md) exists only to demonstrate the privacy threshold and is never represented as commercial evidence. Start with the [competition checklist](docs/competition-checklist.md), then use the [presentation script](docs/demo-script.md).

## The problem

Purchase history tells a brand what sold, but not whether the product is actually worn, repeats an ignored category, or works with what someone owns. Racked lets a consumer build a useful private wardrobe and lets a verified brand see only privacy-safe aggregate wear for its own products.

## Business model (proposed, not validated)

Consumers would use the core wardrobe, outfit, and wear-tracking experience free because that standalone utility is what creates voluntary long-term participation. Brands would be the paying customer. An MVP could test a **$99/month Starter** tier for product enrollment and pre-threshold catalog tools, a **$249/month Insights** tier for a limited number of qualifying SKUs and privacy-safe aggregate dashboards, and an optional **$49 per exported aggregate report** for brands that do not need continuous access. A later enterprise offer could license independently thresholded category benchmarks under annual contracts; it would never license individual wardrobes, identities, photos, or row-level wear histories. These figures are pricing hypotheses for pilot interviews, not validated demand or revenue.

## Working product flows

### Consumer

1. Create a Consumer account with explicit image-processing consent.
2. Upload real front, back, and label photos from the phone camera or photo library.
3. Amazon Bedrock analyzes visible garment attributes and label text. Major-brand names are suggestions; enrolled SKU/GTIN matches are verified.
4. The server rotates, trims, and resizes the image into an avatar-ready private asset.
5. The consumer confirms or edits the garment name, brand label, and optional SKU before saving. Unverified garments remain usable.
6. The Avatar view layers saved garment photos, saves outfits, and records wear.
7. Hanger opens from the bottom of the dashboard as a multi-turn stylist. Every message reloads the account’s current wardrobe, wear history, and saved outfits; grounded recommendations can be saved or recorded as worn.
8. The consumer may separately opt in to anonymous brand aggregates and may publish a selected outfit to Community.

### Brand

1. Create a Brand account bound to the represented brand name.
2. Enroll authorized front, back, and label images with SKU/MPN, optional GTIN, aliases, and approved label text.
3. Consumer label evidence can connect a wardrobe item to the brand-authorized registry record.
4. The Brand dashboard reports actual wears, active owners, and repeat-wear rate only when at least 25 opted-in owners qualify.
5. Hanger on the Brand dashboard supports follow-up strategy conversations but is restricted to the brand’s own products and the same consent-filtered, `k ≥ 25` aggregates.

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
- If image analysis fails, Racked preserves the three submitted photos and opens an explicitly unverified manual-review form; it never invents fallback attributes.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

## Rubric map

| Criterion | Judge evidence |
| --- | --- |
| Problem & relevance — 20% | This README and [one-page summary](docs/one-page-summary.md) |
| Functionality — 25% | Real accounts, uploads, persistent wardrobe/outfits, brand registry, live AWS URL |
| AI & innovation — 20% | Bedrock vision, human confirmation, avatar preparation, and two multi-turn agents that retrieve fresh role-bounded context for every message |
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

The current suite contains **63 automated tests**. The repository keeps automated unit fixtures under `tests/` for repeatable verification, but no test-upload images or fixture-loading controls are shipped in the public application.

## Install on a phone

Open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com). On iPhone use **Safari → Share → Add to Home Screen**. On Android use **Chrome → Install app** or **Add to Home screen**.

## Documentation

- [Competition checklist](docs/competition-checklist.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md)
- [AI use and limitations](docs/ai-use-log.md)
- [Clearly labeled test cohort](docs/test-cohort.md)
- [Privacy and ethics](docs/privacy-and-ethics.md)
- [AWS deployment](docs/aws-deployment.md)
- [Presentation script](docs/demo-script.md)
- [One-page summary](docs/one-page-summary.md)

## Current status and claims

Racked is deployed and publicly accessible through [AWS Amplify at the production URL](https://main.d2iv0khybuuaeh.amplifyapp.com). The production data stack and Bedrock model access are configured, and GitHub `main` drives the Amplify deployment described in [the AWS deployment guide](docs/aws-deployment.md). The application does not claim garment recognition accuracy, sales lift, fit prediction, validated pricing, or production-scale validation until those are measured in an opt-in pilot.
