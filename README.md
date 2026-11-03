# Racked — Privacy-First Wardrobe Intelligence for Consumers and Brands

[![Validate Racked](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml)

**Brands know what consumers buy. Racked shows them what consumers actually wear — without ever seeing anyone's closet.**

People get a private wardrobe and an AI stylist that are useful on their own. Brands get consented intelligence about how their products are really worn, released only for groups of at least 25 people — never names, photos, or wardrobes.

| | |
| --- | --- |
| **Judges, start here** | [JUDGES.md](JUDGES.md) — one screen: the two demo flows, how to sign in, and where every piece of evidence is |
| **Live application** | https://main.d2iv0khybuuaeh.amplifyapp.com — installable on a phone |
| **What is deployed right now** | [`/api/version`](https://main.d2iv0khybuuaeh.amplifyapp.com/api/version) returns the exact commit Amplify built |
| **Measured AI recognition** | **92.8% of garments placed in the right category** (272 of 293; 95% CI 89.3%–95.3%) by the live scan, on 300 independent, publicly licensed photos with answers locked before the first model call — up from 89.7% after one measured fix — [results](docs/evaluation-results-r2.md) |
| **Stack** | Next.js 15 · React 19 · TypeScript · AWS Amplify (SSR) · DynamoDB · private S3 · Amazon Bedrock (Nova Pro, Nova Lite) · GitHub Actions · CodeQL |
| **Built for** | CUA Busch School AI Vibe Coding Contest, Fall 2026 |

<!-- pilot:start (generated from data/pilot-status.json; tests/pilot-claims.test.ts) -->
**Pilot status (2026-10-29):** Two apparel brands, **_victimdesigns** and **vversatile.usa**, have agreed to join the Racked pilot, created brand accounts and uploaded their products.

| Brand | What it has done | Evidence |
| --- | --- | --- |
| _victimdesigns | agreed to join the pilot by phone; created a brand account; uploaded products | Agreed by phone; its brand account and uploaded products are live on Racked |
| vversatile.usa | agreed to join the pilot by phone; created a brand account; uploaded products | Agreed by phone; its brand account and uploaded products are live on Racked |

Not claimed: pricing acceptance and payment. Nothing is billed.
<!-- pilot:end -->

---

## Judge Scorecard

Each scoring category, what to look for, and where to check it.

| Category | Weight | What to look for | Verify it |
| --- | ---: | --- | --- |
| **Problem & relevance** | 20% | Purchase data stops at checkout. Racked measures confirmed wear, consented and released only at 25 or more owners | [What this is](#what-this-is) · [Evidence](#evidence-and-what-is-not-claimed) · [One-page summary](docs/one-page-summary.md) |
| **Functionality** | 25% | Two flows, end to end on the live AWS app. **A person:** photograph clothes → confirm the pieces → get an outfit. **A brand:** an anonymous cohort → wear evidence → a campaign brief | [Live app](https://main.d2iv0khybuuaeh.amplifyapp.com) · [Demo path](#five-minute-judge-path) · [Judge accounts](docs/judge-accounts.md) |
| **AI integration & innovation** | 20% | Nova Pro proposes garments for a person to confirm — **measured at 92.8% category accuracy on 300 locked, independent photos**; Hanger is a **tool-using agent**; a written, tested stylist knowledge base; Brand Hanger sees only privacy-released totals | [How AI is used](#how-ai-is-used) · [Recognition results](docs/evaluation-results-r2.md) · [`hanger-agent.ts`](lib/hanger-agent.ts) · [AI use log](docs/ai-use-log.md) |
| **Code, docs & GitHub** | 15% | **948 tests** in 120 files; CI runs audit, lint, type check, tests, build, [accessibility checks](docs/accessibility.md) and CodeQL on every change; **181 merged PRs** counted on 2026-10-30 before this documentation merge; build log through Phase 99 | [Testing](#testing-and-ci) · [Architecture](#architecture-overview) · [PROGRESS.md](PROGRESS.md) |
| **UX & polish** | 10% | Mobile-first installable app, bottom tabs, a swipe-through Looks builder, whole-piece previews, honest empty and suppressed states | [Open it on a phone](https://main.d2iv0khybuuaeh.amplifyapp.com) · [Brand UX review](docs/brand-ux-review.md) |
| **Business impact** | 10% | Consumers free; brands pay for post-purchase intelligence they cannot get elsewhere; a Starter tier for brands still below the threshold | [Pricing](#business-model--pricing-proposed--not-currently-billed) · [Pricing page](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing) |
| **Bonus** | — | Explicit consent, `k ≥ 25`, a daily enumeration budget, private encrypted storage, an AI with no write tools, an enforced Content Security Policy, two-step sign-in for brands, owner-scoped deletion — tested by a local attack harness (63 of 63 checks) and an independent audit | [Privacy and security](#privacy-and-security) · [SECURITY.md](SECURITY.md) |

Per-criterion evidence: [docs/competition-checklist.md](docs/competition-checklist.md).

---

## Five-Minute Judge Path

The demo is two flows and nothing else. Everything outside them is built and working, and listed on the [roadmap](#roadmap).

**A person: scan → confirm → recommendation** (2½ minutes) — **Try the demo** on the sign-in screen

1. **Scan.** Tap **+** and photograph a garment — the one you are wearing works. Amazon Bedrock (Nova Pro) looks for visible pieces in the photo and proposes their categories and types.
2. **Confirm.** Check each card and save. When the AI is unsure, the **Type** field asks instead of guessing; nothing reaches the wardrobe until the person confirms.
3. **Recommendation.** Open **Hanger** (the button at the bottom) and ask *"What should I wear with this today?"* Hanger builds the outfit from pieces this account owns — the new one included — as photo cards with Save and Record.

**A brand: anonymous cohort → wear evidence → campaign brief** (2½ minutes) — **try the demo brand** on the sign-in screen

4. **The privacy gate.** Open **Judge Limited Overshirt**: 4 opted-in owners, below `k ≥ 25`, so the brand sees nothing — not zeroes, not even the count — and the page says why.
5. **The anonymous cohort.** Open **Judge Signature Tee**: 50 consented owners, so the aggregate is released — an eight-week wear chart, repeat wear, and what it is worn with. No name, photo, wardrobe, or owner ID is ever shown.
6. **The campaign brief.** Ask **Brand Hanger** *"Write me a campaign brief for this product."* It works only from the released aggregate; on the suppressed product it declines and makes no model call.

---

## Demo Access

**One click, no password.** The sign-in screen's **Try the demo** gives each visitor a fresh private copy of the Judge Consumer wardrobe below, so every judge starts in the same place; it expires after a day. **Try the demo brand** opens Judge Brand read-only. Demo sessions cannot publish to Community, change sign-in settings, edit the brand, or reach any real brand's numbers, and have a smaller AI allowance (`lib/demo-session.ts`).

| Account | Address | What it shows |
| --- | --- | --- |
| Judge Consumer | `judge.consumer@racked.local` | A lived-in wardrobe: 12 pieces, saved outfits, a realistic wear spread, one **verified** brand piece |
| Judge Brand | `judge.brand@racked.local` | One product with **50 opted-in owners** (released) beside one with 4 (suppressed) |
| New Consumer | `judge.newconsumer@racked.local` | Empty on purpose: scan a real photo and see the first-run states |
| New Brand | `judge.newbrand@racked.local` | No products: enrol one from a single photo with **Fill in from photo** |

**Passwords are deliberately not in this repository.** It is public, and a committed password would let anyone alter the demo before it is reviewed; credentials reach judges privately. Every seeded record is classified `DEMO` and every seeded image is marked `SYNTHETIC DEMO`. The accounts describe repeatable seed expectations, not a live-table audit or real-user statistics. Tour, seeding and the read-only checker (`pnpm verify:judge`): [docs/judge-accounts.md](docs/judge-accounts.md).

---

## What This Is

Purchase history stops at the transaction. It cannot show whether a product was worn once, became a favourite, sat untouched, or anchors outfits with other pieces.

1. **A wardrobe and stylist for people** — photograph your clothes, build outfits, record what you wear (earning private [wear points](docs/brand-linking-incentives.md#wear-points-owner-decision-2026-10-29) for it), and talk to Hanger, an AI stylist that only ever dresses you from what you own.
2. **Actual-wear intelligence for brands** — confirmed wear, repeat use and pairings for a brand's own products, released only when at least 25 opted-in owners qualify.
3. **Optional public discovery** — an outfit someone deliberately publishes becomes a Community look others can recreate from their own closets.

**Who it is for.** People who own more clothes than they can keep track of and want a private place to sort them out and get outfits from what they already have. And apparel brands that want to know how their products are really worn after the sale, without asking anyone to hand over a closet.

---

## Architecture Overview

![Racked architecture: a phone or desktop browser connects over HTTPS to AWS Amplify Hosting, where a session and role check routes requests to photo intake, the Hanger agents, and the privacy gate; intake and Hanger call Amazon Bedrock, Hanger reads the Open-Meteo forecast, an owner-scoped store reads and writes DynamoDB and private S3, and only the privacy gate reaches the brand dashboard, with released aggregates only.](docs/architecture.svg)

<details>
<summary><strong>The same diagram as text — expand</strong></summary>

```mermaid
flowchart TB
  phone["Phone or desktop browser<br/>installable PWA"] -->|"HTTPS · signed HTTP-only session cookie"| auth
  subgraph app["AWS Amplify Hosting — Next.js 15 server rendering and API routes"]
    auth["Session and role check<br/>rate limits"]
    intake["Photo intake<br/>one bounded crop per piece"]
    hanger["Hanger agents<br/>tool use"]
    builder["Outfit builder<br/>+ stylist knowledge"]
    gate["Consent filter → k ≥ 25<br/>→ enumeration budget"]
    store["Owner-scoped store<br/>every read checks the account"]
    auth --> intake & hanger & gate
    hanger --> builder
    intake & hanger & gate --> store
  end
  intake & hanger --> bedrock["Amazon Bedrock<br/>Nova Pro, Nova Lite fallback"]
  hanger --> weather["Open-Meteo forecast<br/>rounded coordinates"]
  store --> dynamo["DynamoDB<br/>single table"]
  store --> s3["Private encrypted S3<br/>1-hour links"]
  gate --> brand["Brand dashboard<br/>released aggregates only"]
```

</details>

Amplify deploys `main` automatically; DynamoDB is one on-demand table; S3 is private and encrypted with public access blocked; Bedrock runs in `us-east-2` from the app's own AWS account, so no AI key reaches a browser. Details: [docs/architecture.md](docs/architecture.md), including a module map, and every route in [docs/backend-api.md](docs/backend-api.md).

---

## Roadmap

Built, live and tested, but outside the five-minute demo:

| Area | What it does | Where it lives |
| --- | --- | --- |
| **Community & Recreate** | **Private by default:** nothing is public until its owner picks one saved outfit and presses **Publish this outfit**, and only that outfit appears, under new public IDs. **Unpublish** takes it down again at any time (`DELETE /api/community/[postId]`). Anyone signed in can see how much of a public look their own closet makes | [`community-feed.tsx`](components/community-feed.tsx) · [`recreate-look.ts`](lib/recreate-look.ts) |
| **Shop the Look** | Only a registry-verified product with a validated destination is shoppable | [`commerce.ts`](lib/commerce.ts) |
| **Brand linking** | A barcode, or brand plus style code, verifies a piece against the brand registry; look-alikes and search link it as the owner's own pick. A brand name alone verifies nothing | [`product-registry.ts`](lib/product-registry.ts) · [`catalog-match.ts`](lib/catalog-match.ts) |
| **Brand enrollment** | Up to six products at once; **Fill in from photo** proposes the details and the brand supplies the style code. New brands are approved before they can enroll, up to 300 products each | [`brand-product-enrollment.tsx`](components/brand-product-enrollment.tsx) · [brand approval](docs/brand-approval.md) |
| **Batch scanning** | Up to **6 photos** in one pass, every piece in one review list, bounded at 24 pieces | [`garment-intake.tsx`](components/garment-intake.tsx) |
| **Wear points and daily streak** | Recording what you wear earns private points — 1 per piece a day, +3 for a piece back in rotation after 60 days, up to 15 a day — and a daily streak for every day with a recorded wear, with "Log today's outfit" on Home. Earned identically whether or not you share with brands, never seen by a brand, and each piece reaches brand data at most once a day | [`wear-points.ts`](lib/wear-points.ts) · [rules](docs/brand-linking-incentives.md#wear-points-owner-decision-2026-10-29) |
| **Outfits, wear and Looks** | Saved outfits with private flat-lay boards, one-tap repeat wear, and a swipe-through builder that uses the same ranker as Hanger with no AI call | [`looks-builder.tsx`](components/looks-builder.tsx) |

**Next:** raise exact-type recognition (74.6% today) and the dress/top boundary, now the most common miss in the [measured benchmark](docs/evaluation-results-r2.md); a learned segmenter that beats the [measured crop baseline](docs/segmentation-backends.md); Next.js 16 after judging; production password-reset email once Amazon SES grants it; [App Store and Google Play](docs/app-store-launch.md).

---

## How AI Is Used

| Task | Model | When it fails |
| --- | --- | --- |
| Finding the garments in a photo — a consumer scan, or a brand's **Fill in from photo** | Amazon Nova Pro (US profile) | An unreadable result becomes one editable "needs your label" card, never invented attributes |
| Hanger, for consumers and brands | Amazon Nova Pro, Nova Lite as fallback | A reply written without the model is built from the wardrobe and **says so on screen** |
| Weather for Hanger | Open-Meteo — not AI | Coordinates rounded to about 1 km; without a location Hanger never guesses |

**Hanger is an agent, not a script.** Nova Pro reads each message and calls the tools it needs through the Bedrock Converse tool-use API — up to five rounds inside a 22-second budget: `search_wardrobe` (only the signed-in wardrobe), `build_outfits` (the **only** way an outfit reaches the screen), `get_weather`, and `get_trends` (anonymous totals from public looks). A reply listing an outfit the builder never made is corrected once, then abandoned. The conversation and standing preferences live on the account, so "swap the shoes" refers to the right look after a reload.

**Stylist knowledge, written down and tested.** The outfit builder ranks with a curated dataset, not a black box: [`lib/garment-knowledge.ts`](lib/garment-knowledge.ts) puts every garment type on a five-step formality ladder, and a named occasion is a gate before rotation, so "a more formal outfit" reaches for the dressiest pieces owned. [`tests/stylist-regression.test.ts`](tests/stylist-regression.test.ts) holds the regression cases from a real reported closet.

**What the AI is never allowed to do:** put an outfit on screen the builder did not build from owned pieces; verify a brand (only a registry barcode, or brand plus style code, can); state the weather without a forecast; infer body shape, gender, age, ethnicity, income or health; see another account's wardrobe; or give a brand anything below `k ≥ 25`.

### What calls a model, and what does not

**Only the consumer Hanger is an agent** in the strict sense: a model that decides which tools to call. Brand Hanger is a single model call over released aggregates. Everything else is deterministic code that gives the same answer to the same input.

| Action | Calls a model? | What decides | Runs in |
| --- | --- | --- | --- |
| Finding the garments in a photo — a consumer scan, or a brand's **Fill in from photo** | **Yes** — Nova Pro, one call per photo | The model proposes pieces; code crops them, joins shoe pairs, maps them onto the taxonomy, and saves nothing until a person confirms | `lib/look-garment-detection.ts` · `POST /api/garments/detect` |
| A Hanger conversation | **Yes** — Nova Pro, one to five calls per message | The model chooses tools; the tools are code | `lib/hanger-agent.ts` · `POST /api/agents/consumer` |
| Hanger's tools: wardrobe search, outfit builder, Racked trends | No | Search over the account's own pieces; the outfit ranker with the stylist knowledge dataset | `lib/outfit-ranking.ts`, `lib/garment-knowledge.ts` |
| Hanger's weather tool | No — a forecast service, not AI | Open-Meteo, coordinates rounded to about 1 km | `lib/weather.ts` |
| Hanger when the agent cannot answer | Only after a fast failure: one plain reply, no tools | The turn planner and the outfit ranker; the reply says it was written without the stylist model | `lib/hanger-turn.ts` |
| Brand Hanger | **Yes, only when released** — one reply, no tools; **none** below `k ≥ 25` | The privacy gate decides first | `lib/hanger-conversation.ts` · `POST /api/agents/brand` |
| Looks: today's pick, Shuffle, Finish | No | The same outfit ranker, in the browser | `lib/looks-rows.ts` |
| Verifying a brand product from its label code | No | A whole-code GTIN, or brand plus style code, against the registry | `lib/product-registry.ts` |
| Look-alike products and catalog search | No | Weighted attribute match against enrolled products | `lib/catalog-match.ts` |
| "Recreate with my wardrobe" | No | Owned / substitute / missing scoring with per-piece evidence | `lib/recreate-look.ts` |
| Whether a brand may see an aggregate at all | No | Consent filter, `k ≥ 25`, enumeration budget | `lib/privacy.ts`, `lib/metrics.ts` |

> **Is the AI trained on clothing photos? Not by Racked.** Racked uses Amazon Bedrock Nova models as supplied and does not fine-tune them. Where it needs domain knowledge it writes it down and tests it: the controlled garment taxonomy, a reference of 23 generic shoe classes that grounds recognition, and the formality ladder above. Recognition accuracy is measured, not asserted: [92.8% category accuracy on 300 independent photos](#evidence-and-what-is-not-claimed).

---

## Evidence, and what is not claimed

**Recognition accuracy, measured on the live scan (2026-10-29).** Racked ran the exact scan the app runs — the code behind `POST /api/garments/detect`, with the same prompt, the same Nova Pro model and the same 1,600-pixel photo — on photos from the independent CC BY 4.0 [Clothing Dataset for Second-Hand Fashion](https://zenodo.org/records/13788681). Every answer and photo was locked by hash before the first model call, so nothing could be tuned after seeing results.

It ran twice. **Round 1** measured the scan as it was and found its most common mistake: hoodies and cardigans proposed as outerwear, although Racked's own taxonomy files them as tops. The prompt was given that boundary. **Round 2** then measured the fixed scan on **300 fresh photos it had never been tuned on** — none shared with round 1.

| Measure (95% confidence interval) | Round 1 — before the fix | **Round 2 — current scan, fresh photos** |
| --- | --- | --- |
| **Garment category correct** | 262 of 292 — 89.7% (85.7%–92.7%) | **272 of 293 — 92.8%** (89.3%–95.3%) |
| Exact type correct, on photos labelled with a type | 100 of 168 — 59.5% (52.0%–66.6%) | **138 of 185 — 74.6%** (67.9%–80.3%) |
| Hoodies, cardigans and other tops proposed as outerwear | 18 photos | **1 photo** |
| Products marked "verified" by AI alone | 0 | **0** — only registry evidence verifies a product |
| Scans that came back unlabelled | 0 of 292 | 0 of 293 |
| Service timeouts, where the person is offered manual entry | 8 of 300 — 2.7% | 7 of 300 — 2.3% |

Both rounds together cost **$3.51 of Bedrock time** as counted (with a 1.5× safety margin; each round under a hard cap). The most common miss now is a dress proposed as a top (11 photos); every proposal is shown to the person to confirm or change before anything is saved. [Round 2 results](docs/evaluation-results-r2.md) · [Round 1 results](docs/evaluation-results.md) · [method](docs/evaluation.md#live-path-benchmark-the-scan-the-app-actually-runs) · aggregates [round 1](data/evaluation-live-2026-10-29.json), [round 2](data/evaluation-live-2026-10-29-r2.json) · locks [round 1](data/evaluation-lock.json), [round 2](data/evaluation-lock-r2.json)

<!-- real-use:start (generated from data/pilot-usage.json; tests/real-use.test.ts) -->
**Real use: not measured yet.** Racked has counted, since 2026-10-28, how often people keep the AI's proposal for a scanned piece unchanged, as anonymous daily totals for real (non-demo) accounts. The first snapshot will be published here, with any count under 5 shown as "fewer than 5".
<!-- real-use:end -->

**Synthetic demo cohort.** The main cohort seed deterministically defines each of three hero products with **76 confirmed wears across 25 opted-in owners** — reproducible seed expectations, not a live-table audit or real-user statistics. It shows what a brand would see once the privacy gate opens:

| Signal | Seed result | The question it answers |
| --- | ---: | --- |
| Engagement | **22 of 25 active owners (88%)** | How many owners have worn it at least once? |
| Repeat use | **19 of 25 repeat wearers (76%)** | Is it earning repeated use? |
| Zero-wear opportunity | **3 of 25 owners** | Where could styling help? |

Before the benchmark, a label-coverage audit of 1,000 dataset records found **93.9%** map to Racked's categories, **62.6%** are specific enough for exact-type scoring, and **94.0%** carry usable brand annotations. These measure benchmark compatibility, not model accuracy ([report](data/evaluation-label-coverage.json)).

Racked does **not** claim recognition accuracy beyond the measured benchmark above, sales lift, purchase intent, demographic inference, virtual try-on, or production-scale validation. Every seeded record is synthetic and classified `DEMO`. Pricing is a proposal; nothing is billed.

---

## Privacy and Security

Racked asks people to photograph their closets and asks brands to trust the numbers it releases, so privacy and security are the product, not a feature added afterwards. This section summarises what is built in, how it was built, and how it is tested. The full control list, and everything still open, is in [SECURITY.md](SECURITY.md) and [docs/privacy-and-ethics.md](docs/privacy-and-ethics.md).

### What is built in

- **Brands see groups, never people.**
  - Only owners who opted in are counted, and nothing is released below `k ≥ 25`: not the figures, and not even the count.
  - The release step withholds each figure that would describe fewer than five owners.
  - A brand can open at most six distinct products a day. The budget is claimed atomically in DynamoDB, so lining up results across many products is limited.
  - Consent is read strongly consistent, so opting out removes a person from every aggregate on the next request.
  - Code: [`privacy.ts`](lib/privacy.ts), [`metrics.ts`](lib/metrics.ts).
- **Every record belongs to one account.**
  - Identity and ownership come only from the signed session, never from the request.
  - Every read and write is keyed to the signed-in account's own partition.
  - A request field that names an owner, a role or a verification state is refused, not ignored ([`request-input.ts`](lib/request-input.ts)).
  - Photo keys are built by the server inside the owner's own folder.
  - Deletion can only remove that owner's files ([`deletion-plan.ts`](lib/deletion-plan.ts)).
  - All storage access, and every ownership check, lives in one module: [`lib/server/`](lib/server/production-store.ts).
- **Consent is explicit and recorded.** Sharing is off until switched on, and every change is kept with the exact wording the person saw. Publishing to Community is a separate, deliberate act that can be undone.
- **Photos stay private.**
  - Storage is encrypted S3 with all public access blocked. Links expire in an hour.
  - Uploads are type-checked, size-limited and decoded within a pixel cap.
  - Brand photos are re-encoded without location or camera data.
  - Scan photos nobody keeps are deleted within two days.
- **The AI is boxed in.**
  - Hanger's tools can only read the signed-in wardrobe and anonymous public totals. It has no tool that writes, deletes or changes a setting.
  - Save and Record happen only when a person taps them, and the server checks ownership again.
  - An outfit reaches the screen only through the outfit builder, from pieces the account owns.
  - Model replies are shown as plain text: no HTML or Markdown is rendered anywhere in the app.
  - A brand name read by AI only fills in an unverified label. Registry evidence alone verifies a product.
  - Each scan result is signed by the server, so a saved garment can only point at a photo stored for that account.
  - Brand Hanger sees only released aggregates and makes no model call below the threshold.
- **Accounts are hardened.**
  - Passwords use scrypt with a unique salt at OWASP's recommended cost.
  - Sessions are signed, HTTP-only, SameSite cookies, re-checked against the account on every request, so signing out everywhere or changing a password ends other sessions at once.
  - Reset tokens are stored only as a hash, work once and expire after 30 minutes.
  - Brands can turn on optional two-step sign-in (TOTP): the secret is sealed with AES-256-GCM, each code works once, and attempts are counted before they are checked.
  - Each account has a 90-day activity log with no IP addresses.
  - New brands are approved before they can enroll anything.
  - Demo sessions cannot publish, change sign-in settings, edit the demo brand or reach a real brand's numbers.
- **The browser is locked down.**
  - Every page has an enforced Content Security Policy with a fresh script nonce per request; injected inline scripts do not run.
  - HSTS, `nosniff` and `X-Frame-Options: DENY` are set.
  - Every state-changing request must carry an Origin on an explicit allowlist. The request's own Host header grants no trust.
- **Abuse is capped.**
  - Every write and sign-in is rate-limited.
  - Shared limits in DynamoDB hold across all servers.
  - Sign-up and reset forms carry a bot trap.
  - AI budgets apply per account per day, and site-wide per day in model calls. Every model call is metered, including each agent round, and the budgets fail closed, so Bedrock spend has a hard ceiling.
- **People can leave.** Deleting a piece, an outfit, a Community look or the whole consumer account is owner-scoped and retry-safe.

### How it was built

- **The rules came before the code.**
  - [CONTRIBUTING.md](CONTRIBUTING.md) sets hard boundaries: never weaken authentication or role checks, preserve consent and `k ≥ 25`, and never let AI-read text create a verified brand.
  - A change that weakens one is closed, not merged.
- **Nothing reaches production unreviewed.**
  - Every change arrives by pull request to a protected `main`.
  - CI and CodeQL must pass before merge.
  - Force pushes and branch deletion are blocked.
- **AI coding agents work under written safety rules.**
  - Racked is built with two AI coding agents working in parallel, each in its own lane ([AGENTS.md](AGENTS.md)).
  - Neither may sign in to production, write test data there, or commit a secret, including the demo passwords.
  - Live checks are read-only and unauthenticated.
  - Scripts that could write to AWS do nothing without an explicit opt-in, and default to a dry run.
- **Claims are verified, not assumed.**
  - Live AWS settings are read back, not taken from the template: encryption, public-access block, photo expiry and record expiry, via `pnpm verify:aws`.
  - The Content Security Policy ran in report-only mode on the live site until a check found no violations, and was enforced only then.
  - Known gaps are published in [SECURITY.md](SECURITY.md) under "Still open", not left out.

### How it is tested

- **On every change.**
  - CI runs a production dependency audit, lint, a type check, 948 tests, a production build, and accessibility checks that also fail on any Content Security Policy violation.
  - CodeQL scans every pull request and runs weekly.
  - Dependabot proposes updates weekly.
  - The security-focused test files are listed [below](#testing-and-ci).
- **A local attack harness.**
  - [`scripts/security-harness/`](scripts/security-harness/integration.mjs) drives a production build of the real routes and storage code, against a local DynamoDB, with synthetic accounts. It cannot reach AWS.
  - It tries to sign in past the lockout, read and edit another account's pieces, open another brand's analytics, and release a cohort at 24 owners instead of 25. It also enumerates products past the budget, runs Hanger with the AI budget exhausted, and looks for leaked details in error responses and logs.
  - **63 of 63 checks passed** on its last run (2026-10-27). [Results and how to repeat them](docs/security-verification.md#local-integration--synthetic-accounts-local-dynamodb).
- **Attacks on the AI.** [`ai-privacy-boundaries.test.ts`](tests/ai-privacy-boundaries.test.ts) feeds the real code the following, and none of them changes anything:
  - a model reply that declares a garment verified
  - injected tool calls (`record_wear`, `delete_account`, `set_role`)
  - tool arguments naming another account
  - an instruction hidden in a garment name
  - a replayed answer below the threshold
- **Read-only probes of the live site after each deploy.**
  - Security headers and the enforced policy are present.
  - Cross-site and forged-host writes are refused (403), and an oversized body is refused (413).
  - No credentials or source maps appear in the public scripts.
  - `/.env` and `/.git` return 404.
  - [Results](docs/security-verification.md#live-site--read-only-unauthenticated).
- **Independent review.**
  - In November 2026 the code was audited using Cloudflare's open-source security-audit methodology.
  - Every candidate issue had to be reproduced in an isolated sandbox with synthetic data, then re-checked by a separate reviewer. Production was never touched.
  - It found no path to another person's wardrobe or photos, no account takeover, and no code execution.
  - The highest-priority items it raised are fixed, with regression tests ([Phase 99](PROGRESS.md)); the remaining lower-priority hardening is being worked through.

**Disclaimer.** The AI can be wrong. Its recognition accuracy is measured above and is high but not perfect, which is why nothing is saved until a person confirms it. The demo accounts and cohort are synthetic and labelled `DEMO`, pricing is a proposal and nothing is billed, and Racked does not claim recognition accuracy beyond the measured benchmark, sales lift, purchase intent, demographic inference, virtual try-on, or production-scale validation. This is a contest entry, source-available for evaluation under its [LICENSE](LICENSE), not a finished commercial service.

---

## Testing and CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs a production dependency audit, lint, type check, the full test suite, a production build and [accessibility checks](docs/accessibility.md) (axe on the public pages and, through a fixture-only harness, the signed-in screens, plus keyboard-only passes of both demo flows) on every push and pull request; [`codeql.yml`](.github/workflows/codeql.yml) adds CodeQL. `main` is protected: every change arrives by pull request, and `verify`, `accessibility` and CodeQL (`Analyze JavaScript and TypeScript`) must pass; force pushes and deletion are blocked (read back from GitHub's public API on 2026-11-01).

**948 passing tests** in 120 files (verified 2026-11-03). Tests named `REGRESSION:` reproduce a bug found in real use. A local attack harness drives a production build against local DynamoDB to check sign-in, roles, consent and the 25-owner rule ([docs/security-verification.md](docs/security-verification.md)). Documentation checks recompute the numbers in this README from their sources ([`tests/readme-numbers.test.ts`](tests/readme-numbers.test.ts)).

Coverage over the whole suite (2026-11-03): **96.51% of lines, 87.02% of branches, 94.62% of functions**; `privacy.ts` 100% and the session guard 97.83% of branches. Coverage shows what the tests run, not that the scoring is right.

| What is protected | Tests |
| --- | --- |
| Brands see private wear only at `k ≥ 25` | [`privacy`](tests/privacy.test.ts) · [`brand-route-guards`](tests/brand-route-guards.test.ts) · [`brand-integrity`](tests/brand-integrity.test.ts) |
| Sessions, accounts, two-step sign-in and deletion | [`session-guards`](tests/session-guards.test.ts) · [`two-step`](tests/two-step.test.ts) · [`password-hash`](tests/password-hash.test.ts) · [`account-and-garment-deletion`](tests/account-and-garment-deletion.test.ts) |
| The AI cannot be talked into crossing a boundary | [`ai-privacy-boundaries`](tests/ai-privacy-boundaries.test.ts) · [`hanger-agent`](tests/hanger-agent.test.ts) |
| Requests, origins, headers and abuse limits | [`security-hardening`](tests/security-hardening.test.ts) · [`request-input`](tests/request-input.test.ts) · [`site-origin`](tests/site-origin.test.ts) · [`rate-limit`](tests/rate-limit.test.ts) · [`abuse-limits`](tests/abuse-limits.test.ts) · [`ai-budget`](tests/ai-budget.test.ts) |
| Only registry evidence verifies a brand | [`product-registry`](tests/product-registry.test.ts) · [`brand-autofill`](tests/brand-autofill.test.ts) |
| Photo recognition and intake | [`look-garment-detection`](tests/look-garment-detection.test.ts) · [`look-scan-resilience`](tests/look-scan-resilience.test.ts) · [`garment-intake`](tests/garment-intake.test.ts) |
| Hanger as an agent and a stylist | [`hanger-agent`](tests/hanger-agent.test.ts) · [`stylist-regression`](tests/stylist-regression.test.ts) · [`garment-knowledge`](tests/garment-knowledge.test.ts) |
| The judge demo | [`judge-accounts`](tests/judge-accounts.test.ts) · [`submission-readiness`](tests/submission-readiness.test.ts) · [`build-version`](tests/build-version.test.ts) |

```text
app/            Pages and API routes — app/api/* is the entire backend
components/     The interface: wardrobe, photo intake, Looks, Hanger, brand dashboard
lib/            Domain logic: AI agents, outfit builder, stylist knowledge, privacy gate, registry
lib/server/     All DynamoDB and S3 access, with every ownership check
tests/          120 test files, 948 tests (node --test)
scripts/        Judge and demo seeds, verification, evaluation, owner-run tools (dry run by default)
infra/          CloudFormation: DynamoDB, S3, least-privilege Amplify compute role
docs/           Judge guides, architecture, privacy, AI use log, evaluation protocol
.github/        CI (audit, lint, type check, tests, build, accessibility) and CodeQL
```

---

## Business Model & Pricing (proposed — not currently billed)

Consumers stay free, which solves cold start; brands pay, because post-purchase wear is what they cannot get elsewhere; and the Starter tier prices the wait before a product reaches `k ≥ 25`. No tier weakens consent or the threshold. See [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing).

<!-- pricing:start (generated from lib/pricing.ts; tests/pricing.test.ts) -->
| Tier | Price | Includes |
| --- | --- | --- |
| Consumer Free | $0 | Wardrobe logging, wear tracking, limited Hanger queries |
| Consumer Pro | $6.99/mo or $59/yr | Unlimited Hanger, advanced analytics, outfit export |
| Brand SKU Enrollment | $25 one-time + $10/yr/SKU | Verification, registry matching |
| Brand Starter (below k≥25) | $29/mo | Product enrollment and verification, public Community activity for your products, Brand Looks, and threshold status (released or not yet). No private wear data until a product reaches k ≥ 25. |
| Brand Standard (post-threshold) | $149/mo | Full aggregate dashboard, CSV export |
| Brand Growth | $299/mo | Standard + multi-product comparison + Hanger strategy artifacts |
| A la carte strategy artifact | $15/artifact | For non-subscribers |
<!-- pricing:end -->

---

## Run It Locally

<details>
<summary><strong>Clone, configure, run the gate — expand</strong></summary>

Requirements: Node.js **22.13.0 or newer** and **pnpm 11.9.0**.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # on Windows: copy .env.example .env.local
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm audit:prod
pnpm test:a11y   # after pnpm build; needs `pnpm exec playwright install chromium` once
pnpm dev
```

Nothing needs installing to try Racked: open the live app and use the demo accounts above. To run it yourself, set `SESSION_SECRET` (32 or more characters) in `.env.local`; `.env.example` lists every variable. Account and upload features need a DynamoDB table, a private S3 bucket and AWS credentials with the permissions in `infra/template.yaml`. Never commit `.env.local`. Before a live demo, `pnpm verify:live` checks the deployed site without signing in.

</details>

---

## Documentation

- **For judges:** [JUDGES.md](JUDGES.md) · [Final submission package](docs/final-submission.md) · [Judge accounts](docs/judge-accounts.md) · [Competition checklist](docs/competition-checklist.md) · [One-page summary](docs/one-page-summary.md) · [Presentation script](docs/demo-script.md) · [Demo checklist](docs/demo-checklist.md)
- **The product:** [User workflow](docs/user-workflow.md) · [Brand linking incentives](docs/brand-linking-incentives.md) · [Brand UX review](docs/brand-ux-review.md) · [Brand approval](docs/brand-approval.md)
- **The engineering:** [Architecture and module map](docs/architecture.md) · [Accessibility](docs/accessibility.md) · [Backend API](docs/backend-api.md) · [AI use log](docs/ai-use-log.md) · [Segmentation and the crop benchmark](docs/segmentation-backends.md) · [AWS deployment](docs/aws-deployment.md) · [Security verification](docs/security-verification.md) · [PROGRESS.md](PROGRESS.md)
- **What may be claimed:** [Privacy and ethics](docs/privacy-and-ethics.md) · [Evaluation protocol](docs/evaluation.md) · [Dataset provenance](docs/dataset-provenance.md) · [Test cohort](docs/test-cohort.md) · [Demo storefronts](docs/demo-storefronts.md)
- **Where it goes next:** [Streamline plan](docs/streamline-plan.md) · [App Store launch](docs/app-store-launch.md) · [TikTok campaign](docs/tiktok-campaign.md)
- **Terms:** [LICENSE](LICENSE) — source-available for reading and evaluation; all rights reserved

---

**Last updated:** 2026-11-03 — security section rewritten; test totals and coverage rechecked with the security fixes in Phase 99, and the judge demo photos in Phase 98
**Repository:** https://github.com/manof1color/racked-wardrobe-intelligence
**Competition:** CUA Busch School AI Vibe Coding Contest, Fall 2026
