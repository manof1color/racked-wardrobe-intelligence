# Racked

**Privacy-first wardrobe intelligence for real consumers and real brands.**

## Live demo

**Production URL: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)** — deployed on AWS Amplify from `main`; every merge auto-deploys. The planned business model is on the labeled [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing) page.

**Headline demonstration number:** the clearly labeled synthetic demo cohort records **76 confirmed wear events across 25 opted-in owners (88% engagement)** for one enrolled SKU — the actual-wear signal a brand cannot see from purchase data alone, released only because the cohort clears the `k ≥ 25` privacy threshold.

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. The [25-person synthetic test cohort](docs/test-cohort.md) exists only to demonstrate the privacy threshold and is never represented as commercial evidence; credentials are provided to judges separately, never committed to GitHub. Start with the [competition checklist](docs/competition-checklist.md), then use the [presentation script](docs/demo-script.md).

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
                 Phone / desktop browser (PWA installable)
                     │  HTTPS · signed HTTP-only session cookie
                     ▼
      ┌──────────────────────────────────────────────────────┐
      │  AWS Amplify Hosting — Next.js 15 SSR + API routes   │
      │  auth (scrypt) · role checks · rate limits · HMAC    │
      │  garment-save confirmation · aggregate-only review   │
      └──────┬───────────────────┬──────────────────┬────────┘
             │                   │                  │
             ▼                   ▼                  ▼
   Amazon Bedrock          DynamoDB (on-demand)   Private S3 (encrypted,
   Nova Lite vision:       single table:          public access blocked):
   garment analysis,       USER#/GARMENT#/OUTFIT#/ evidence photo +
   category classify,      PRODUCT#/WEAR#/         auto-cropped display
   Hanger agents           COMMUNITY/AGGQ#          image, 1-hour links
             │                   │
             └──── consent filter → k ≥ 25 threshold → enumeration budget
                   (brands receive released aggregates only — never
                    names, emails, photos, raw wardrobes, or owner IDs)
```

The Amplify compute role has only the DynamoDB, S3-object, and Bedrock permissions required by these flows (`infra/template.yaml`). No AWS credentials or secrets are committed to GitHub.

## Key files

```text
app/api/auth/…                 Register/login/logout: scrypt hashes, signed sessions, rate limits
app/api/garments/classify/     Adaptive first-photo category classification (photo plan)
app/api/garments/analyze/      Bedrock vision + registry identity + evidence/display image storage
app/api/consumer/…             Wardrobe, outfits, consent — always scoped to the signed-in account
app/api/wears/                 Confirmed wear events + saved-outfit wear totals
app/api/brand/…                Brand-owned products and consent-filtered k≥25 aggregates
app/api/agents/…               Consumer & Brand Hanger conversations (fresh context per message)
lib/server/production-store.ts Every DynamoDB/S3 operation, ownership checks, enumeration budget
lib/garment-analysis.ts        Vision prompts, registry matching, brand-autofill boundary
lib/garment-crop.ts            Evidence-preserving auto-crop with tested fallbacks
lib/photo-plan.ts              Category → photo-plan agent logic (identity-free by construction)
lib/hanger-conversation.ts     Hanger prompts, history bounds, brand output privacy review
lib/privacy.ts                 k ≥ 25 gate + product-enumeration budget
lib/rate-limit.ts              Sliding-window abuse limits for auth/AI/community endpoints
components/consumer-dashboard.tsx  Today / Looks / Closet / Outfits views
components/outfit-carousel.tsx     Outfit builder + horizontal slide view of cropped garments
components/brand-dashboard.tsx     Aggregate metrics, charts, CSV export, Hanger dock
tests/ (77 passing)            Privacy, ranking, crop, photo-plan, autofill, rate-limit suites
infra/template.yaml            DynamoDB, S3, least-privilege Amplify compute role
```

## Security and privacy boundaries

- Passwords are salted with a random value and hashed with scrypt.
- Sessions are signed, expiring, secure, HTTP-only cookies.
- Garment saves require a server-signed confirmation token tied to the account and private image key.
- S3 public access is blocked; URLs expire after one hour.
- Consumer photos and raw wardrobe records are never returned to brands.
- Brand metrics count only opted-in owners and fail closed below `k ≥ 25`.
- If image analysis fails, Racked keeps the submitted front photo as private evidence and opens an explicitly unverified manual-review form; it never invents fallback attributes. Back and label photos are processed in request memory and are not persisted for consumers.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

## Rubric evidence

| Criterion | Evidence — where to see it working |
| --- | --- |
| Problem & relevance — 20% | Purchase data shows what sold, not what is worn. The demo cohort's **76 wears / 25 owners / 88% engagement** (synthetic, labeled) is exactly the signal brands lack — this README, [one-page summary](docs/one-page-summary.md) |
| Functionality — 25% | Live AWS URL, real registration/login, three-photo enrollment with evidence + auto-cropped display images, Looks outfit slide view, Saved Outfits with repeat-wear tracking, brand registry, k≥25 aggregate dashboard with CSV export |
| AI & innovation — 20% | Bedrock vision with human confirmation, adaptive photo-plan agent (category-specific shot requests with visible reasoning + user override), AI brand autofill that can never verify, two multi-turn Hanger agents with fresh role-bounded context per message and a server-side aggregate-only output review |
| Code, docs & GitHub — 15% | Typed modules, **77 passing tests** incl. privacy/verification regression suites, CI runs lint + typecheck + tests + build + dependency audit, CodeQL, incremental reviewed PRs ([PROGRESS.md](PROGRESS.md)) |
| UX & polish — 10% | Mobile-first tabs + bottom nav, camera capture, empty/loading/error/suppressed states, horizontal-overflow-safe carousels and tables, installable PWA |
| Business impact — 10% | Actual-wear/active-owner/repeat-wear metrics a brand cannot buy elsewhere (headline: **76 confirmed wears across 25 opted-in owners**, synthetic demo), proposed [pricing model](#business-model--pricing-proposed--not-currently-billed) with an emerging-brand Starter tier |
| Bonus | Explicit consent, private encrypted object storage, k-anonymity + enumeration budget, rate limiting, accessibility-minded semantics, cross-disciplinary analytics |

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
pnpm typecheck
pnpm test
pnpm build
```

All four run in CI on every push and pull request. The suite currently has 77 passing tests (verified 2026-08-10). The repository keeps automated unit fixtures under `tests/` for repeatable verification, but no test-upload images or fixture-loading controls are shipped in the public application.

## Install on a phone

Open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com). On iPhone use **Safari → Share → Add to Home Screen**. On Android use **Chrome → Install app** or **Add to Home screen**.

## Documentation index

Everything above is self-contained; these go deeper.

- [PROGRESS.md](PROGRESS.md) — real merged-PR history of how this was built
- [Competition checklist](docs/competition-checklist.md) — per-criterion evidence checklist
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md) — every route, access level, and abuse control
- [AI use and limitations](docs/ai-use-log.md) — models, prompts, boundaries, failure policy
- [Clearly labeled test cohort](docs/test-cohort.md)
- [Privacy and ethics](docs/privacy-and-ethics.md) — consent, k ≥ 25, brand identity boundary
- [AWS deployment](docs/aws-deployment.md)
- [Presentation script](docs/demo-script.md)
- [One-page summary](docs/one-page-summary.md) — includes the proposed business model

## Status and claims

The AWS production data stack and Bedrock model access are configured. The application does not claim garment recognition accuracy, sales lift, fit prediction, or production-scale validation until those are measured in an opt-in pilot.
