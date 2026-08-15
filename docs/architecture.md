# Production architecture and trust boundaries

## Request path

```text
Phone/browser
  → AWS Amplify HTTPS
  → Next.js server routes
      → session verification, role check, and sliding-window rate limit
      → DynamoDB (account-owned structured state)
      → private S3 (authorized and consumer garment images)
      → Amazon Bedrock Nova Lite (category classification, visible garment
        analysis, and both Hanger conversations)
```

Every private route resolves the signed session on the server before touching data, and abuse-prone routes consume a rate-limit budget before doing any work.

## Identity

`POST /api/auth/register` creates a Consumer or Brand record. Email is normalized, passwords are salted and scrypt-hashed, and a signed HTTP-only session carries only the account subject, role, and expiry. Protected pages enforce the role on the server.

## Consumer ownership boundary

All Consumer records use `PK=USER#<subject>` with typed sort keys such as `GARMENT#`, `OUTFIT#`, and `PROFILE`. Analyzed garment images are saved under `wardrobe/<subject>/…` in private S3 — the auto-cropped display image at that prefix and the unmodified evidence photo under `wardrobe/<subject>/evidence/…`. The confirmation API rejects either key outside that prefix and verifies a server HMAC over the account, display key, evidence key, garment fields, and registry result.

Saved outfits retain `itemIds` for backward-compatible wear recording and add an explicit piece snapshot. Each piece has one non-collapsed resolution state: `EXACT_VERIFIED_PRODUCT`, `AI_ESTIMATED_PRODUCT`, `SIMILAR_PRODUCT`, `GENERIC_UNVERIFIED`, or `VERIFIED_UNAVAILABLE`. Exactness requires a persisted registry product ID; label suggestions remain generic/unverified.

Community publication requires an account-owned saved outfit. The stored post snapshots only that outfit's pieces, generates unrelated public garment IDs, and keeps its source outfit ID, wardrobe IDs, and image keys private. Feed JSON is rebuilt from an allowlist, while `/api/community/images/<post>/<garment>` serves only an image explicitly attached to that post.

`lib/recreate-look.ts` compares a public outfit with only the signed-in Consumer's loaded wardrobe. Exactness requires the same authorized registry product ID. Non-exact candidates must share the broad category and are scored with category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%. One owned item may cover only one target. Results expose every component and map to exact, strong, acceptable, weak, or missing states; coverage credits are 100%, 85%, 60%, 25%, and 0% respectively.

Commerce is outbound-link infrastructure, not a marketplace. Enrolled products may store price/currency, availability, product URL, and affiliate metadata. `lib/commerce.ts` accepts only public HTTPS destinations and rejects credentials, custom ports, localhost, IP literals, and private/link-local IPv4. Community exposes only a same-origin controlled route; the server reloads the product and redirects to its stored destination while recording a privacy-safe event.

Similar-product reads compare one allowlisted public garment only with the enrolled product registry. They never query Consumer wardrobes, never cross categories, and never create exact identity.

Brand Looks use separate `BRANDLOOK#` records and `sourceType=brand`. Creation reloads the signed-in brand's products and rejects any product ID outside that account before optionally publishing a clearly labeled Community post.

Brand community intelligence is computed from the public-post partition and identity-free interaction events, separately from private product-wear records. A Brand can request it only for an owned enrolled product. The result reports public outfit appearances, source mix, likes, recreate requests, outbound interest, and pairings—but never handles or account IDs and never joins to private wear rows. `DEMO | PILOT | REGULAR` classification keeps deterministic synthetic records distinct from real pilot and ordinary accounts.

Saved-outfit mutations, including wear increments, are addressed inside the signed-in account's own partition, so one account cannot reach another account's outfits even with a guessed identifier.

## Brand ownership boundary

Brand products use the same account partition with `PRODUCT#<id>` sort keys. The brand name comes from the authenticated account, not a submitted form field. Authorized product images are private. A cross-product registry index contains only product registry records needed for label/SKU resolution.

## Image and AI path

The default Consumer Add mode is a one-photo instance-detection path. Bedrock may return up to eight distinct visible wearable items with normalized bounds and controlled attributes. The parser rejects unknown, tiny, and near-duplicate candidates; Sharp stores one private source image and produces a separate private display crop for each candidate. The Consumer chooses and edits candidates before saving, and every candidate receives its own account- and content-bound HMAC. This path explicitly prohibits person or demographic inference, and AI-read logo text has no registry-verification authority. If the provider fails or no clear piece is visible, the API returns an honest error instead of inventing detections.

The optional **Verify one item** mode preserves the stronger evidence path below:

1. Validate JPG/PNG/WebP and size before processing.
2. Optionally classify the first photo. Bedrock returns a bounded descriptive hypothesis: broad category, controlled subtype, confidence, visible-evidence rationale, and up to three alternatives. `lib/garment-taxonomy.ts` constrains every result before the identity-free photo-plan module selects the next shots. Nothing is stored.
3. Require front, back, and label views, then send only those views to Amazon Bedrock with instructions that prohibit person or demographic inference.
4. Parse the structured visible-attribute result, including any brand name visibly printed on a label or logo.
5. Pass the first-photo hypothesis into final multi-view reasoning so Bedrock confirms or revises it against the additional views; normalize subtype, pattern, material, alternatives, and visible evidence before use.
6. Prefill recognized major-brand names and AI-read brand text only as editable, explicitly unverified suggestions; verify identity only against a brand-enrolled GTIN or brand-and-SKU record.
7. Use Sharp to rotate, preserve the unmodified evidence photo, and encode a separately auto-cropped display PNG. A crop keeping under five percent of the frame, a trim failure, or a trim that changes nothing all fall back to the original framing with a recorded reason surfaced to the Consumer.
8. Store both variants privately and return one-hour signed links plus a server confirmation token bound to the account and both keys.
9. Require human confirmation and allow bounded name, category, subtype, brand, and SKU corrections before creating the wardrobe record. Corrections never create a registry product link. Older records without V2 attributes are normalized safely when read.

In production, provider failure at either the classification or analysis step degrades to a documented deterministic path: the standard back-plus-label photo set, and an explicitly unverified manual-review result. The Consumer can save their own reviewed labels, but Racked creates no invented AI attributes or verified product link.

## Abuse and enumeration controls

`lib/rate-limit.ts` applies sliding-window limits per account or per client to registration, sign-in (keyed by both client and email), garment classification, garment analysis, both Hanger agents, brand metrics, and Community writes, answering excess traffic with HTTP 429 and a `retry-after` header. Counters live in compute-instance memory: a deliberate zero-infrastructure first layer, documented in `SECURITY.md` as complementary to future edge/WAF controls rather than a replacement.

`lib/privacy.ts` adds a product-enumeration budget on top of the `k ≥ 25` gate. A single threshold check per query cannot stop a brand from sweeping many SKUs and reconstructing near-threshold groups from the pattern of releases and suppressions, so the shared aggregate function caps how many *distinct* products one brand account can query in a rolling window. Re-opening an already-viewed product costs nothing. The budget log persists under the brand's own `AGGQ#<brand-id>` partition and stores only product identifiers and timestamps — no consumer data — and over-budget requests receive a generic 429 that reveals nothing about cohort sizes.

## Public response boundary

Community feed responses are rebuilt field by field from an explicit public allowlist rather than spread from the stored record, so owner account identifiers, private S3 keys, and DynamoDB key attributes cannot reach a public endpoint even as new fields are added to storage later.

## Brand analytics boundary

Garments connected to an enrolled product are indexed by product ID. Brand metrics first confirm product ownership, then apply the enumeration budget, retrieve connected garments, batch-read only the relevant consent flags, remove non-opted-in owners, and enforce `k ≥ 25` before computing actual wears, active owners, or repeat-wear rate. A suppressed result is returned before any per-owner value is aggregated: the null fields are never computed, not filtered out afterward.

The Brand Hanger agent shares that exact function, so the dashboard and the conversational agent cannot diverge. Released model context carries product identity plus aggregate metrics only; suppressed context carries the threshold rule and no values. A server-side output review additionally rejects strategy language that recommends identifying, contacting, or targeting owners inferred from anonymous wear groups.

## AWS infrastructure

`infra/template.yaml` provisions:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a future OIDC migration;
- an Amplify compute role limited to required DynamoDB, S3-object, and Bedrock actions.

## Explicit non-claims

The Looks slide view is a visual outfit composition tool, not photorealistic virtual try-on or body-fit prediction. Racked does not predict purchase likelihood, sales lift, identity, income, age, gender, ethnicity, or body measurements. The adaptive photo plan reduces unnecessary photos; it does not improve identification accuracy, and it never changes what counts as verified. Published pricing is a proposal with no billing integration behind it.
