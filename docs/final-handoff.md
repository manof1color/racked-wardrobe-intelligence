# Final Engineering Handoff

Verified on 2026-08-13 against production and the implementation merged through PR #39.

## Implemented and verified

- Garment Recognition V2 preserves controlled broad category, subtype, visible attributes, confidence, alternatives, and human correction across first-photo and final multi-view analysis.
- Saved outfits retain explicit wardrobe-piece references and distinct exact, estimated, similar, generic, and unavailable product states.
- Community publishes only a selected saved outfit through a strict public allowlist and post-scoped image proxy.
- Recreate This Look compares a public outfit only with the signed-in Consumer's wardrobe and returns reproducible exact/substitute/missing results.
- Verified products support validated outbound commerce destinations without checkout or payment processing.
- Brand accounts can create Brand Looks only from their own enrolled products.
- Brand dashboards and Brand Hanger separate private `k >= 25` wear analytics from intentionally public Community activity.
- Production contains three fictional DEMO brands, 30 synthetic products, six Brand Looks, 25 synthetic Consumers, saved/public outfits, and 76 wear events per hero product.

Production verification confirmed the apparel demo login, 10 owned products, two Brand Looks, 76 confirmed wears, 25 eligible owners, 88% engagement, 76% repeat wear, 11 public Looks, 37 inspirations, and 15 recreate requests. These are deterministic synthetic demo results, not commercial evidence.

## Test and security status

The gate is `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm audit:prod`. The current implementation carries **245 passing tests** (re-verified 2026-08-28). The Add Racked action opens the native installer where browsers support it and otherwise opens explicit device-specific instructions; iOS correctly preserves the required Safari Share → Add to Home Screen confirmation. One-photo intake supports up to 16 wardrobe units, retains matching left/right footwear as one pair, validates transparent segmentation output, and regression-tests split-side grouping without collapsing neighboring pairs. Consumer Hanger recognizes explicit requests for exact owned garments or unambiguous natural-language aliases, locks them before compatibility/underuse scoring, honors exclusions, and cannot invent unknown pieces. It may use private, bounded signals from intentionally saved Community inspirations only when the current request supplies no conflicting style. It retains up to 100 owner-validated prior recommendation IDs, rotates repeated creation prompts through unseen pieces, and uses one canonical ordered selection for the written list, owned-piece image projection, Save/Wear IDs, saved title, and private board. Model prose and client actions are checked against that selection before persistence. AI cannot grant verified brand identity. Brand and Community responses exclude private wardrobe records, inspiration profiles, owner IDs, emails, evidence images, S3 keys, and individual wear histories. Private wear remains consent-filtered and suppressed below 25 owners. Public Community metrics use only published records and identity-free events.

## Final contracts for frontend work

### Garment subtype

`GarmentAnalysis.garment` stores `category`, controlled `subtype`, `color`, `pattern`, `material`, `style[]`, `construction[]`, and bounded `alternatives[]`. `WardrobeItem` persists category/subtype independently from `identityStatus` and optional `registryProductId`.

### Outfit product references

`SavedOutfit.itemIds` remains backward compatible; `pieces[]` snapshots `{ wardrobeItemId, resolution }`. Resolution states are `EXACT_VERIFIED_PRODUCT`, `AI_ESTIMATED_PRODUCT`, `SIMILAR_PRODUCT`, `GENERIC_UNVERIFIED`, and `VERIFIED_UNAVAILABLE`. Only the exact state may carry authoritative registry identity.

### Public outfit

`OutfitPost` exposes public ID/handle, title, caption, presentation image, date, likes, `sourceType`, optional fictional/data classification, public garments, and an exact-product projection. Each garment has a new `publicGarmentId`; internal account, outfit, wardrobe, database, and storage keys never serialize.

### Recreate This Look

`RecreateLookResult` returns outfit ID, coverage, covered/total pieces, methodology, and per-piece target/state/score/owned summary/components/reasons. States are `EXACT_OWNED`, `STRONG_SUBSTITUTE`, `ACCEPTABLE_SUBSTITUTE`, `WEAK_SUBSTITUTE`, and `MISSING`. Exact requires the same registry ID. Substitutes use category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%; one owned item covers one target.

### Shoppable product state

Optional brand-owned fields are `productUrl`, `affiliateUrl`, `price`, `currency`, `availability`, `affiliateProvider`, and `affiliateTrackingId`. Public states are `EXACT_AVAILABLE`, `EXACT_UNAVAILABLE`, `SIMILAR_AVAILABLE`, and `NO_DESTINATION`. Shopping must route through `/api/products/[productId]/outbound`; never accept a client destination URL.

### Brand Look

`BrandLook` stores ID, owner subject, brand/slug, title, caption, owned `productIds[]`, creation time, `sourceType: brand`, publication state, and optional data classification. The server reloads owned products and rejects cross-brand IDs.

### Brand Community metrics

`BrandCommunityMetrics` returns product ID, public/Consumer/Brand appearance counts, inspiration, recreate requests, outbound clicks, ranked paired categories/products, and `privacyBoundary: PUBLIC_ACTIVITY_ONLY`. It never contains handles or account IDs and is not joined to private wear cohorts.

### Demo and pilot labels

`DataClassification` is `DEMO | PILOT | REGULAR`. Normal registration creates `REGULAR`; the seed writes `DEMO`; the guarded pilot script permits only a real non-demo Brand account to become `PILOT`. Public demo posts also carry `fictional: true`.

## API and compatibility notes

- `POST /api/garments/classify`: initial controlled hypothesis and photo plan.
- `POST /api/garments/analyze`: required evidence plus hypothesis; may confirm or revise.
- `POST /api/community`: publishes one owned saved outfit.
- `POST /api/community/[postId]/recreate`: account-bound Recreate response.
- `GET /api/products/[productId]/outbound`: controlled validated redirect.
- `GET/POST /api/brand/looks`: owned-product Brand Looks.
- `POST /api/brand/community-metrics`: public-activity aggregate for one owned product.

Legacy category-only garments are normalized to valid subtypes. Saved outfits retain `itemIds`; `pieces` is additive. Community sanitization tolerates legacy projections without expanding the allowlist. Missing data classification is ordinary pre-classification data, never implicitly DEMO or PILOT.

## Limitations and deferred work

- Recognition accuracy has not been measured against a labeled evaluation set.
- Multi-piece foreground isolation is display preparation, not virtual try-on or body-fit prediction. Bedrock segments existing garment pixels into a transparent PNG; the server validates and trims the result, while provider failure uses conservative edge transparency or keeps an opaque crop. Existing garments are not silently rewritten—new whole-look scans receive this processing.
- Product identity still requires registry GTIN or brand-plus-SKU evidence.
- Community aggregation currently reads the latest 1,000 identity-free events; production scale needs counters or pagination.
- Legal brand-authority verification and account-deletion automation remain future operations work.
- Similar-product destination selection and production affiliate-provider integration remain future work.
- Checkout, payments, fulfillment, returns, payouts, DMs, follower graph, and virtual try-on remain intentionally out of scope.

Frontend agents must preserve resolution labels, alternatives/manual correction, Consumer-vs-Brand Looks, DEMO/PILOT badges, Recreate evidence, controlled shopping routes, and the visible split between public Community activity and private thresholded wear analytics. Never infer exact identity from AI confidence or submit client-provided wardrobe data to Recreate.
