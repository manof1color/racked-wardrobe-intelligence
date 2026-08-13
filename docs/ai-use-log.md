# AI use and model boundaries

## Garment vision

- Provider: Amazon Bedrock.
- Model: Amazon Nova Lite (`amazon.nova-lite-v1:0`).
- Inputs: only the garment views the Consumer chose to upload.
- Outputs: confidence, visible label text, visibly printed brand text (autofill only — see `docs/privacy-and-ethics.md`, Brand identity boundary), controlled category and subtype, color, pattern, style, construction, material, uncertainty alternatives, and view-specific evidence.

The system prompt forbids inferring a person, body, gender, age, ethnicity, income, preference, or ownership. Unknown evidence must remain unknown. Model-visible label text is not sufficient to verify a brand; the application registry must independently match a brand-enrolled hash, GTIN, or brand-plus-SKU identity.

## Image preparation

The AI supplies garment understanding. Before the AWS request, the browser creates an approximately 1.2 MB, maximum-1800-pixel JPEG analysis copy of each selected photo; the original stays on the device. A deterministic server image pipeline then rotates EXIF orientation, preserves the unmodified evidence photo, and encodes a separately auto-cropped display PNG that falls back to original framing when the crop is not confident. This prevents combined full-resolution phone photos from triggering an Amplify 413/non-JSON response while keeping label detail suitable for analysis.

## Adaptive photo-plan classification

When the Consumer adds the first photo, an optional Bedrock step returns a controlled category/subtype hypothesis, 0–95 confidence, visible-evidence rationale, and bounded alternatives. `lib/garment-taxonomy.ts` normalizes it before `lib/photo-plan.ts` requests category-specific evidence. Final multi-view analysis receives the initial hypothesis and must confirm or revise it when the added views disagree. The Consumer can correct name, broad category, subtype, brand, and SKU. Provider failure returns `unknown`/`other-garment` with no invented pattern, material, or alternatives.

Hard boundary: the plan module has no access to brand, SKU, registry, or verification data, and the classification result can never mark a product verified. Brand verification still requires registry GTIN or brand-plus-SKU evidence at analysis time, regardless of which plan was used or how many photos were taken — enforced by a regression test in `tests/photo-plan.test.ts`.

**Rubric evidence (AI integration/innovation):** the enrollment agent adapts its own evidence-gathering to the classified garment category with user-visible reasoning and a user override, while keeping identity verification strictly registry-based — see `lib/photo-plan.ts`, `app/api/garments/classify/route.ts`, and `tests/photo-plan.test.ts`.

## Recreate This Look decision engine

Recreate This Look deliberately uses a deterministic, inspectable decision layer over the AI-extracted garment attributes. Exact ownership requires the same registry product ID. Otherwise, only same-category owned pieces are compared using declared weights: category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%. The API returns every component and evidence string, prevents one owned item from filling multiple slots, and labels the result exact, strong, acceptable, weak, or missing. This avoids an opaque “AI says 87%” claim while still turning structured visual intelligence into useful wardrobe decisions.

## Consumer Hanger Agent

Allowed tools:

- signed-in account wardrobe;
- that account’s wear totals;
- that account’s saved outfits;
- submitted occasion and weather context.

It is a multi-turn conversation, not a one-click summary. The browser sends at most eight prior user/assistant turns; the server treats that history only as conversational text and reloads authoritative wardrobe context on every message. It may select only owned items, returns its evidence and tool list, and exposes server-selected actions to save the outfit or record those pieces as worn. The save endpoint independently checks that every submitted item belongs to the signed-in wardrobe.

## Brand Hanger Agent

Allowed tools:

- products owned by the signed-in Brand account;
- verified product-to-wardrobe links;
- per-owner aggregate consent;
- confirmed wear totals after the `k ≥ 25` gate.
- timestamped aggregate wear events and server-calculated eight-week frequency bins after the same gate.

It cannot retrieve names, emails, consumer images, or raw wardrobes.

It is also multi-turn. For each brand message, the server rechecks product ownership, consumer consent, and the cohort threshold before constructing model context. Released context may contain only product name/SKU/category plus aggregate usage metrics and trend bins. Suppressed context contains the minimum cohort rule but no suppressed wear values. This lets brands discuss retention, merchandising, education, and campaign strategy without turning Hanger into an individual-customer surveillance tool.

## Conversation controls

- Free-form message length: 1,000 characters.
- Prior history sent to the provider: most recent eight non-empty turns.
- Provider output displayed: at most 2,500 characters.
- Conversation state: current page session only; authoritative account context is never accepted from the browser.
- Consumer context excludes image URLs/keys; Brand context excludes owner IDs, label transcriptions, image records, and suppressed values.
- Bedrock failure falls back to a deterministic, context-grounded response so Hanger remains usable without inventing analysis.
- Brand strategy output passes a server-side aggregate-only language review. Recommendations that suggest identifying, contacting, or targeting owners from wear groups are discarded and replaced with a privacy-safe public-content and aggregate-measurement plan.
- Model Markdown markers are normalized to plain chat text before display.

## Failure policy

Production garment intake never invents attributes. If Bedrock returns an error or incomplete response, Racked returns an explicitly unverified manual-review result. The Consumer can add their own garment name, brand label, and optional SKU before saving. That user-authored label does not create a verified brand-product link.

Major-brand recognition is a suggestion layer over visible label text. A recognized name is prefilled for confirmation or editing and remains unverified. Only an enrolled registry record matched by GTIN or brand-plus-SKU becomes a verified product link.

Mobile photos are auto-rotated, resized to fit within 1568×1568, and JPEG-compressed in request memory before they are sent to Bedrock. This keeps modern phone images within a predictable inference payload. The structured-response parser accepts valid JSON returned directly, inside a code fence, or after a short model preface. Provider failures are logged without image bytes, filenames, account IDs, or wardrobe data.

The Brand wear agent applies the existing consent filter and k≥25 privacy threshold before constructing model context. Above the threshold, the model receives only product identity plus released aggregate usage metrics. Below the threshold, it receives product identity and the threshold rule—but no cohort size or wear values—so it can discuss general strategy without making evidence-based customer claims. It never receives customer names, emails, photos, owner identifiers, or individual wardrobe records. Numeric evidence shown in the UI is rendered from server-calculated metrics rather than model-generated values.

## Claims not made

Racked does not claim photorealistic virtual try-on, body fit, recognition accuracy, purchase probability, sales lift, demographic classification, or production-scale validation.
