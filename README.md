# Racked

**What if a clothing brand could learn whether a product becomes part of real life—without seeing who owns it or what else is in that person’s closet?**

## What This Is

Racked is a privacy-first wardrobe-intelligence application for Consumers and Brands. Consumers photograph real garments, confirm AI-visible attributes, build outfits, and record wears; Brands enroll authorized products and receive only consent-filtered aggregate usage for their own matched SKUs. The application is live on AWS and is designed to be useful to a Consumer before any Brand participates.

> **Headline business signal: 8 weeks of confirmed wear activity per eligible SKU**, showing whether repeat use is gaining, holding, or declining. This is a working measurement capability—not a claim of validated sales lift—and it is released only after consent filtering and the `k ≥ 25` privacy gate.

**Live production:** [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

## Architecture

```text
[Browser / installed PWA]
          |
          | HTTPS
          v
[AWS Amplify Hosting]
          |
          v
[Next.js SSR pages + API routes]
          |
          +--> [Signed HTTP-only role session] ---- current Consumer/Brand identity
          |          |
          |          +--> [Amazon Cognito] -------- provisioned; reserved for future OIDC migration
          |
          +--> [Amazon DynamoDB] ------------------ accounts, consent, catalog, wardrobe,
          |                                         outfits, wear events, community posts
          |
          +--> [Private Amazon S3] ---------------- encrypted garment/product images;
          |                                         one-hour signed links
          |
          +--> [Amazon Bedrock / Nova Lite] ------- three-view garment analysis and
                                                    contextual Hanger conversations
```

The Next.js server is the trust boundary: it checks the signed-in role and record ownership before reaching DynamoDB, S3, or Bedrock. Consumer and Brand photos remain private. Brand metrics are computed only from verified product links, opted-in owners, and cohorts of at least 25.

### AI approach

- **Garment vision:** Amazon Nova Lite examines only the submitted front, back, and label views. It returns visible garment attributes and label text, never body, demographic, income, or identity inferences.
- **Evidence before identity:** a familiar brand name may be suggested for human confirmation, but only a Brand-enrolled GTIN or brand-plus-SKU match creates a verified product link.
- **Two contextual agents:** Consumer Hanger reloads that account’s wardrobe, wears, and outfits for each message. Brand Hanger reloads only Brand-owned products and released aggregate metrics; suppressed cohort values never enter its model context.
- **Fail closed:** incomplete provider output opens an explicitly unverified manual-review path rather than inventing attributes. Deterministic image preparation rotates, trims, and resizes the Consumer’s front image for the avatar.

## Key Files

```text
racked-wardrobe-intelligence/
├── app/
│   ├── page.tsx                              # Public problem/solution landing page
│   ├── login/page.tsx                        # Sign-in and Consumer/Brand account entry
│   ├── consumer/page.tsx                     # Server-protected Consumer workspace
│   ├── brand/page.tsx                        # Server-protected Brand workspace
│   ├── community/page.tsx                    # Public, privacy-sanitized outfit feed
│   ├── partners/[vertical]/page.tsx          # Vintage, clothing, shoe, and jewelry entry pages
│   └── api/
│       ├── auth/register/route.ts              # Consumer/Brand account creation
│       ├── auth/login/route.ts                 # Password verification and signed session start
│       ├── auth/logout/route.ts                # Session-cookie expiration
│       ├── garments/analyze/route.ts         # Three-view validation, Bedrock, image preparation
│       ├── consumer/wardrobe/route.ts          # Account-owned garment storage and retrieval
│       ├── consumer/outfits/route.ts           # Outfit ownership validation and persistence
│       ├── consumer/consent/route.ts           # Brand-aggregate sharing preference
│       ├── brand/products/route.ts             # Brand-owned product registry
│       ├── brand/metrics/route.ts              # Privacy-gated wear analytics
│       ├── agents/consumer/route.ts            # Wardrobe-grounded Hanger endpoint
│       ├── agents/brand/route.ts               # Aggregate-only Brand Hanger endpoint
│       ├── wears/route.ts                    # Confirmed wear-event recording
│       └── community/route.ts                # Sanitized publishing, listing, and likes
├── components/
│   ├── consumer-dashboard.tsx                # Wardrobe, consent, closet, avatar, and wear UI
│   ├── brand-dashboard.tsx                   # SKU metrics, charts, CSV, and suppression UI
│   ├── three-view-uploader.tsx               # Mobile front/back/label capture and confirmation
│   ├── brand-product-enrollment.tsx          # Authorized Brand catalog enrollment
│   ├── wardrobe-avatar.tsx                   # Outfit layering, saving, and wear action
│   ├── hanger-dock.tsx                       # Shared Consumer/Brand Hanger launcher
│   ├── agent-panels.tsx                      # Multi-turn chat, evidence, and grounded actions
│   └── community-feed.tsx                    # Public outfit cards and verified Brand links
├── lib/
│   ├── matching.ts                           # Seven inspectable wardrobe-match signals
│   ├── agents.ts                             # Deterministic agent fixtures retained for tests
│   ├── hanger-conversation.ts                # Production prompts, context bounds, safety review
│   ├── garment-analysis.ts                   # Bedrock vision schema, parsing, and fallback policy
│   ├── privacy.ts                            # k-anonymity and enumeration-budget rules
│   ├── product-registry.ts                   # Brand suggestion and verified SKU/GTIN matching
│   ├── metrics.ts                            # Aggregate frequency, distribution, and 8-week trend
│   ├── session.ts                            # Signed, expiring role-session tokens
│   └── server/
│       └── production-store.ts               # DynamoDB/S3 ownership and persistence boundary
├── infra/template.yaml                       # DynamoDB, S3, Cognito, and least-privilege AWS role
├── amplify.yml                               # Reproducible Amplify build definition
├── tests/                                    # 63 automated privacy, AI, auth, upload, and PWA tests
└── PROGRESS.md                               # Dated milestones from merged repository history
```

## Judging Rubric Evidence

| Rubric criterion | Weight | Concrete evidence in this repository and live app |
| --- | ---: | --- |
| Problem / opportunity | 20% | • Defines the purchase-versus-actual-wear information gap.<br>• Gives Consumers private wardrobe, outfit, and wear utility.<br>• Gives Brands product-level usage without claiming recognition accuracy or sales lift. |
| Functionality / technical execution | 25% | • Live HTTPS Next.js application on AWS Amplify with real Consumer and Brand accounts.<br>• DynamoDB persistence plus private encrypted S3 images and expiring links.<br>• Three-view mobile intake, avatar preparation, saved outfits, wear events, registry matching, charts, CSV export, Community, and installable PWA. |
| AI integration / innovation | 20% | • Nova Lite analyzes real front/back/label bytes under a visible-evidence prompt.<br>• Consumer and Brand Hanger support follow-up conversation while refreshing authoritative context every turn.<br>• Human confirmation, registry-based identity, defensive parsing, and fail-closed manual review prevent invented verification. |
| Code quality / documentation / GitHub | 15% | • Typed modules isolate matching, AI, privacy, sessions, metrics, and production storage.<br>• Least-privilege infrastructure, secret allowlisting, rate limits, ownership checks, and CodeQL are documented.<br>• **63 automated tests** pass, supported by focused commits and merged pull requests. |
| User experience / design / polish | 10% | • Responsive Consumer and Brand workspaces with phone camera/library upload.<br>• Empty, loading, validation, success, suppression, and provider-error states are explicit.<br>• Semantic controls, focus styles, reduced-motion support, mobile navigation, and home-screen installation are included. |
| Business impact / presentation | 10% | • **8 weeks of confirmed wear activity per eligible SKU** is the headline decision signal.<br>• Brand dashboards also measure active owners, engagement, repeat wear, average/median frequency, zero-wear opportunity, and high-frequency use.<br>• The proposed Brand-paid model and first-100-Consumer bootstrapping plan are stated below without presenting hypotheses as revenue. |
| Bonus considerations | Up to 5 | • Ethical AI: consent, human confirmation, non-claims, and aggregate-only Brand context.<br>• Accessibility: semantic UI, focus visibility, responsive layouts, and reduced motion.<br>• Cross-disciplinary value: consumer behavior, merchandising, privacy, marketing analytics, and cloud operations. |

## Business Model and Go-to-Market

This is a **proposed model, not validated revenue**. Consumers would receive the core wardrobe, outfit, and wear-tracking product free. At MVP stage, Brands could test a **$99/month Starter** tier for enrollment and pre-threshold catalog tools, a **$249/month Insights** tier for a limited number of qualifying SKUs, and a **$49 per exported aggregate report** option. Later data licensing would be limited to independently consented and thresholded category benchmarks—never identities, photos, individual wardrobes, row-level wear histories, or suppressed cohorts.

The first approximately 100 Consumers do not depend on Brand participation: a campus beta can recruit through student organizations, clothing swaps, vintage resellers, fashion creators, referrals, and a “photograph ten pieces” challenge. For an emerging Brand that has not reached `k ≥ 25` on a SKU, Racked keeps the threshold intact while offering enrollment, label/catalog readiness, non-numeric eligibility status, and general planning tools that make no wearer claims.

## Security, Privacy, and Honest Limits

- Passwords are randomly salted and scrypt-hashed; sessions are signed, expiring, secure, and HTTP-only.
- Consumer photos, names, emails, raw wardrobes, and individual wear rows are unavailable to Brands.
- S3 public access is blocked; garment saves require a server confirmation HMAC tied to the account and private image key.
- Brand metrics require product ownership, Consumer opt-in, and `k ≥ 25`; a persistent enumeration budget reduces differencing attacks.
- Racked does **not** claim photorealistic virtual try-on, body-fit prediction, garment-recognition accuracy, purchase probability, sales lift, demographic classification, validated pricing, or production-scale validation.
- The optional 25-account cohort is [clearly labeled synthetic](docs/test-cohort.md) and demonstrates privacy behavior, not commercial traction.

## Local Development

Requirements are taken from `package.json`: **Node.js 22.13+** and **pnpm 11.9.0**.

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

On macOS or Linux, replace the copy command with `cp .env.example .env.local`. The development server uses the package script `next dev` and opens at [http://localhost:3000](http://localhost:3000).

Real account, upload, and persistence flows also require the DynamoDB table, private S3 bucket, and narrow AWS permissions described in `infra/template.yaml`. Put runtime values in the ignored `.env.local`; never commit credentials or secrets.

Run the same verification used for this repository:

```powershell
pnpm lint
pnpm test
pnpm build
```

Current verified result: **63/63 tests pass**, lint passes, and the production build passes.

## Live Demo

Open [Racked production on AWS Amplify](https://main.d2iv0khybuuaeh.amplifyapp.com). The following pages and flow were verified against the deployed application:

1. Use the public landing page, [Community](https://main.d2iv0khybuuaeh.amplifyapp.com/community), [Privacy](https://main.d2iv0khybuuaeh.amplifyapp.com/privacy), or the [apparel partner page](https://main.d2iv0khybuuaeh.amplifyapp.com/partners/clothing) without signing in.
2. Open [Sign in / Create account](https://main.d2iv0khybuuaeh.amplifyapp.com/login).
3. To try the Consumer flow, choose **Create account → Consumer**, provide the required name/email/password and image-processing consent, then enter `/consumer`. Add front, back, and label photos; confirm the result; save it; build an Avatar outfit; record a wear; and talk with Hanger.
4. To try the Brand flow, sign out, choose **Create account → Brand**, provide the represented Brand name, then enter `/brand`. Enroll an authorized three-view product and inspect the correct privacy result: suppression below 25 eligible owners, or aggregate charts above it.
5. Install the Consumer experience from the HTTPS site: **Safari → Share → Add to Home Screen** on iPhone, or **Chrome → Install app / Add to Home screen** on Android.

Protected routes enforce the account role on the server. No passwords are published in this README; any synthetic judge cohort credentials must be supplied separately and remain clearly labeled synthetic.

## Documentation Index

- [One-page business and product summary](docs/one-page-summary.md)
- [Competition checklist](docs/competition-checklist.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md)
- [AI use and model limitations](docs/ai-use-log.md)
- [Privacy and ethics](docs/privacy-and-ethics.md)
- [AWS production deployment](docs/aws-deployment.md)
- [Dataset provenance](docs/dataset-provenance.md)
- [Clearly labeled synthetic test cohort](docs/test-cohort.md)
- [Seven-minute presentation script](docs/demo-script.md)
- [Security policy](SECURITY.md)
- [Major repository milestones](PROGRESS.md)
