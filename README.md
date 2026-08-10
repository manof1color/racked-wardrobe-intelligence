# Racked

**Privacy-first wardrobe intelligence for real consumers and real brands.**

Live application: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. A separate, clearly marked [25-person synthetic test cohort](docs/test-cohort.md) exists only to demonstrate the privacy threshold and is never represented as commercial evidence. Start with the [competition checklist](docs/competition-checklist.md), then use the [presentation script](docs/demo-script.md).

## The problem

Purchase history tells a brand what sold, but not whether the product is actually worn, repeats an ignored category, or works with what someone owns. Racked lets a consumer build a useful private wardrobe and lets a verified brand see only privacy-safe aggregate wear for its own products.

## Working product flows

### Consumer

1. Create a Consumer account with explicit image-processing consent.
2. Upload real front, back, and label photos from the phone camera or photo library.
3. Amazon Bedrock analyzes visible garment attributes and label text. Major-brand names are suggestions; enrolled SKU/GTIN matches are verified.
4. The server rotates the front photo, preserves it unmodified as private evidence, and produces a separate auto-cropped display version that shows just the garment — falling back to the original framing whenever the crop is not confident.
5. The consumer confirms or edits the garment name, brand label, and optional SKU before saving. Unverified garments remain usable.
6. The Looks view builds outfits from saved garment photos in a horizontal slide view, saves them, and records wear.
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
- If image analysis fails, Racked keeps the submitted front photo as private evidence and opens an explicitly unverified manual-review form; it never invents fallback attributes. Back and label photos are processed in request memory and are not persisted for consumers.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

## Rubric map

| Criterion | Judge evidence |
| --- | --- |
| Problem & relevance — 20% | This README and [one-page summary](docs/one-page-summary.md) |
| Functionality — 25% | Real accounts, uploads, persistent wardrobe/outfits, brand registry, live AWS URL |
| AI & innovation — 20% | Bedrock vision, human confirmation, garment display preparation, and two multi-turn agents that retrieve fresh role-bounded context for every message |
| Code, docs & GitHub — 15% | Typed modules, tests, CI/CodeQL, architecture/privacy/API documents, incremental PRs |
| UX & polish — 10% | Responsive Consumer app, camera upload, empty/loading/error states, installable PWA |
| Business impact — 10% | Actual-wear, active-owner, repeat-wear, brand registry, and thresholded intelligence |
| Bonus | Consent, private object storage, k-anonymity, accessibility, cross-disciplinary analytics |

## Business model & pricing (proposed — not currently billed)

Consumers stay free to solve the cold-start problem; the brand side carries revenue because actual-wear intelligence is what brands cannot get elsewhere; and the Starter tier exists because an emerging brand often cannot reach the `k ≥ 25` threshold immediately — it prices that waiting period honestly with benchmarks and progress visibility only. No tier weakens consent or the privacy threshold. See the labeled in-app [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing) page.

| Tier | Price | Includes |
| --- | --- | --- |
| Consumer Free | $0 | Wardrobe logging, wear tracking, limited Hanger queries |
| Consumer Pro | $6.99/mo or $59/yr | Unlimited Hanger, advanced analytics, outfit export |
| Brand SKU Enrollment | $25 one-time + $10/yr/SKU | Verification, registry matching |
| Brand Starter (below k≥25) | $29/mo | Category benchmarks, progress-to-threshold visibility only |
| Brand Standard (post-threshold) | $149/mo | Full aggregate dashboard, CSV export |
| Brand Growth | $299/mo | Standard + multi-product comparison + Hanger strategy artifacts |
| A la carte strategy artifact | $15/artifact | For non-subscribers |

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
- [Clearly labeled test cohort](docs/test-cohort.md)
- [Privacy and ethics](docs/privacy-and-ethics.md)
- [AWS deployment](docs/aws-deployment.md)
- [Presentation script](docs/demo-script.md)
- [One-page summary](docs/one-page-summary.md)

## Status and claims

The AWS production data stack and Bedrock model access are configured. The application does not claim garment recognition accuracy, sales lift, fit prediction, or production-scale validation until those are measured in an opt-in pilot.
