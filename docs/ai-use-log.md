# AI use and model boundaries

## Garment vision

- Provider: Amazon Bedrock.
- Model: Amazon Nova Lite (`amazon.nova-lite-v1:0`).
- Inputs: only the garment views the Consumer chose to upload.
- Outputs: confidence, visible label text, category, color, style, construction, material, and view-specific evidence.

The system prompt forbids inferring a person, body, gender, age, ethnicity, income, preference, or ownership. Unknown evidence must remain unknown. Model-visible label text is not sufficient to verify a brand; the application registry must independently match a brand-enrolled hash, GTIN, or brand-plus-SKU identity.

## Image preparation

The AI supplies garment understanding. A deterministic server image pipeline then rotates EXIF orientation, trims a plain background, constrains the image to the avatar canvas, and encodes an optimized PNG. This split makes the image operation repeatable while keeping semantic classification inspectable.

## Consumer Stylist Agent

Allowed tools:

- signed-in account wardrobe;
- that account’s wear totals;
- that account’s saved outfits;
- submitted occasion and weather context.

It may select only owned items and returns its evidence and tool list.

## Brand Wear Intelligence Agent

Allowed tools:

- products owned by the signed-in Brand account;
- verified product-to-wardrobe links;
- per-owner aggregate consent;
- confirmed wear totals after the `k ≥ 25` gate.

It cannot retrieve names, emails, consumer images, or raw wardrobes.

## Failure policy

Production garment intake fails closed. If Bedrock returns an error or malformed response, Racked returns an explicit provider error and creates no wardrobe item. Deterministic fallback logic remains only as isolated unit-test coverage for safe parser behavior; it is not a production save path.

Mobile photos are auto-rotated, resized to fit within 1568×1568, and JPEG-compressed in request memory before they are sent to Bedrock. This keeps modern phone images within a predictable inference payload. The structured-response parser accepts valid JSON returned directly, inside a code fence, or after a short model preface. Provider failures are logged without image bytes, filenames, account IDs, or wardrobe data.

The Brand wear agent calls Bedrock only after the existing consent filter and k≥25 privacy threshold release an aggregate. The model receives product name, eligible-owner count, confirmed-wear count, active-owner count, and repeat-wear percentage. It never receives customer names, emails, photos, owner identifiers, or individual wardrobe records. Numeric evidence shown in the UI is rendered from server-calculated metrics rather than model-generated values.

## Claims not made

Racked does not claim photorealistic virtual try-on, body fit, recognition accuracy, purchase probability, sales lift, demographic classification, or production-scale validation.
