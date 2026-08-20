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
- [x] Separate, explicitly labeled **Take photo** and **Choose image** controls for whole-look intake and every real front/back/label evidence slot.
- [x] Mobile photos are resized in the browser before the combined AWS request, with readable 413/non-JSON error handling.
- [x] Automatic rotation plus a garment auto-crop for display, with a preserved unmodified evidence photo and a tested fallback to original framing when the crop is not confident.
- [x] Human confirmation and server-signed garment save authorization.
- [x] Carousel outfit composition (Looks), persistent outfit save, and multi-piece wear recording.
- [x] Brand-authoritative three-view enrollment with SKU/MPN, GTIN, aliases, hashes, and label text.
- [x] Actual brand metrics derived from connected Consumer records.
- [x] Timestamped product wear events power an eight-week chart, frequency distribution, median/average usage, engagement, and aggregate CSV export.
- [x] Brand ownership, consent filtering, and `k ≥ 25` enforced before aggregate calculation.
- [x] Community publishes one selected saved outfit with all pieces, explicit product-resolution states, public garment IDs, and a post-scoped image proxy; owner/outfit/wardrobe IDs and S3 keys cannot leak.
- [x] Outfit-first Community feed: the garment gallery leads each card, Brand Looks and Community Looks are visually distinguished, synthetic records carry a demo label, and commerce stays secondary to inspiration.
- [x] "Recreate with my wardrobe" leads with coverage, splits pieces into what you already own versus what is missing in plain language, and lets any matched piece be inspected for the reason it was chosen.
- [x] "Shop the Look" is an in-app inspection sheet; only an exact registry-verified product with a server-validated destination is openable, and similar/estimated/unverified/unavailable pieces are never presented as the exact piece worn. Fictional DEMO destinations include a visibly labeled $0.00 bag/checkout simulation with no payment or order backend.
- [x] Brand Community Intelligence aggregates public Looks, likes, recreate requests, outbound interest, and pairings separately from private `k ≥ 25` wear analytics; only brand-owned product IDs are queryable.
- [x] Public brand pages separate Products, brand-authored Brand Looks, and consumer-authored Community Looks, with a tested guarantee that neither provenance can be presented as the other.
- [x] The Brand dashboard answers business questions in plain language ("Are people actually wearing it?", "Do they wear it more than once?", "What does it get worn with?") instead of naming metrics, with a tested guarantee that brand-facing copy never claims sales, revenue, conversion, purchase intent, or causation.
- [x] Empty and suppressed brand states are stated honestly rather than padded with zeroes, and the zero-wear readout explicitly says the brand cannot identify or contact those owners.
- [x] Brand Look builder composes only the account's own enrolled products, grouped by garment slot with a live preview and a piece limit; the server re-checks ownership independently.
- [x] Deterministic three-brand demo cohort (apparel, footwear, jewelry) uses 30 original synthetic products, Brand and Consumer Looks, and explicit `DEMO` labels; guarded PILOT classification rejects synthetic accounts.
- [x] Recreate This Look prioritizes the signed-in Consumer's owned pieces, distinguishes exact/substitute/missing states, exposes weighted evidence, prevents one item from filling two slots, and never treats similarity as exact ownership.
- [x] Affiliate-ready commerce uses controlled redirects to validated public HTTPS destinations, records privacy-safe attribution, and includes no checkout/payment processing.
- [x] Brand Looks contain only products authorized under the signed-in Brand account and remain visibly distinct from Consumer Looks.
- [x] Saved Outfits view with piece thumbnails and one-tap repeat-wear recording that increments real outfit wear totals.
- [x] Sliding-window rate limits on registration, sign-in, AI endpoints, brand metrics, and Community writes (verified live: the eleventh rapid sign-in attempt returns HTTP 429).
- [x] Installable responsive PWA.
- [x] Lint, type check (`tsc --noEmit`), 166 automated tests, production build, and production dependency audit pass (verified 2026-08-20).

## 3. AI integration / innovation — 20%

- [x] Amazon Bedrock Nova Lite analyzes real garment image bytes.
- [x] Garment Recognition V2: controlled category/subtype taxonomy, uncertainty alternatives, first-photo hypothesis carried into confirm-or-revise multi-view reasoning, manual correction, and honest fallback; verification evidence is unchanged.
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

- [x] A CC BY 4.0, 31,638-garment external corpus is documented for held-out recognition evaluation; deterministic sampling/scoring separates category, subtype, label-text, provider failure, and AI-only identity violations without inventing an accuracy claim.

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
- [x] Camera-friendly capture and a visible cropped-display preview before saving.
- [x] Whole-look scanning creates independently tracked item images and safely makes a consistent edge-connected background transparent, with an opaque tight-crop fallback for ambiguous scenes.
- [x] Authenticated logo/tabs preserve the role workspace; Community keeps the role-specific mobile bottom bar and only explicit Sign out ends the session.
- [x] Compact mobile header menu is session-only, links to own-account Settings, retains Sign out, closes on outside tap/Escape, and contains no `/login` or public-home escape route.
- [x] Saved outfits receive a private, category-arranged flat-lay image; mobile outfit cards constrain their own width and horizontal scrollers.
- [x] Forgot-password requests resist enumeration; reset links are hashed, 30-minute, and single-use. SES delivery remains explicitly dependent on verified AWS identities.
- [x] Small/medium Brand terminology and enrollment were reviewed; cheap fixes and limitations are recorded in `docs/brand-ux-review.md`.

## 6. Business impact / presentation — 10%

- [x] Measures actual wears, active owners, engagement, repeat-wear rate, average/median frequency, high-frequency use, zero-wear opportunity, and eligible cohort.
- [x] Converts authorized SKU enrollment into a product traceability path.
- [x] Publishes a proposed business model with an emerging-brand Starter tier for the pre-threshold period, on a labeled in-app `/pricing` page and in the [one-page summary](one-page-summary.md); nothing is billed.
- [x] Provides Consumer and Brand agents with inspectable evidence.
- [x] [Presentation script](demo-script.md) and [one-page summary](one-page-summary.md) reflect the production flow.

## Bonus evidence

- **Ethical AI:** human confirmation, visible-evidence prompts, non-claims, provider failure closed.
- **Privacy:** per-user consent, private S3, server HMAC, role checks, product ownership, `k ≥ 25`, a product-enumeration budget against differencing attacks, public-response field allowlisting, and rate limiting.
- **Accessibility:** semantic controls, focus indicators, responsive layouts, reduced motion.
- **Cross-disciplinary:** consumer behavior, merchandising, privacy, marketing analytics, cloud operations.
