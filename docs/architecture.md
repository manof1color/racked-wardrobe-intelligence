# Production architecture and trust boundaries

## Request path

```text
Phone/browser
  → AWS Amplify HTTPS
  → Next.js server routes
      → session verification, role check, and sliding-window rate limit
      → DynamoDB (account-owned structured state)
      → private S3 (authorized and consumer garment images)
      → Amazon Bedrock Nova Pro US profile (whole-look instance detection)
      → Amazon Bedrock Nova Lite (category classification, visible garment
        analysis, and both Hanger conversations)
      → local silhouette / conservative edge isolation (no per-piece provider wait)
```

Every private route resolves the signed session on the server before touching data, and abuse-prone routes consume a rate-limit budget before doing any work.

## Identity

Account profiles carry a monotonically increasing `sessionVersion`. Signed cookies include the version; every authenticated request compares it with the account record. A password change increments the record, invalidating older cookies, while the successful Settings request issues one replacement cookie for the current device.

Password-reset requests always return the same public response. A random 256-bit token is emailed while only its SHA-256 hash, account ID, issue time, 30-minute expiry, TTL, and use state are stored. The consuming DynamoDB update is conditional on the token being unused and unexpired. Any later password change also makes earlier reset records unusable.

`POST /api/auth/register` creates a Consumer or Brand record. Email is normalized, passwords are salted and scrypt-hashed, and a signed HTTP-only session carries only the account subject, role, and expiry. Protected pages enforce the role on the server.

## Consumer ownership boundary

All Consumer records use `PK=USER#<subject>` with typed sort keys such as `GARMENT#`, `OUTFIT#`, and `PROFILE`. Analyzed garment images are saved under `wardrobe/<subject>/…` in private S3 — the auto-cropped display image at that prefix and the unmodified evidence photo under `wardrobe/<subject>/evidence/…`. The confirmation API rejects either key outside that prefix and verifies a server HMAC over the account, display key, evidence key, garment fields, and registry result.

Saved outfits retain `itemIds` for backward-compatible wear recording and add an explicit piece snapshot. Each piece has one non-collapsed resolution state: `EXACT_VERIFIED_PRODUCT`, `AI_ESTIMATED_PRODUCT`, `SIMILAR_PRODUCT`, `GENERIC_UNVERIFIED`, or `VERIFIED_UNAVAILABLE`. Exactness requires a persisted registry product ID; label suggestions remain generic/unverified.

Saved-outfit deletion resolves the requested ID inside the signed-in Consumer's `USER#<subject>` partition, deletes only that outfit record, and best-effort removes a board image only when its key remains under `wardrobe/<subject>/outfits/`. Historical wear events and separately published Community snapshots are independent records and are not removed by this focused action.

Community publication requires an account-owned saved outfit. The stored post snapshots only that outfit's pieces, generates unrelated public garment IDs, and keeps its source outfit ID, wardrobe IDs, and image keys private. Feed JSON is rebuilt from an allowlist, while `/api/community/images/<post>/<garment>` serves only an image explicitly attached to that post.

`lib/recreate-look.ts` compares a public outfit with only the signed-in Consumer's loaded wardrobe. Exactness requires the same authorized registry product ID. Non-exact candidates must share the broad category and are scored with category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%. One owned item may cover only one target. Results expose every component and map to exact, strong, acceptable, weak, or missing states; coverage credits are 100%, 85%, 60%, 25%, and 0% respectively.

Commerce is outbound-link infrastructure, not a marketplace. Enrolled products may store price/currency, availability, product URL, and affiliate metadata. `lib/commerce.ts` accepts only public HTTPS destinations and rejects credentials, custom ports, localhost, IP literals, and private/link-local IPv4. Community exposes only a same-origin controlled route; the server reloads the product and redirects to its stored destination while recording a privacy-safe event.

Similar-product reads compare one allowlisted public garment only with the enrolled product registry. They never query Consumer wardrobes, never cross categories, and never create exact identity.

Brand Looks use separate `BRANDLOOK#` records and `sourceType=brand`. Creation reloads the signed-in brand's products and rejects any product ID outside that account before optionally publishing a clearly labeled Community post.

Brand community intelligence is computed from the public-post partition and identity-free interaction events, separately from private product-wear records. A Brand can request it only for an owned enrolled product. The result reports public outfit appearances, source mix, likes, recreate requests, outbound interest, and pairings—but never handles or account IDs and never joins to private wear rows. `DEMO | PILOT | REGULAR` classification keeps deterministic synthetic records distinct from real pilot and ordinary accounts.

When a signed-in Consumer marks a public Look as inspiring, a conditional record under `USER#<consumer> / INSPIRATION#<public-post>` stores only bounded garment style, color, category, subtype, and public-title signals. It contains no creator handle, image, private wardrobe reference, or liker identity in the Community partition. The public post counter increments once; repeated taps cannot inflate it. Hanger aggregates at most 50 such records into bounded private hints. A style stated in the current message always wins, and the selector may use inspiration only as a fallback while still returning owned wardrobe pieces. Racked does not scrape or require an external social network for this path.

The account-owned `HANGER_CHAT` record holds bounded conversation turns, controlled preferences, prior suggestion IDs, and a separate active outfit of up to four owned-item IDs with controlled occasion/weather/style intent. For every Consumer turn, the server reloads the current wardrobe and resolves those IDs against the signed-in account before a controlled planner classifies the message as create, revise, explain, save-confirm, wear-confirm, advice, or clarify. Only create/revise runs deterministic ranking. A targeted revision preserves unaffected active pieces; explanation and save/wear confirmation refer to the unchanged active selection; advice neither changes it nor produces outfit actions. If a specifically requested owned piece cannot be clearly resolved, or adding one would overfill the four-piece active outfit, clarify returns a question without Save/Record actions and leaves the active outfit unchanged. The same canonical selection supplies the private image projection and action IDs, and the save/wear endpoints revalidate ownership independently. Deleting the conversation clears its stored active outfit as well.

Saved-outfit mutations, including wear increments, are addressed inside the signed-in account's own partition, so one account cannot reach another account's outfits even with a guessed identifier.

## Brand ownership boundary

Brand products use the same account partition with `PRODUCT#<id>` sort keys. The brand name comes from the authenticated account, not a submitted form field. Authorized product images are private. A cross-product registry index contains only product registry records needed for label/SKU resolution.

## Image and AI path

Saved-outfit flat lays reuse only the signed-in Consumer's existing private display cutouts. Sharp places them into deterministic category regions on a clean white canvas, writes a separate private WebP under that owner's wardrobe prefix, and leaves evidence images untouched. Signed one-hour URLs are returned only to that owner.

The default Consumer Add mode is a one-photo instance-detection path. The US Nova Pro geographic profile may return up to 16 distinct visible wardrobe units with normalized bounds and controlled attributes after a full-image row/shelf inventory and missed-region coverage pass. Matching left/right shoes form one `pair` unit and one crop. If provider output splits a pair, the two sides must share a pair identifier; the parser unions only that explicitly paired evidence and never merges adjacent footwear on visual similarity alone. `lib/shoe-knowledge.ts` gives both recognition paths the same generic subtype aliases and visible construction cues, while `lib/garment-taxonomy.ts` normalizes the resulting subtype and grammatical display name. This is deterministic prompt grounding rather than training or product identity. The stored wardrobe record retains `wearableUnit`, so a photographed pair remains one piece through later outfit and wear flows. The parser also rejects tiny and near-duplicate candidates while retaining a recognized but generic piece for manual correction. An immediate model-selection/configuration error may fall back once to Nova Lite; a timeout never doubles the mobile wait. Whole-look recognition uses an 18-second deadline, shorter than the general vision path, reserving synchronous request time for crop preparation and private S3 writes. Sharp stores one private source image and extracts one bounded crop per candidate. The synchronous route then runs the measured local silhouette pass, a conservative edge-connected fallback, and finally the ordinary bounded crop. A transparency-quality guard requires a meaningful visible and solid subject; an almost erased output falls through to the safer method rather than becoming the garment preview. The route deliberately does not invoke a second remote model per piece: recognition quality and a completed mobile response take priority over cosmetic background cleanup. The Consumer sees which path produced each result, chooses and edits candidates before saving, and every candidate receives its own account- and content-bound HMAC. This path explicitly prohibits person or demographic inference, and AI-read logo text has no registry-verification authority. If initial detection fails, the API retains the photo as a zero-confidence editable manual-review item instead of inventing detections or blaming a valid image.

Authenticated pages share role-aware navigation. The wordmark resolves to `/consumer` or `/brand`, Community retains the matching mobile bottom bar, and those bottom tabs are the single primary mobile navigation. The compact header control is session-only and retains Sign out without duplicating workspace destinations. Desktop keeps the top Workspace/Community navigation. Valid sessions that reach `/` or `/login` are redirected back to their workspace. Navigation never clears the secure session cookie; only a successful `POST /api/auth/logout` does. If that request fails, the interface stops its signing-out state and keeps the session active.

One-photo intake exposes separate camera and photo-library inputs. Brand linking is a per-piece upgrade, not a separate mode:

1. Validate JPG/PNG/WebP and size, and normalize to a compressed JPEG in the browser.
2. `POST /api/garments/detect` sends the photo to Amazon Bedrock for bounded whole-look instance detection with a controlled category and subtype, under instructions that prohibit person or demographic inference.
3. Store the source photo privately as evidence and cut one bounded crop per detected piece with an 8% margin. No background removal runs in live intake.
4. Return editable candidates with one-hour signed links and a server confirmation token bound to the account and image keys.
5. Prefill AI-read brand text only as an editable, explicitly unverified suggestion. A label code checked through `POST /api/garments/verify` links a product only on a brand-enrolled GTIN or brand-and-SKU match.
6. Require human confirmation and allow bounded name, category, type, brand, and SKU corrections before creating the wardrobe record. Corrections never create a registry product link. Older records without V2 attributes are normalized safely when read.

The three-view analyzer (`analyzeGarmentImages`: front, back, and label with a first-photo hypothesis) is retained as the independent evaluation benchmark path and remains covered by its identity-boundary tests. It is no longer a live intake route.

In production, provider failure at classification, whole-look recognition, or multi-view analysis degrades to a documented deterministic path: the standard back-plus-label photo set or an explicitly zero-confidence unverified manual-review result. Whole-look display preparation treats silhouette isolation and edge removal as independent enhancements; an exception or implausibly faint transparent result advances to the next method, and the bounded original crop remains usable if neither local isolation is safe. The optional AI background-removal helper is retained for future asynchronous processing but is not called by synchronous intake. The Consumer can save their own reviewed labels, but Racked creates no invented AI attributes or verified product link.

## Abuse and enumeration controls

`lib/rate-limit.ts` applies sliding-window limits per account or per client to registration, sign-in (keyed by both client and email), garment classification, garment analysis, both Hanger agents, brand metrics, and Community writes, answering excess traffic with HTTP 429 and a `retry-after` header. Counters live in compute-instance memory: a deliberate zero-infrastructure first layer, documented in `SECURITY.md` as complementary to future edge/WAF controls rather than a replacement.

`lib/privacy.ts` adds a product-enumeration budget on top of the `k ≥ 25` gate. A single threshold check per query cannot stop a brand from sweeping many SKUs and reconstructing near-threshold groups from the pattern of releases and suppressions, so the shared aggregate function caps how many *distinct* products one brand account can query in a rolling window. Re-opening an already-viewed product costs nothing. The budget log persists under the brand's own `AGGQ#<brand-id>` partition and stores only product identifiers and timestamps — no consumer data — and over-budget requests receive a generic 429 that reveals nothing about cohort sizes.

## Public response boundary

Community feed responses are rebuilt field by field from an explicit public allowlist rather than spread from the stored record, so owner account identifiers, private S3 keys, and DynamoDB key attributes cannot reach a public endpoint even as new fields are added to storage later.

## Brand analytics boundary

Garments connected to an enrolled product are indexed by product ID. Brand metrics first confirm product ownership, then apply the enumeration budget, retrieve connected garments, batch-read only the relevant consent flags, remove non-opted-in owners, and enforce `k ≥ 25` before computing actual wears, active owners, or repeat-wear rate. A suppressed result is returned before any per-owner value is aggregated: the null fields are never computed, not filtered out afterward.

The Brand Hanger agent shares that exact function, so the dashboard and the conversational agent cannot diverge. Released model context carries product identity plus aggregate metrics only. A suppressed result returns threshold-safe guidance before a model call or browser-supplied history can be used, preventing earlier released product values from reappearing in that answer. A server-side output review additionally rejects strategy language that recommends identifying, contacting, or targeting owners inferred from anonymous wear groups.

## AWS infrastructure

`infra/template.yaml` provisions:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a future OIDC migration;
- an Amplify compute role limited to required DynamoDB, S3-object, and Bedrock actions.

## Explicit non-claims

The Looks flat-lay is a visual outfit composition tool, not photorealistic virtual try-on or body-fit prediction. Racked does not predict purchase likelihood, sales lift, identity, income, age, gender, ethnicity, or body measurements. The adaptive photo plan reduces unnecessary photos; it does not improve identification accuracy, and it never changes what counts as verified. Published pricing is a proposal with no billing integration behind it.

## Module map

Where each responsibility lives. Every route, its access level and its abuse controls are in [backend-api.md](backend-api.md).

```text
app/api/auth/…                 Register/login/logout: scrypt hashes, signed sessions, rate limits
app/api/account/               Own-account settings + consumer account deletion (password + typed DELETE)
app/api/auth/password-reset/   Enumeration-safe request + single-use reset confirmation
app/api/garments/detect/       One-photo multi-piece detection + a private bounded crop per piece
app/api/consumer/…             Wardrobe, outfits, consent, home city — always scoped to the signed-in account
app/api/wears/                 Confirmed wear events + saved-outfit wear totals
app/api/brand/…                Brand-owned products and consent-filtered k≥25 aggregates
app/api/agents/…               Hanger conversations; the consumer one is stored, resumable, and clearable
app/api/community/images/      Public post-scoped image proxy; never exposes private S3 keys
app/api/community/[postId]/    Signed-in Recreate This Look comparison
app/api/products/similar/      Rate-limited registry-only product suggestions
app/api/version/               The commit Amplify built, for deploy verification
lib/server/production-store.ts Every DynamoDB/S3 operation, ownership checks, enumeration budget
lib/hanger-agent.ts            Hanger's tool-using agent: wardrobe search, outfit builder, weather, trends
lib/garment-knowledge.ts       Stylist knowledge: formality ladder per garment type, occasion bands
lib/outfit-ranking.ts          Deterministic, constrained outfit scoring with evidence
lib/hanger-turn.ts             Fallback turn modes and active-outfit follow-up planning
lib/hanger-conversation.ts     Hanger prompts, model selection, history bounds, brand output privacy review
lib/hanger-memory.ts           Account-scoped memory: turns, preferences, prior suggestions, active outfit
lib/weather.ts                 Open-Meteo forecast and place search, rounded coordinates, short cache
lib/looks-rows.ts              Looks builder rows, slots, and the ranker's pick for today (no AI call)
lib/garment-edit.ts            Which fields of a saved piece can be edited, and the verified-piece boundary
lib/catalog-match.ts           Look-alike ranking of enrolled products against a scanned piece
lib/garment-analysis.ts        Vision prompts, registry matching, brand-autofill boundary
lib/look-garment-detection.ts  Bounded instance detection, coordinates, deduplication, trust boundary
lib/garment-taxonomy.ts        Controlled categories/subtypes, bounded uncertainty, typed-type resolver
lib/shoe-knowledge.ts          Generic footwear aliases/cues for AI grounding and name grammar
lib/recreate-look.ts           Deterministic owned/substitute/missing scoring with evidence
lib/similar-products.ts        Same-category suggestions using the same scoring weights
lib/outfit-contracts.ts        Exact/estimated/similar/generic/unavailable product states
lib/look-discovery.ts          Inferred look styles, category filters, public-field search
lib/commerce.ts                Public-HTTPS validation and controlled destination states
lib/brand-looks.ts             Brand-owned authorization for Brand Looks
lib/privacy.ts                 k ≥ 25 gate + product-enumeration budget
lib/rate-limit.ts              Sliding-window abuse limits for auth/AI/community endpoints
lib/deletion-plan.ts           Owner-scoped deletion planning: outfits, posts, shared photos, profile last
lib/account-security.ts        Password policy and reset-token lifetime/hash rules
lib/outfit-board.ts            Deterministic category-aware flat-lay placement
lib/garment-crop.ts            Evidence-preserving auto-crop with tested fallbacks
lib/backdrop-model.ts          Clustered backdrop colours; perimeter-run surface test
lib/garment-segmenter.ts       Registration seam for a learned segmenter (MobileSAM-ready)
lib/garment-cutout.ts          Edge-connected transparency (research; not used by live intake)
lib/ai-background-removal.ts   Optional asynchronous-ready segmentation helper; not an intake gate
lib/evaluation-dataset.ts      External-dataset normalization, deterministic sampling, scoring
lib/garment-evaluation-runner.ts  Production-result → privacy-safe benchmark contract
lib/matching.ts                Product-fit reference scorer (analytics reference; no route imports it)
lib/photo-plan.ts              Intake category list; retired photo-plan logic kept with its identity tests
components/consumer-dashboard.tsx  Today / Looks / Closet / Outfits views
components/looks-builder.tsx       Swipe-through outfit rows with lock, Shuffle, Save, and Wear today
components/garment-intake.tsx      Photo intake: per-piece cards, typeable Type field, brand linking
components/garment-editor.tsx      Editing a saved piece
components/agent-panels.tsx        Hanger chat: outfit cards, Save/Record, weather and location controls
components/home-city-setting.tsx   The home city Hanger uses for the forecast
components/demo-purchase-panel.tsx $0 fictional bag and checkout simulation
components/brand-dashboard.tsx     Aggregate metrics, charts, CSV export, Hanger dock
infra/template.yaml            DynamoDB, S3, least-privilege Amplify compute role
```
