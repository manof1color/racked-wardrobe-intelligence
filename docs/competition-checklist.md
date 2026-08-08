# Competition checklist

Use this page as the judge’s index. Every statement below points to working UI, code, tests, or a clearly labeled deployment task.

## 1. Problem / opportunity — 20%

- **Problem:** small and mid-sized apparel brands can see purchases but not whether a new product complements what an opted-in customer actually uses.
- **Consumer value:** remember items, record wears, identify underuse and gaps, and receive explainable recommendations.
- **Brand value:** identify privacy-safe product opportunities, duplicate risk, gap prevalence, and useful pairings.
- **Evidence:** landing-page opportunity statement, [one-page summary](one-page-summary.md), and Brand dashboard metrics.

## 2. Functionality / execution — 25%

- [x] Public landing page and access-controlled workspaces.
- [x] Signed HTTP-only sessions with role enforcement on protected pages.
- [x] Explicit Consumer consent before entering the wardrobe workspace.
- [x] 12 seeded garments, 136 seeded wear events, and 3 saved outfits.
- [x] Garment image/manual intake, type/size guidance, AI suggestion review, mandatory confirmation.
- [x] Runnable front/back/label fixture with strict validation, per-view evidence, SKU extraction, and public brand-page link.
- [x] Brand-authoritative enrollment stores front/back/label hashes, SKU/MPN, optional GTIN, label aliases, and account-scoped ownership.
- [x] Consumer mobile views include Today, Avatar outfit builder, Closet, Scan, and a PWA manifest.
- [x] Wear recording with immediate metric and recommendation recalculation.
- [x] Consumer Stylist Agent uses owned pieces; Brand Wear Agent uses privacy-safe aggregate actual-wear data and suppresses that aggregate below the `k ≥ 25` cohort floor. Cohort size is computed from a synthetic population (verify with SKU `NA-AC-6044`, computed cohort of 1), not a hand-typed number, and the same query is subject to a shared anti-enumeration budget across both aggregate-exposing routes.
- [x] Brand Retention Agent reports an engagement *trend* (last 30 days vs. the 30 days before) rather than a single point-in-time rate, classifying each product as suppressed / at-risk / softening / stable / rising — the same pattern as flagging declining gym check-ins before a cancellation, applied to product engagement. Shares the identical `k ≥ 25` gate. Verify a real declining case with `productId: "p3"` (Moss Court Sneaker).
- [x] Public social outfit feed links pieces to brand pages without exposing private wardrobe records.
- [x] Agent actions record an entire outfit, publish a post, and generate bounded brand/partner action plans; Community likes persist across reloads.
- [x] Individual Vintage Reseller, Clothing Brand, Shoe Brand, and Jewelry Brand dashboards.
- [x] 8 seeded brand products with SKUs and catalog selection.
- [x] Product-to-segment match, score components, reasons, confidence, and campaign brief.
- [x] Loading/disabled, empty, success, validation, and error states.
- [x] Automated tests and successful production build.
- [x] AWS Amplify deployment is live at [main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com); the verified smoke-test record is in [aws-deployment.md](aws-deployment.md).

## 3. AI integration / innovation — 20%

- [x] Hybrid score uses seven inspectable factors in [`../lib/matching.ts`](../lib/matching.ts).
- [x] Natural-language reasons use only score components and confirmed attributes.
- [x] Confidence/data sufficiency is visible.
- [x] Deterministic fallback is visible and produces the complete workflow without an API.
- [x] Garment attributes require human confirmation before saving.
- [x] **Real vision AI:** `POST /api/garments/analyze` sends the actual in-memory image bytes to Claude Haiku 4.5 when configured, requests a strict JSON schema, and maps visible findings into the review UI. The model cannot independently verify brand ownership or SKU identity; only the Brand registry can.
- [x] **Reliable AI fallback:** missing credentials, timeout, non-success response, refusal, truncated output, or malformed schema returns the complete labeled deterministic workflow rather than breaking the demo. Both success and failure paths are automated in `tests/three-view-upload.test.ts`.
- [x] The campaign brief prohibits invented lift or forecasting claims.
- [x] All three bounded agents disclose tool use and boundaries; the garment scanner separately discloses multimodal versus deterministic-fallback status.

## 4. Code / docs / GitHub — 15%

- [x] TypeScript models separate product data, score components, matching, metrics, privacy, and sessions.
- [x] `.env.example` contains placeholders only; `.env.local` is ignored.
- [x] Tests cover score calculation, grounding, privacy threshold enforcement (suppressed and released cohorts, consent inclusion/exclusion, enumeration budget), field stripping, sessions, agents, real multimodal output, provider-failure fallback, front-only and three-view uploads, registry hash/label matching, social privacy, and all four partner dashboards.
- [x] Security hardening includes constant-time session signature comparison, early upload-set size rejection, bounded agent inputs, and category-only Brand aggregates.
- [x] Production dependencies pass `pnpm audit:prod`; patched transitive versions are pinned and the audit runs on every GitHub Actions verification.
- [x] README and focused architecture, AI, privacy, dataset, demo, and deployment documents.
- [x] GitHub Actions workflow runs lint, test, and build.
- [x] Public repository and checkpoint history: [`manof1color/racked-wardrobe-intelligence`](https://github.com/manof1color/racked-wardrobe-intelligence).

## 5. UX / polish — 10%

- [x] Consumer and Brand modes have unmistakable labels and shared visual language.
- [x] Responsive layouts at desktop, tablet, and phone breakpoints.
- [x] Semantic headings, navigation, labels, dialogs, live status, and error roles.
- [x] Visible keyboard focus, readable contrast, and reduced-motion support.
- [x] Judge flow is available from the landing page in one action.

## 6. Impact / presentation — 10%

- [x] Brand dashboard calculates four metrics server-side (`POST /api/brand/metrics`) against a computed, opted-in, relevance-matched cohort, and suppresses all four (showing only the non-aggregate inspectable score) when that cohort falls below the `k ≥ 25` floor.
- [x] All synthetic metrics are labeled.
- [x] Campaign brief translates explainable signals into an ethical marketing action.
- [x] [Demo script](demo-script.md) and [one-page summary](one-page-summary.md) are ready.

## Bonus evidence

- **Ethical AI:** opt-in, protected-attribute exclusion, correction, grounding, no unsupported outcomes.
- **Privacy:** raw wardrobes hidden, minimum cohort `k ≥ 25` enforced in code against a computed (not static) cohort at both the agent and dashboard-metric layer — both now server-side only (see [`lib/privacy.ts`](../lib/privacy.ts), [`lib/segments.ts`](../lib/segments.ts), [`lib/population.ts`](../lib/population.ts), [`lib/agents.ts`](../lib/agents.ts), [`lib/metrics.ts`](../lib/metrics.ts)) — plus an anti-enumeration query budget and a live, revocable per-consumer consent flag, deletion workflow, upload retention plan.
- **Accessibility:** semantic controls, focus indicators, reduced motion, responsive layouts.
- **Cross-disciplinary:** consumer behavior, marketing segmentation, merchandising, privacy, analytics, and cloud architecture.
