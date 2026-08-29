# Racked — Privacy-First Wardrobe Intelligence for Consumers and Brands

[![Validate Racked](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml)

**Live application:** https://main.d2iv0khybuuaeh.amplifyapp.com
**Planned pricing:** https://main.d2iv0khybuuaeh.amplifyapp.com/pricing
**GitHub:** https://github.com/manof1color/racked-wardrobe-intelligence
**Stack:** Next.js 15 · React 19 · TypeScript · AWS Amplify (SSR) · DynamoDB · private S3 · Amazon Bedrock (Nova Lite + Stable Image background removal) · GitHub Actions · CodeQL

---

## What This Is

**Brands know what consumers buy. Racked helps them understand what consumers actually wear.**

Racked is a privacy-first wardrobe-intelligence platform with two connected products: a mobile wardrobe and outfit assistant for consumers, and an aggregate actual-wear dashboard for enrolled brands.

The consumer side has to earn its place on its own — organizing a closet, building outfits, recording what actually gets worn, and answering *"how much of this look can I already make?"* — all before any brand relationship exists. Only then do brands receive consented, minimum-cohort intelligence about their own verified products. Never identities, raw wardrobes, or private photos.

The core question: **what happens to a garment after checkout, and how can a brand learn from that without ever seeing someone's closet?**

The answer this system demonstrates: confirmed wear, repeat use, and styling pairings released only above a 25-owner consent threshold — and, when someone explicitly publishes an outfit, that real-world wear becoming product discovery without the private wardrobe behind it ever becoming public.

---

## Competition Proof Point

The deterministic, clearly labeled synthetic cohort gives **each of three hero products 76 confirmed wears across 25 opted-in owners**. This is not claimed customer traction; it demonstrates the exact post-purchase intelligence Racked can calculate and the privacy gate required before a brand may see it.

| Demonstration signal | Verified synthetic result | Business question it answers |
| --- | ---: | --- |
| Eligible cohort | 25 opted-in owners per hero SKU | Is the group large enough to release safely? |
| Actual use | **76 confirmed wears per hero SKU** | Is the purchased product entering real rotation? |
| Engagement | **22 of 25 active owners (88%)** | How many owners have worn it at least once? |
| Repeat use | **19 of 25 repeat wearers (76%)** | Is the product earning repeated use? |
| Zero-wear opportunity | **3 of 25 owners** | Where might education or styling support help? |
| Public activity for the apparel hero SKU | **11 outfit appearances · 37 inspirations · 15 Recreate requests** | How does actual styling translate into discovery? |

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. The [three-brand, 25-person synthetic demo cohort](docs/test-cohort.md) exercises apparel, footwear, jewelry, private wear analytics, and public Community activity; every seeded record is classified `DEMO` and never represented as commercial evidence.

---

## Why This Matters

Purchase history stops at the transaction. It cannot show whether a product was worn once, became a repeat favorite, stayed untouched, or anchors outfits with other categories. Racked closes that gap while giving the consumer — not the brand — control of the underlying wardrobe data.

The result is a defensible two-sided loop:

1. **Private consumer utility:** organize a wardrobe, build outfits, record wears, and get grounded styling help.
2. **Consent-based brand intelligence:** release actual-wear aggregates only for verified products and cohorts of at least 25 opted-in owners.
3. **Optional public discovery:** turn only deliberately shared outfits into explainable Recreate results and controlled product destinations.

---

## Five-Minute Judge Path

1. Open [Community](https://main.d2iv0khybuuaeh.amplifyapp.com/community) to see complete Consumer and Brand Looks with explicit product-resolution states.
2. Use the synthetic Recreate Consumer from the [demo checklist](docs/demo-checklist.md) on **Synthetic Consumer Look 01**. The live deterministic result is **62% coverage**: one exact owned product, one strong owned substitute, and one genuinely missing category.
3. Sign in with a privately supplied synthetic Brand account to inspect the 25-owner privacy threshold, eight-week wear chart, frequency distribution, CSV export, public-look activity, and Brand Hanger.
4. Open a fictional demo product destination, add it to the **Demo Bag**, and complete the clearly labeled **$0.00 purchase simulation**. This proves the commerce journey without collecting payment, shipping, contact, or order data.

---

## Architecture Overview

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

**Infrastructure:** AWS Amplify Hosting (SSR) · DynamoDB single-table, on-demand · private encrypted S3 with public access blocked · Amazon Bedrock Nova Lite in `us-east-2`, plus a US-only Stable Image inference profile for foreground segmentation. The deployed Amplify compute role has scoped DynamoDB, private S3-object, and Bedrock permissions, including the three Stable Image foundation-model ARNs required by the US inference profile. The committed template also describes narrowly scoped SES sending for password recovery, but that separate permission and SES sender readiness are not claimed as deployed. No AWS credentials or secrets are committed to GitHub.

---

## Why the AI Is Substantive

- **Multi-piece garment vision:** Amazon Bedrock instance-detects each visible wardrobe piece in a general photo, returns bounded coordinates and controlled attributes, and lets the server create a separate private item image for every selected detection. A second Bedrock task removes the background without generating or restyling the garment, trims transparent margins, and produces the product-style cutouts used by wardrobe cards and outfit boards. A conservative local edge pass keeps uploads usable when segmentation is unavailable. It never infers personal traits or grants verified product identity.
- **Garment vision:** Bedrock analyzes front, back, and label evidence into a controlled category, subtype, color, pattern, material, style, confidence, alternatives, and visible evidence. Additional views may revise the first-photo hypothesis.
- **Consumer Hanger:** a multi-turn agent reloads only the signed-in consumer's wardrobe, wear history, saved outfits, and private clothing signals from Community Looks that person intentionally saved as inspiration, then returns grounded styling guidance and validated save/wear actions. Current instructions always outrank historical inspiration. Explicitly requested owned garments are locked before scoring—even when recently worn or previously suggested—and the remaining pieces are selected around them. One canonical server selection drives the written list, private photo cards, action IDs, saved title, and flat-lay order; generated prose that names a different owned garment is rejected.
- **Brand Hanger:** a separate agent receives only that brand's enrolled product plus privacy-released aggregate wear and public-community metrics; suppressed cohorts remain suppressed in the prompt.
- **Server-side outfit ranking:** explicit natural-language inclusion requests resolve only to unambiguous, account-owned garments and act as hard constraints. The server then scores the remaining pieces on occasion, weather, requested style, underuse, and time since last worn—never allowing low-wear scoring or the model to override a named piece. Selection is deterministic, exclusions are respected, and unknown or ambiguous descriptions cannot invent an item.
- **Explainable decisions:** Recreate This Look and Similar Products use inspectable weighted attributes rather than an opaque score. Similarity can suggest a substitute, but only authorized registry GTIN or brand-plus-SKU evidence can verify exact identity.

---

## Working Product Flows

### Consumer

**Add from one photo** is the default way in. A single outfit, flat-lay, closet, or shoe-rack photo becomes up to 16 separate wardrobe units:

- **Take photo** opens the rear camera; **Choose image** opens the library — two explicit actions rather than one ambiguous picker.
- JPEG, PNG, WebP, HEIC, HEIF, and AVIF up to 25 MB are accepted, then normalized in the browser to a compressed JPEG before private upload.
- Bedrock scans the full image top-to-bottom and left-to-right, performs a missed-region coverage check, and detects each distinct visible garment, footwear set, bag, or accessory. A matching left/right shoe set is one wearable pair—not two wardrobe entries—and a deterministic shared-pair guard combines the sides if the provider returns separate boxes. Adjacent different pairs remain separate. The server cuts one independent private image per wardrobe unit, asks Bedrock to isolate its foreground into a transparent PNG, and trims excess transparent space. If that task is unavailable, a tested conservative edge pass supplies a transparent plain-background cutout or an honest tight-crop fallback.
- **Nothing is saved until the person confirms it.** Every candidate is selectable and editable, and detection alone never writes to the wardrobe. Overlapping or hidden pieces may need a second photo.

**Link a brand product** keeps the front/back/label evidence flow for exact registry-backed tracking. AI-read or typed brand text alone never verifies identity.

Signed-in navigation behaves like a mobile app: persistent bottom tabs are the single primary menu, the header control is a session-only account menu, and desktop keeps top navigation. Visiting `/` or `/login` with a valid session returns to the right workspace, and only a *successful* sign-out ends a session — a failed request leaves it active rather than pretending it worked.

> **Verified in production (2026-08-15):** an authenticated scan of the repository-owned synthetic fixture reached Bedrock and returned one editable candidate at 90% confidence, which was not saved. That confirms the deployed selection → preparation → upload → detection → review path end to end. A physical-iPhone HEIC capture remains the one device-specific test still outstanding.

The full enrollment-to-discovery path:

1. Create a Consumer account with explicit image-processing consent.
2. Photograph the front of the piece. An optional AI photo plan proposes a controlled broad category and specific subtype, shows uncertainty alternatives, and requests only the shots that category needs.
3. Bedrock receives that hypothesis with the back and label views, then confirms or revises it from the combined evidence. The consumer can correct the name, category, subtype, brand, and SKU. Only enrolled SKU/GTIN registry matches are verified — AI text and manual corrections never are.
4. The server rotates the front photo, preserves it unmodified as private evidence, and produces a separate auto-cropped display version showing just the garment — falling back to the original framing whenever the crop is not confident.
5. The consumer confirms or edits the garment name, category, subtype, brand label, and optional SKU before saving. Unverified garments remain usable.
6. The Looks view builds outfits from saved garment photos in a category-arranged flat-lay preview, saves them, and records wear.
7. The Outfits tab lists every saved outfit with its pieces and wear total, records a repeat wear in one tap, and offers separate two-step controls to remove one piece or delete the entire outfit. Piece removal regenerates the private flat-lay but leaves the garment in the wardrobe; whole-outfit deletion removes the saved look and board while retaining historical wear events.
8. Hanger opens from the bottom of the dashboard as a multi-turn stylist. Every message reloads the account's current wardrobe, wear history, and saved outfits; grounded recommendations can be saved or recorded as worn, and a successful Hanger save appears in the Outfits tab immediately without a reload. Natural follow-ups including “adjust,” “redo,” “try again,” and “use my other pieces” use owner-validated prior recommendation IDs plus the latest saved outfit to maximize new pieces. Repeating the same outfit-creation prompt also rotates through unseen pieces, while non-outfit advice remains deterministic. Conversation memory is bounded at 100 owned IDs; repeats occur only after a category runs out of unseen options or that bound is reached. Hanger shows the actual private garment images attached to the Save action. The written list, visual cards, action IDs, saved title, and generated board all come from the same ordered selection, and the client blocks persistence if those IDs ever diverge.
9. In Community, **Recreate with my wardrobe** compares a public outfit only against the signed-in consumer's wardrobe. The result leads with how much of the look they can already build, splits pieces into *use yours* and *you're missing* in plain language, and lets them open any matched piece to see which owned garment was chosen and why. **Shop the Look** then opens an in-app inspection sheet where only an exact registry-verified product with an authorized destination is openable — similar, AI-estimated, unverified, and unavailable pieces are labeled as such rather than sold, with affiliate disclosure where relevant. The rate-limited Similar Products API separately ranks only enrolled, available, same-category registry products with inspectable reasons; a suggestion never becomes an exact-match claim or exposes a consumer wardrobe.
10. The consumer may separately opt in to anonymous brand aggregates and may publish one explicitly selected saved outfit to Community. Every public garment gets a new public ID; private wardrobe IDs and S3 keys never enter the feed.

Saved Looks also generate a private, static flat-lay board from the existing transparent garment cutouts on a clean white canvas. Category-aware placement keeps layers toward the top, bottoms lower, footwear at the base, and accessories toward the corners. Original evidence photos remain unchanged and private.

### Brand

1. Create a Brand account bound to the represented brand name.
2. Enroll authorized front, back, and label images with SKU/MPN, optional GTIN, aliases, and approved label text.
3. Consumer label evidence can connect a wardrobe item to the brand-authorized registry record.
4. The Brand dashboard reports actual wears, active owners, and repeat-wear rate only when at least 25 opted-in owners qualify.
5. Hanger on the Brand dashboard supports follow-up strategy conversations but is restricted to the brand's own products and the same consent-filtered, `k ≥ 25` aggregates.
6. A Consumer can save a public Look as **Hanger inspiration**. Racked privately retains only bounded garment/style signals under that Consumer account, counts one public inspiration, and never gives the creator or a Brand the liker identity. Hanger uses those signals only when the current request does not specify a conflicting style.
7. A brand can create a clearly labeled Brand Look using only its enrolled products. Optional product/affiliate destinations are validated public HTTPS links; Racked records aggregate outbound interest and redirects to external checkout.

### Account access

Signed-in Consumer and Brand accounts have a Settings screen for their own display name, email, and password. Every update requires the current password; changing it re-hashes with a new salt, invalidates other sessions through a session version, and renews only the current session. Forgot-password links are random, stored only as hashes, expire after 30 minutes, work once, and return the same request response for known and unknown emails.

Reset delivery uses Amazon SES. **Code completion does not guarantee public email delivery:** `RACKED_PASSWORD_RESET_FROM` must be a verified SES identity, and an account still in the SES sandbox can send only to verified recipients. That supports pre-verified judge accounts but is not a general public reset service until AWS grants production sending access.

---

## Routes

| Route | Access | What it does |
| --- | --- | --- |
| `/` · `/community` · `/brands/[slug]` · `/pricing` · `/privacy` | Public | Landing, outfit discovery feed, public brand pages, planned pricing |
| `/demo-store/[brandSlug]/[sku]` | Public | Fictional demo storefront — `DEMO` products only, never a real brand |
| `/login` · `/forgot-password` · `/reset-password` | Public | Authentication and single-use recovery |
| `/consumer` · `/settings` | Consumer | Today / Looks / Closet / Outfits workspace, own-account settings |
| `/brand` | Brand | Aggregate dashboard, product enrollment, Brand Looks, Brand Hanger |
| `POST /api/garments/detect` · `/classify` · `/analyze` | Consumer | Multi-piece detection, photo-plan hypothesis, full multi-view analysis |
| `GET/POST /api/consumer/wardrobe` · `GET/POST/PATCH/DELETE /api/consumer/outfits` · `GET/PATCH /api/consumer/consent` | Consumer | Always scoped to the signed-in account; outfit PATCH removes pieces and regenerates the private board |
| `POST /api/wears` | Consumer | Confirmed wear events plus saved-outfit wear totals |
| `POST /api/agents/consumer` · `/agents/brand` | Role-bound | Hanger conversations; fresh authoritative context per message |
| `POST /api/brand/metrics` · `/community-metrics` | Brand | Consent-filtered `k ≥ 25` aggregates and public-activity metrics |
| `GET/POST /api/brand/products` · `/brand/looks` | Brand | Own registry products and brand-authored Looks |
| `POST /api/products/[productId]/demo-purchase` | Public | Records a $0.00 demo checkout simulation — DEMO products only, never a sale |
| `GET/POST/PATCH /api/community` | Public / Consumer | Read the feed; publish one selected saved outfit; record inspiration |
| `POST /api/community/[postId]/recreate` | Consumer | Recreate This Look against only the signed-in wardrobe |
| `GET /api/community/images/[postId]/[garmentId]` | Public | Post-scoped image proxy; never exposes a private S3 key |
| `GET /api/products/similar` · `/[productId]/outbound` | Public | Registry-only suggestions; server-validated outbound redirect |
| `POST /api/account` · `/auth/password-reset/*` | Signed in / Public | Own-account updates requiring the current password; enumeration-safe recovery |

Full access levels and abuse controls: [docs/backend-api.md](docs/backend-api.md).

---

## Key Files

```text
app/api/auth/…                 Register/login/logout: scrypt hashes, signed sessions, rate limits
app/api/account/               Own-account settings + current-password authorization
app/api/auth/password-reset/   Enumeration-safe request + single-use reset confirmation
app/api/garments/classify/     Adaptive first-photo category + subtype hypothesis (photo plan)
app/api/garments/analyze/      Bedrock vision + registry identity + evidence/display image storage
app/api/garments/detect/       One-photo multi-piece detection + private per-garment cutouts
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
lib/outfit-ranking.ts          Deterministic, conversation-aware outfit scoring with evidence
lib/evaluation-dataset.ts      External-dataset normalization, deterministic sampling, scoring
lib/outfit-contracts.ts        Exact/estimated/similar/generic/unavailable product states
lib/look-discovery.ts          Inferred look styles, category filters, public-field search
lib/recreate-look.ts           Deterministic owned/substitute/missing scoring with evidence
lib/similar-products.ts        Same-category suggestions using the same scoring weights
lib/commerce.ts                Public-HTTPS validation and controlled destination states
lib/brand-looks.ts             Brand-owned authorization for Brand Looks
lib/garment-crop.ts            Evidence-preserving auto-crop with tested fallbacks
lib/ai-background-removal.ts   Bedrock foreground segmentation + transparent-output validation
lib/garment-cutout.ts          Conservative edge-connected transparency for detected pieces
lib/outfit-board.ts            Deterministic category-aware flat-lay placement
lib/account-security.ts        Password policy and reset-token lifetime/hash rules
lib/photo-plan.ts              Category → photo-plan agent logic (identity-free by construction)
lib/hanger-conversation.ts     Hanger prompts, history bounds, brand output privacy review
lib/privacy.ts                 k ≥ 25 gate + product-enumeration budget
lib/rate-limit.ts              Sliding-window abuse limits for auth/AI/community endpoints
components/consumer-dashboard.tsx  Today / Looks / Closet / Outfits views
components/look-scan-uploader.tsx  Select/edit/save UI for one-photo multi-piece intake
components/demo-purchase-panel.tsx $0 fictional bag and checkout simulation
components/brand-dashboard.tsx     Aggregate metrics, charts, CSV export, Hanger dock
tests/                         Privacy, recognition, evaluation, commerce, Brand Looks, Recreate suites
infra/template.yaml            DynamoDB, S3, least-privilege Amplify compute role
```

---

## Security and Privacy Boundaries

- Passwords are salted with a random value and hashed with scrypt.
- Sessions are signed, expiring, secure, HTTP-only cookies.
- Account updates are scoped only to the signed-in subject and require the current password. Password changes increment a server-side session version; reset tokens are hashed, single-use, and valid for 30 minutes.
- Garment saves require a server-signed confirmation token tied to the account and both private image keys.
- S3 public access is blocked; URLs expire after one hour.
- Consumer photos and raw wardrobe records are never returned to brands. Community publishes only a selected saved outfit, replaces wardrobe IDs with public garment IDs, and serves its presentation through a post-scoped image proxy. The public allowlist cannot serialize owner IDs, saved-outfit IDs, private S3 keys, or database keys.
- Brand metrics count only opted-in owners and fail closed below `k ≥ 25`. A DynamoDB-backed enumeration budget additionally caps how many distinct products one brand account can pull aggregates for in a rolling window, defeating differencing attacks across SKUs.
- **Brand identity is never AI-granted.** A brand name read from a photo, typed by a consumer, or matched against the major-brand allowlist only prefills an editable, clearly unverified label — even when a brand account already exists under that name. Verified identity requires registry GTIN or brand-plus-SKU evidence, and that rule is locked by regression tests.
- Sliding-window rate limits protect registration, sign-in (per client and per email), garment classification and analysis, both Hanger agents, brand metrics, and Community writes. Counters are per compute instance — a documented first layer, not a WAF replacement.
- If image analysis fails, Racked keeps the submitted front photo as private evidence and opens an explicitly unverified manual-review form; it never invents fallback attributes. Back and label photos are processed in request memory and are not persisted for consumers.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

---

## Independent Evaluation Dataset

Racked has selected the corrected CC BY 4.0 [Clothing Dataset for Second-Hand Fashion, version 3](https://zenodo.org/records/13788681) as its external recognition benchmark. It contains **31,638 real garments** plus a separately identified 100-garment annotator-agreement set, with human annotations and front, back, and brand-label photographs where available — the closest public match to Racked's three-view intake. Dataset photographs stay outside GitHub and the production application; only attribution, evaluation code, and aggregate results belong in this repository.

**Accuracy is not claimed yet, and this is not training data.** Racked currently uses Amazon Nova Lite through Bedrock and has not fine-tuned that model on these garments. The benchmark will measure category, subtype, label-text, provider-failure, and AI-only-verification violations without allowing dataset brand text to create verified identity. The exact protocol and honest reporting rules are in [docs/evaluation.md](docs/evaluation.md).

The first reproducible label-coverage audit sampled 1,000 evenly spaced records: **93.9%** map to Racked's broad categories, **62.6%** have source labels specific enough for exact-subtype scoring, and **94.0%** contain usable brand annotations. These percentages measure benchmark compatibility — not model accuracy. The aggregate, image-free report is committed at [`data/evaluation-label-coverage.json`](data/evaluation-label-coverage.json).

---

## CI — GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Production dependency audit** — `pnpm audit --prod --audit-level high`
2. **Lint** — `eslint`
3. **Type check** — `tsc --noEmit`
4. **Tests** — `node --test` across `tests/`
5. **Production build** — `next build`

`.github/workflows/codeql.yml` runs CodeQL security analysis on pushes, pull requests, and a weekly schedule. Merges happen only after both are green.

The suite currently has **259 passing tests** (verified 2026-08-29), covering transparent-output validation and safe segmentation fallback, browser-specific Home Screen installation guidance, private inspiration signals and request-overrides, footwear-pair grouping and full-image scan instructions, privacy suppression and the enumeration budget, the registry-only verification boundary, deterministic Recreate and outfit-ranking scoring, explicit Hanger piece constraints, four-turn conversation memory, canonical name/image/save alignment, owner-scoped saved-outfit and piece management, commerce URL validation, demo purchase simulation boundaries, Community style discovery, Brand Look ownership, account recovery, and public-field sanitization.

---

## Rubric Alignment

| Category | Weight | How this repo addresses it |
| --- | ---: | --- |
| Problem & relevance | 20% | Purchase data shows what sold, not what is worn. Each hero SKU demonstrates **76 wears / 25 owners / 88% engagement / 76% repeat use** (synthetic, labeled) — the post-purchase signal brands lack |
| Functionality | 25% | Live AWS PWA, real registration/login/recovery, one-photo multi-piece intake, Saved Outfits with repeat wear, Community publishing, Recreate This Look, Brand Looks, controlled outbound destinations, and a `k ≥ 25` dashboard with charts and CSV export |
| **AI integration & innovation** | **20%** | **Bedrock multi-view garment vision · distinct context-grounded Consumer and Brand Hanger agents · server-side deterministic outfit ranking the model cannot override · explainable Recreate/Similar scoring that never turns similarity into exact ownership** |
| Code, docs & GitHub | 15% | Typed modules, **259 passing tests**, CI running audit + lint + typecheck + tests + build, CodeQL, and incremental reviewed PRs ([PROGRESS.md](PROGRESS.md)) |
| UX & polish | 10% | Mobile-first bottom tabs, account settings/recovery, explicit camera/library choice, individually isolated garment cutouts on clean white outfit boards, fictional catalog assets, $0 purchase simulation, honest first-time and suppressed states, installable PWA |
| Business impact | 10% | Per hero SKU: **76 wears, 22 active owners, 19 repeat wearers**; for the apparel hero: **11 public outfit appearances, 37 inspirations, 15 Recreate requests** (all synthetic demonstration data), plus a proposed [pricing model](#business-model--pricing-proposed--not-currently-billed) |
| Bonus | — | Explicit consent, private encrypted object storage, k-anonymity plus enumeration budget, rate limiting, accessibility-minded semantics, cross-disciplinary analytics |

---

## Business Model & Pricing (proposed — not currently billed)

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

---

## Local Development

Requirements: Node.js 22+ and pnpm.

```bash
# Clone and install
pnpm install --frozen-lockfile

# Configure environment
copy .env.example .env.local

# Run the full verification gate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:prod

# Start the dev server
pnpm dev
```

Local account and upload mutations require a DynamoDB table, private S3 bucket, and AWS credentials with the same narrow permissions as `infra/template.yaml`. Never commit `.env.local`.

**Install on a phone:** open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com) and tap **Add Racked**. Android and other compatible browsers open their native install prompt directly. Because iPhone browsers do not expose that prompt to websites, the same button opens a focused guide for **Safari → Share → Add to Home Screen → Add** instead of becoming a dead button.

---

## Demo Access

| Account | Address | What it shows |
| --- | --- | --- |
| Judge Consumer | `judge.consumer@racked.local` | Ten varied wardrobe pieces, a realistic wear spread, two saved outfits, consent already on |
| Judge Brand | `judge.brand@racked.local` | One product above the 25-owner threshold showing released metrics, one deliberately below it showing suppression |
| Synthetic cohort | 25 `DEMO` consumers, 3 fictional brands | Community feed, Recreate This Look, public-activity metrics |

**Passwords are deliberately not in this repository.** All demonstration accounts authenticate against a runtime-only secret supplied when the seed is run, and credentials are handed to judges in the competition submission packet. This repository is public: a committed password would let anyone alter the demonstration data before it is reviewed. See [docs/test-cohort.md](docs/test-cohort.md).

The public pages — landing, Community, brand profiles, fictional storefronts, and pricing — need no sign-in at all, so most of the judge path is reachable immediately.

---

## Ethical Stance and Claims

Racked augments a person's judgment about their own wardrobe and never replaces their consent.

- Every AI attribute is a proposal a person confirms, corrects, or rejects. Detection alone never writes a wardrobe record.
- Brand identity comes only from authorized registry evidence. No amount of AI confidence can create it.
- Brands receive aggregates, never people. Consent is per-account and revocable, `k ≥ 25` fails closed, and an enumeration budget prevents reconstructing small cohorts across SKUs.
- Nothing is published without an explicit action by its owner.

Racked does **not** claim garment recognition accuracy, sales lift, purchase intent, demographic inference, photorealistic virtual try-on, body-fit prediction, or production-scale validation. Multi-piece detection is functional but visibility-dependent: overlapping, occluded, tiny, or blurred items may require a second photo. The Looks flat-lay is a visual outfit composition tool, not virtual try-on. Private wear metrics are server-computed aggregates over opted-in owners above `k ≥ 25`; separately labeled Community metrics use only intentionally public posts and identity-free interaction events. The three-brand, 25-account cohort is synthetic and classified `DEMO` throughout. Pricing is a proposal; nothing is billed and no payment method is ever collected.

---

## Documentation Index

Everything above is self-contained; these go deeper.

- [PROGRESS.md](PROGRESS.md) — real merged-PR history of how this was built
- [Competition checklist](docs/competition-checklist.md) — per-criterion evidence checklist
- [Demo checklist and fallbacks](docs/demo-checklist.md) — pre-flight, accounts, and what to do when something fails live
- [Presentation script](docs/demo-script.md) — the eight-minute run
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md) — every route, access level, and abuse control
- [AI use and limitations](docs/ai-use-log.md) — models, prompts, boundaries, failure policy
- [Independent recognition evaluation](docs/evaluation.md) — 31,638-item source, license, protocol, claim rules
- [Dataset provenance](docs/dataset-provenance.md) — production, synthetic, and external-data boundaries
- [Clearly labeled test cohort](docs/test-cohort.md) — including judge accounts
- [Fictional demo storefronts](docs/demo-storefronts.md) — safety rules and URL contract
- [Small/medium Brand UX review](docs/brand-ux-review.md)
- [Privacy and ethics](docs/privacy-and-ethics.md) — consent, `k ≥ 25`, brand identity boundary
- [AWS deployment](docs/aws-deployment.md)
- [One-page summary](docs/one-page-summary.md) — includes the proposed business model

---

**Last updated:** August 2026 — active competition build
**Repository:** https://github.com/manof1color/racked-wardrobe-intelligence
**Competition:** CUA AI Vibe Coding Competition
