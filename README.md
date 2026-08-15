# Racked

**Brands know what consumers buy. Racked helps them understand what consumers actually wear.**

Racked is a privacy-first wardrobe-intelligence platform with two connected products: a mobile wardrobe and outfit assistant for consumers, and an aggregate actual-wear dashboard for enrolled brands. Consumers receive useful closet organization, styling, wear tracking, and “Recreate This Look” results before any brand relationship exists. Brands receive only consented, minimum-cohort intelligence for their own verified products—never identities, raw wardrobes, or private photos.

When a consumer explicitly publishes an outfit, Racked can also turn real-world wear into product discovery and measurable outbound interest without making the private wardrobe public.

## Live demo

**Production URL: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)** — deployed on AWS Amplify from `main`; every merge auto-deploys. The planned business model is on the labeled [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing) page.

## Competition proof point

The deterministic, clearly labeled synthetic cohort gives **each of three hero products 76 confirmed wears across 25 opted-in owners**. This is not claimed customer traction; it demonstrates the exact post-purchase intelligence Racked can calculate and the privacy gate required before a brand may see it.

| Demonstration signal | Verified synthetic result | Business question it answers |
| --- | ---: | --- |
| Eligible cohort | 25 opted-in owners per hero SKU | Is the group large enough to release safely? |
| Actual use | **76 confirmed wears per hero SKU** | Is the purchased product entering real rotation? |
| Engagement | **22 of 25 active owners (88%)** | How many owners have worn it at least once? |
| Repeat use | **19 of 25 repeat wearers (76%)** | Is the product earning repeated use? |
| Zero-wear opportunity | **3 of 25 owners** | Where might education or styling support help? |
| Public activity for the apparel hero SKU | **11 outfit appearances · 37 inspirations · 15 Recreate requests** | How does actual styling translate into discovery? |

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. The [three-brand, 25-person synthetic demo cohort](docs/test-cohort.md) exercises apparel, footwear, jewelry, private wear analytics, and public Community activity; every seeded record is classified `DEMO` and never represented as commercial evidence. Passwords are provided privately, never committed to GitHub.

## Why this matters

Purchase history stops at the transaction. It cannot show whether a product was worn once, became a repeat favorite, stayed untouched, or anchors outfits with other categories. Racked closes that gap while giving the consumer—not the brand—control of the underlying wardrobe data.

The result is a defensible two-sided loop:

1. **Private consumer utility:** organize a wardrobe, build outfits, record wears, and get grounded styling help.
2. **Consent-based brand intelligence:** release actual-wear aggregates only for verified products and cohorts of at least 25 opted-in owners.
3. **Optional public discovery:** turn only deliberately shared outfits into explainable Recreate results and controlled product destinations.

## Five-minute judge path

1. Open [Community](https://main.d2iv0khybuuaeh.amplifyapp.com/community) to see complete Consumer and Brand Looks with explicit product-resolution states.
2. Use the synthetic Recreate Consumer from the [demo checklist](docs/demo-checklist.md) on **Synthetic Consumer Look 01**. The live deterministic result is **62% coverage**: one exact owned product, one strong owned substitute, and one genuinely missing category.
3. Sign in with a privately supplied synthetic Brand account to inspect the 25-owner privacy threshold, eight-week wear chart, frequency distribution, CSV export, public-look activity, and Brand Hanger.
4. Open a fictional demo product destination to verify that Racked records privacy-safe outbound interest and hands checkout back to the brand; Racked never processes payment.

## Independent evaluation dataset

Racked has selected the corrected CC BY 4.0 [Clothing Dataset for Second-Hand Fashion, version 3](https://zenodo.org/records/13788681) as its external recognition benchmark. It contains **31,638 real garments** plus a separately identified 100-garment annotator-agreement set, with human annotations and front, back, and brand-label photographs where available—the closest public match to Racked's three-view intake. Dataset photographs stay outside GitHub and the production application; only attribution, evaluation code, and aggregate results belong in this repository.

**Accuracy is not claimed yet, and this is not training data.** Racked currently uses Amazon Nova Lite through Bedrock and has not fine-tuned that model on these garments. The benchmark will measure category, subtype, label-text, provider-failure, and AI-only-verification violations without allowing dataset brand text to create verified identity. The exact protocol and honest reporting rules are in [docs/evaluation.md](docs/evaluation.md).

The first reproducible label-coverage audit sampled 1,000 evenly spaced records: **93.9%** map to Racked's broad categories, **62.6%** have source labels specific enough for exact-subtype scoring, and **94.0%** contain usable brand annotations. These percentages measure benchmark compatibility—not model accuracy. The aggregate, image-free report is committed at [`data/evaluation-label-coverage.json`](data/evaluation-label-coverage.json).

## Working product flows

### Consumer

The Consumer **Add** tab now defaults to **Scan a whole look**: one outfit, flat-lay, or closet photo can become up to eight separate editable wardrobe candidates. Choosing or taking a phone photo starts the scan automatically; common iPhone HEIC/HEIF inputs are accepted for browser normalization to a compressed JPEG before private upload, with explicit JPG guidance if an older device cannot decode its source format. Amazon Bedrock detects distinct visible garments, shoes, bags, jewelry, and accessories; the server creates an independent private item image for each candidate. A deterministic edge-connected background pass makes plain backgrounds transparent when it can do so safely; busy scenes retain a tight crop rather than risk erasing the garment. The Consumer selects, edits, and confirms each piece before it becomes a separately tracked wardrobe item. Overlapping or hidden items may require another photo. **Verify one item** preserves the front/back/label evidence flow when product identity matters.

Authenticated navigation behaves like a mobile app: the Racked logo returns to the signed-in role workspace, Community retains the role-appropriate bottom bar, and consumer views have stable deep links. A compact mobile header menu adds role-specific shortcuts—Consumer wardrobe views and Add, or Brand dashboard/products/Looks—without sending the account through the public login flow. It closes on selection, outside tap, or Escape. Visiting `/` or `/login` with a valid session returns the user to their workspace. Only the explicit **Sign out** control ends the session, and a failed logout request leaves the current session in place instead of pretending it succeeded.

#### Test the mobile whole-look scanner

1. Sign in to a Consumer account and open **Add → Scan a whole look**.
2. Take a new picture or choose an existing outfit, flat-lay, or closet photo. The scan begins automatically; there is no second upload button.
3. Wait for the preparation and private-upload status to finish. Racked accepts JPEG, PNG, WebP, HEIC, HEIF, and AVIF sources up to 25 MB, then sends a normalized JPEG analysis copy rather than the original phone file.
4. Review every proposed crop and edit its wardrobe name, category, subtype, or optional unverified brand label. Deselect false detections.
5. Check the confirmation box and choose **Add selected pieces**. Detection alone never writes a garment into the wardrobe.

> **Production verification — August 15, 2026:** after PR [#56](https://github.com/manof1color/racked-wardrobe-intelligence/pull/56) deployed, an authenticated scan of the repository-owned synthetic apparel fixture automatically reached Bedrock and returned one editable T-shirt candidate at 90% confidence. The candidate was not saved. This verifies the deployed selection, preparation, upload, detection, and review path; a physical-iPhone HEIC capture remains the final device-specific test. If an older phone cannot decode its own HEIC/HEIF file in the browser, Racked explains how to use the camera's **Most Compatible** setting or export the image as JPG.

1. Create a Consumer account with explicit image-processing consent.
2. Photograph the front of the piece. An optional AI photo plan proposes a controlled broad category and specific subtype, shows uncertainty alternatives, and requests only the shots that category needs.
3. Amazon Bedrock receives that hypothesis with the back and label views, then confirms or revises it from the combined evidence. The consumer can correct the name, category, subtype, brand, and SKU. Only enrolled SKU/GTIN registry matches are verified — AI text and manual corrections never are.
4. The server rotates the front photo, preserves it unmodified as private evidence, and produces a separate auto-cropped display version that shows just the garment — falling back to the original framing whenever the crop is not confident.
5. The consumer confirms or edits the garment name, category, subtype, brand label, and optional SKU before saving. Unverified garments remain usable.
6. The Looks view builds outfits from saved garment photos in a horizontal slide view, saves them, and records wear.
7. The Outfits tab lists every saved outfit with its pieces and wear total, and records a repeat wear in one tap.
8. Hanger opens from the bottom of the dashboard as a multi-turn stylist. Every message reloads the account’s current wardrobe, wear history, and saved outfits; grounded recommendations can be saved or recorded as worn.
9. In Community, **Recreate with my wardrobe** compares a public outfit only against the signed-in consumer's wardrobe. The result leads with how much of the look they can already build, splits pieces into *use yours* and *you're missing* in plain language, and lets them open any matched piece to see which owned garment was chosen and why. **Shop the Look** then opens an in-app inspection sheet where only an exact registry-verified product with an authorized destination is openable — similar, AI-estimated, unverified, and unavailable pieces are labeled as such rather than sold, with affiliate disclosure where relevant. The rate-limited Similar Products API separately ranks only enrolled, available, same-category registry products with inspectable reasons; a suggestion never becomes an exact-match claim or exposes a consumer wardrobe.
10. The consumer may separately opt in to anonymous brand aggregates and may publish one explicitly selected saved outfit to Community. Every public garment gets a new public ID; private wardrobe IDs and S3 keys never enter the feed.

### Brand

1. Create a Brand account bound to the represented brand name.
2. Enroll authorized front, back, and label images with SKU/MPN, optional GTIN, aliases, and approved label text.
3. Consumer label evidence can connect a wardrobe item to the brand-authorized registry record.
4. The Brand dashboard reports actual wears, active owners, and repeat-wear rate only when at least 25 opted-in owners qualify.
5. Hanger on the Brand dashboard supports follow-up strategy conversations but is restricted to the brand’s own products and the same consent-filtered, `k ≥ 25` aggregates.
6. A brand can create a clearly labeled Brand Look using only its enrolled products. Optional product/affiliate destinations are validated public HTTPS links; Racked records aggregate outbound interest and redirects to external checkout.

## Why the AI is substantive

- **Multi-piece garment vision:** Amazon Bedrock instance-detects each visible wardrobe piece in a general photo, returns bounded coordinates and controlled attributes, and lets the server generate a separate private item crop/cutout and human-confirmed wardrobe record for every selected detection. Edge-connected plain backgrounds become transparent when safe; ambiguous backgrounds remain opaque. It never infers personal traits or grants verified product identity.
- **Garment vision:** Amazon Bedrock analyzes front, back, and label evidence into a controlled category, subtype, color, pattern, material, style, confidence, alternatives, and visible evidence. Additional views may revise the first-photo hypothesis.
- **Consumer Hanger:** a multi-turn agent reloads only the signed-in consumer’s wardrobe, wear history, and saved outfits, then returns grounded styling guidance and validated save/wear actions.
- **Brand Hanger:** a separate agent receives only that brand’s enrolled product plus privacy-released aggregate wear and public-community metrics; suppressed cohorts remain suppressed in the prompt.
- **Explainable decisions:** Recreate This Look and Similar Products use inspectable weighted attributes rather than an opaque score. Similarity can suggest a substitute, but only authorized registry GTIN or brand-plus-SKU evidence can verify exact identity.

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
app/api/garments/classify/     Adaptive first-photo category + subtype hypothesis (photo plan)
app/api/garments/analyze/      Bedrock vision + registry identity + evidence/display image storage
app/api/garments/detect/       One-photo multi-piece detection + private per-garment crops
app/api/consumer/…             Wardrobe, outfits, consent — always scoped to the signed-in account
app/api/wears/                 Confirmed wear events + saved-outfit wear totals
app/api/brand/…                Brand-owned products and consent-filtered k≥25 aggregates
app/api/agents/…               Consumer & Brand Hanger conversations (fresh context per message)
app/api/community/images/      Public post-scoped image proxy; never exposes private S3 keys
app/api/community/[postId]/    Signed-in Recreate This Look comparison
app/api/products/similar/      Rate-limited registry-only product suggestions
lib/server/production-store.ts Every DynamoDB/S3 operation, ownership checks, enumeration budget
lib/garment-analysis.ts        Vision prompts, registry matching, brand-autofill boundary
lib/look-garment-detection.ts  Bounded instance detection, coordinates, deduplication, trust boundary
lib/garment-taxonomy.ts        Controlled categories, subtypes, and bounded uncertainty
lib/evaluation-dataset.ts      External-dataset normalization, deterministic sampling, scoring
lib/outfit-contracts.ts        Exact/estimated/similar/generic/unavailable product states
lib/recreate-look.ts           Deterministic owned/substitute/missing scoring with evidence
lib/similar-products.ts        Same-category suggestions using the same scoring weights
lib/commerce.ts                Public-HTTPS validation and controlled destination states
lib/brand-looks.ts             Brand-owned authorization for Brand Looks
lib/garment-crop.ts            Evidence-preserving auto-crop with tested fallbacks
lib/garment-cutout.ts          Conservative edge-connected transparency for detected pieces
lib/photo-plan.ts              Category → photo-plan agent logic (identity-free by construction)
lib/hanger-conversation.ts     Hanger prompts, history bounds, brand output privacy review
lib/privacy.ts                 k ≥ 25 gate + product-enumeration budget
lib/rate-limit.ts              Sliding-window abuse limits for auth/AI/community endpoints
components/consumer-dashboard.tsx  Today / Looks / Closet / Outfits views
components/look-scan-uploader.tsx  Select/edit/save UI for one-photo multi-piece intake
components/workspace-mobile-nav.tsx Role-aware Consumer/Brand mobile navigation
components/outfit-carousel.tsx     Outfit builder + horizontal slide view of cropped garments
components/brand-dashboard.tsx     Aggregate metrics, charts, CSV export, Hanger dock
tests/                         Privacy, recognition, evaluation, commerce, Brand Looks, Recreate suites
infra/template.yaml            DynamoDB, S3, least-privilege Amplify compute role
```

## Security and privacy boundaries

- Passwords are salted with a random value and hashed with scrypt.
- Sessions are signed, expiring, secure, HTTP-only cookies.
- Garment saves require a server-signed confirmation token tied to the account and both private image keys.
- S3 public access is blocked; URLs expire after one hour.
- Consumer photos and raw wardrobe records are never returned to brands. Community publishes only a selected saved outfit, replaces wardrobe IDs with public garment IDs, and serves its presentation through a post-scoped image proxy. The public allowlist cannot serialize owner IDs, saved-outfit IDs, private S3 keys, or database keys.
- Brand metrics count only opted-in owners and fail closed below `k ≥ 25`. A DynamoDB-backed enumeration budget additionally caps how many distinct products one brand account can pull aggregates for in a rolling window, defeating differencing attacks across SKUs.
- **Brand identity is never AI-granted.** A brand name read from a photo, typed by a consumer, or matched against the major-brand allowlist only prefills an editable, clearly unverified label — even when a brand account already exists under that name. Verified identity requires registry GTIN or brand-plus-SKU evidence, and that rule is locked by regression tests.
- Sliding-window rate limits protect registration, sign-in (per client and per email), garment classification and analysis, both Hanger agents, brand metrics, and Community writes. Counters are per compute instance — a documented first layer, not a WAF replacement.
- If image analysis fails, Racked keeps the submitted front photo as private evidence and opens an explicitly unverified manual-review form; it never invents fallback attributes. Back and label photos are processed in request memory and are not persisted for consumers.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

## Rubric evidence

| Criterion | Evidence — where to see it working |
| --- | --- |
| Problem & relevance — 20% | Purchase data shows what sold, not what is worn. Each hero SKU demonstrates **76 wears / 25 owners / 88% engagement / 76% repeat use** (synthetic, labeled)—the post-purchase signal brands lack |
| Functionality — 25% | Live AWS PWA, real registration/login, three-photo enrollment, Saved Outfits with repeat wear, Community publishing, Recreate This Look, Brand Looks, controlled outbound destinations, and a k≥25 dashboard with charts and CSV export |
| AI & innovation — 20% | Bedrock multi-view garment vision, distinct context-grounded Consumer and Brand Hanger agents, and explainable Recreate/Similar Product scoring that never turns similarity into exact ownership |
| Code, docs & GitHub — 15% | Typed modules, **151 passing tests** incl. multi-piece detection, cutout safety, authenticated menu routing, mobile upload compatibility, evaluation, community, commerce, ownership, and privacy suites; CI runs lint + typecheck + tests + build + audit, CodeQL, and incremental PRs ([PROGRESS.md](PROGRESS.md)) |
| UX & polish — 10% | Mobile-first tabs + bottom nav, camera capture, empty/loading/error/suppressed states, horizontal-overflow-safe carousels and tables, installable PWA |
| Business impact — 10% | Per hero SKU: **76 wears, 22 active owners, 19 repeat wearers**; for the apparel hero: **11 public outfit appearances, 37 inspirations, 15 Recreate requests** (all synthetic demonstration data), plus a proposed [pricing model](#business-model--pricing-proposed--not-currently-billed) |
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
pnpm audit:prod
```

All five run in CI on every push and pull request. The suite currently has 151 passing tests (verified 2026-08-16). The repository keeps automated unit fixtures under `tests/` for repeatable verification, but no test-upload images or fixture-loading controls are shipped in the public application.

## Install on a phone

Open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com). On iPhone use **Safari → Share → Add to Home Screen**. On Android use **Chrome → Install app** or **Add to Home screen**.

## Documentation index

Everything above is self-contained; these go deeper.

- [PROGRESS.md](PROGRESS.md) — real merged-PR history of how this was built
- [Competition checklist](docs/competition-checklist.md) — per-criterion evidence checklist
- [Demo checklist and fallbacks](docs/demo-checklist.md) — pre-flight, accounts, and what to do when something fails live
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md) — every route, access level, and abuse control
- [AI use and limitations](docs/ai-use-log.md) — models, prompts, boundaries, failure policy
- [Independent recognition evaluation](docs/evaluation.md) — 31,638-item source, license, protocol, claim rules
- [Dataset provenance](docs/dataset-provenance.md) — production, synthetic, and external-data boundaries
- [Clearly labeled test cohort](docs/test-cohort.md)
- [Privacy and ethics](docs/privacy-and-ethics.md) — consent, k ≥ 25, brand identity boundary
- [AWS deployment](docs/aws-deployment.md)
- [Presentation script](docs/demo-script.md)
- [One-page summary](docs/one-page-summary.md) — includes the proposed business model

## Status and claims

Multi-piece detection is functional but visibility-dependent: overlapping, occluded, tiny, or blurred items may require a second photo, and every detection remains editable and requires human confirmation. This is intentionally not presented as measured recognition accuracy.

The AWS production data stack and Bedrock model access are configured, and `main` auto-deploys to the live URL above.

Racked does **not** claim garment recognition accuracy, sales lift, purchase intent, demographic inference, photorealistic virtual try-on, body-fit prediction, or production-scale validation. The Looks slide view is a visual outfit composition tool. Private wear metrics are server-computed aggregates over opted-in owners above `k ≥ 25`; separately labeled Community metrics use only intentionally public posts and identity-free interaction events. The three-brand, 25-account cohort is synthetic and classified `DEMO` throughout. Pricing is a proposal; nothing is billed and no payment method is ever collected.
