# Competition checklist

This is the judge’s index for the CUA rubric.

## 1. Problem / opportunity — 20%

- [x] Defines the purchase-versus-actual-wear information gap.
- [x] Consumer value: private garment organization, outfit storage, and wear tracking.
- [x] Brand value: brand-owned actual-wear, active-owner, and repeat-wear intelligence.
- [x] Makes no unsupported sales-lift or recognition-accuracy claim.

## 2. Functionality / technical execution — 25%

- [x] Live HTTPS app on AWS Amplify.
- [x] Real Consumer and Brand account creation and login.
- [x] Salted scrypt password hashes and signed HTTP-only role sessions.
- [x] DynamoDB persistence for accounts, wardrobes, outfits, wears, products, consent, and posts.
- [x] Private encrypted S3 images with public access blocked and expiring links.
- [x] Phone camera/library upload for real front, back, and label photos.
- [x] Mobile photos are resized in the browser before the combined AWS request, with readable 413/non-JSON error handling.
- [x] Automatic rotation, plain-background trim, resize, and avatar-ready PNG preparation.
- [x] Human confirmation and server-signed garment save authorization.
- [x] Avatar outfit layering, persistent outfit save, and multi-piece wear recording.
- [x] Brand-authoritative three-view enrollment with SKU/MPN, GTIN, aliases, hashes, and label text.
- [x] Actual brand metrics derived from connected Consumer records.
- [x] Timestamped product wear events power an eight-week chart, frequency distribution, median/average usage, engagement, and aggregate CSV export.
- [x] Brand ownership, consent filtering, and `k ≥ 25` enforced before aggregate calculation.
- [x] Community posts persist and reveal no private wardrobe.
- [x] Installable responsive PWA.
- [x] Lint, 63 automated tests, and production build pass.

## 3. AI integration / innovation — 20%

- [x] Amazon Bedrock Nova Lite analyzes real garment image bytes.
- [x] Prompt excludes person and protected-demographic inference.
- [x] Brand identity requires registry evidence; image appearance alone is insufficient.
- [x] Consumer Hanger Agent is grounded in the signed-in account’s real wardrobe, wear, outfit, and context data.
- [x] Brand Hanger Agent can access only brand-owned products and thresholded wear aggregates.
- [x] Both Hanger roles support free-form follow-up conversation and retrieve fresh server-side context for every message.
- [x] Consumer Hanger can save a grounded outfit or record it as worn; the save route revalidates item ownership.
- [x] Brand Hanger can discuss product, retention, merchandising, and campaign strategy without receiving identities or suppressed values.
- [x] Brand strategy output is rejected if it recommends individualized outreach inferred from anonymous wear groups.
- [x] Production provider failure opens explicit manual review and saves no invented fallback attributes.
- [x] Major-brand names are editable suggestions; only registry SKU/GTIN evidence creates verification.
- [x] Clearly labeled 25-account synthetic cohort demonstrates the privacy threshold without claiming real customer results.
- [x] Phone images are normalized before Bedrock vision analysis and structured responses are parsed defensively.
- [x] Brand AI receives wear analysis only after the `k≥25` release threshold; below it, Hanger receives no cohort or wear values and is limited to general strategy.

## 4. Code / documentation / GitHub — 15%

- [x] Typed account, garment, product, outfit, metric, registry, and AI models.
- [x] Account/storage operations isolated in `lib/server/production-store.ts`.
- [x] AWS resources and least-privilege Amplify compute policy in `infra/template.yaml`.
- [x] Secrets excluded from GitHub; Amplify runtime allowlist avoids environment dumps.
- [x] GitHub Actions and CodeQL.
- [x] Public repository with meaningful branches, commits, and reviewed pull requests.
- [x] README, architecture, API, AI, privacy, dataset, deployment, summary, and presentation documents.

## 5. UX / polish — 10%

- [x] Responsive desktop and phone layouts.
- [x] Real empty, loading, validation, success, suppression, and provider-error states.
- [x] Semantic inputs, dialogs, labels, focus styles, and reduced-motion support.
- [x] Camera-friendly capture and visible avatar-ready preview before saving.

## 6. Business impact / presentation — 10%

- [x] Measures actual wears, active owners, engagement, repeat-wear rate, average/median frequency, high-frequency use, zero-wear opportunity, and eligible cohort.
- [x] Converts authorized SKU enrollment into a product traceability path.
- [x] Provides Consumer and Brand agents with inspectable evidence.
- [x] [Presentation script](demo-script.md) and [one-page summary](one-page-summary.md) reflect the production flow.

## Bonus evidence

- **Ethical AI:** human confirmation, visible-evidence prompts, non-claims, provider failure closed.
- **Privacy:** per-user consent, private S3, server HMAC, role checks, product ownership, `k ≥ 25`.
- **Accessibility:** semantic controls, focus indicators, responsive layouts, reduced motion.
- **Cross-disciplinary:** consumer behavior, merchandising, privacy, marketing analytics, cloud operations.
