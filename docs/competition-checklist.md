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
- [x] Wear recording with immediate metric and recommendation recalculation.
- [x] Consumer Stylist Agent uses owned pieces; Brand Wear Agent uses privacy-safe aggregate actual-wear data.
- [x] Public social outfit feed links pieces to brand pages without exposing private wardrobe records.
- [x] Individual Vintage Reseller, Clothing Brand, Shoe Brand, and Jewelry Brand dashboards.
- [x] 8 seeded brand products with SKUs and catalog selection.
- [x] Product-to-segment match, score components, reasons, confidence, and campaign brief.
- [x] Loading/disabled, empty, success, validation, and error states.
- [x] Automated tests and successful production build.
- [ ] AWS deployment—exact owner-run steps are in [aws-deployment.md](aws-deployment.md).

## 3. AI integration / innovation — 20%

- [x] Hybrid score uses seven inspectable factors in [`../lib/matching.ts`](../lib/matching.ts).
- [x] Natural-language reasons use only score components and confirmed attributes.
- [x] Confidence/data sufficiency is visible.
- [x] Deterministic fallback is visible and produces the complete workflow without an API.
- [x] Garment attributes require human confirmation before saving.
- [x] The campaign brief prohibits invented lift or forecasting claims.
- [x] Both agents disclose tool use, boundaries, and deterministic-demo status.

## 4. Code / docs / GitHub — 15%

- [x] TypeScript models separate product data, score components, matching, metrics, privacy, and sessions.
- [x] `.env.example` contains placeholders only; `.env.local` is ignored.
- [x] Tests cover score calculation, grounding, privacy threshold, field stripping, sessions, agents, three-view uploads, social privacy, and all four partner dashboards.
- [x] README and focused architecture, AI, privacy, dataset, demo, and deployment documents.
- [x] GitHub Actions workflow runs lint, test, and build.
- [ ] Public remote and checkpoint commits—pending GitHub account connection.

## 5. UX / polish — 10%

- [x] Consumer and Brand modes have unmistakable labels and shared visual language.
- [x] Responsive layouts at desktop, tablet, and phone breakpoints.
- [x] Semantic headings, navigation, labels, dialogs, live status, and error roles.
- [x] Visible keyboard focus, readable contrast, and reduced-motion support.
- [x] Judge flow is available from the landing page in one action.

## 6. Impact / presentation — 10%

- [x] Brand dashboard calculates four metrics from application data.
- [x] All synthetic metrics are labeled.
- [x] Campaign brief translates explainable signals into an ethical marketing action.
- [x] [Demo script](demo-script.md) and [one-page summary](one-page-summary.md) are ready.

## Bonus evidence

- **Ethical AI:** opt-in, protected-attribute exclusion, correction, grounding, no unsupported outcomes.
- **Privacy:** raw wardrobes hidden, minimum cohort `k ≥ 25`, deletion workflow, upload retention plan.
- **Accessibility:** semantic controls, focus indicators, reduced motion, responsive layouts.
- **Cross-disciplinary:** consumer behavior, marketing segmentation, merchandising, privacy, analytics, and cloud architecture.
