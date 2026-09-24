# AI use and model boundaries

**Model routing (2026-09-22).** Amazon serves Nova through regional inference profiles, so
`amazon.nova-lite-v1:0` is rejected where `us.amazon.nova-lite-v1:0` is accepted. Garment detection
always used the prefixed form; the conversational path used the bare `AI_MODEL` value, so every
Hanger reply failed its one Bedrock call and fell back to the same grounded sentence. Hanger now
tries the prefixed form first, keeps the configured id as a later attempt, retries only on a
model-configuration error (never on a timeout or a throttle), and states in the reply and on screen
when a reply was composed without the model.

## Garment vision

- Provider: Amazon Bedrock.
- Models: Amazon Nova Lite (`amazon.nova-lite-v1:0`) for single- and multi-view garment analysis; the US Amazon Nova Pro geographic profile (`us.amazon.nova-pro-v1:0`) for whole-look instance detection only.
- Inputs: only the garment views the Consumer chose to upload.
- Outputs: confidence, visible label text, visibly printed brand text (autofill only — see `docs/privacy-and-ethics.md`, Brand identity boundary; in the Closet scan it pre-fills the brand search and ranks enrolled look-alikes, and may let through a product whose listed type disagrees with the scan only when its colour matches exactly, but a link is made solely by the person tapping "This is mine" and is saved as their own pick, never verified), controlled category and subtype, color, pattern, style, construction, material, uncertainty alternatives, and view-specific evidence.

The system prompt forbids inferring a person, body, gender, age, ethnicity, income, preference, or ownership. Unknown evidence must remain unknown. Model-visible label text is not sufficient to verify a brand; the application registry must independently match a brand-enrolled hash, GTIN, or brand-plus-SKU identity.

### One-photo multi-piece detection

The default Consumer Add mode sends one user-selected photo to the US Amazon Nova Pro geographic profile and requests up to 16 distinct visible wardrobe units with normalized bounding coordinates, controlled category/subtype, visible attributes, confidence, and evidence. This dedicated tier is limited to the harder whole-look task; routine analysis and Hanger remain on Nova Lite. The prompt requires a systematic full-image scan, an internal row/shelf inventory, and a second coverage check across shelves, edges, and partly obscured regions. Matching left/right shoes are one `pair` unit with one crop; every pair receives a unique pair identifier, and if the provider emits separate sides, application code combines only sides carrying that same identifier. The parser never merges footwear merely for looking similar, so adjacent different pairs remain independent. Application code also rejects unknown, tiny, and near-duplicate detections before Sharp creates a bounded private crop for each candidate.

The synchronous mobile scan does not make a second provider call for every crop. Whole-look recognition has an 18-second deadline—shorter than general multi-view vision—so crop preparation and private S3 writes retain part of Amplify's request budget. It uses the measured local silhouette pass, then the conservative edge-connected flood fill, and finally the ordinary bounded crop. Every transparent result must retain a meaningful visible and mostly solid subject; a faint, over-erased result is rejected and falls through to the next safer crop. This keeps a 16-piece rack from creating 16 additional Bedrock waits after recognition has already succeeded. If the Pro model selection is rejected immediately because of model configuration or permission, Racked tries the configured Nova Lite model once. A timeout or service failure never causes a second long wait; it proceeds to the honest manual-review fallback. The US Stable Image helper remains implemented for a future asynchronous cleanup flow, but it is not a gate—or an active step—in synchronous wardrobe intake. The Consumer sees the result, chooses which candidates to keep, and can correct every label before saving.

This prompt explicitly prohibits person, body, demographic, preference, and ownership inference. A visible logo may prefill an editable brand label, but the detection path has no authority to query or grant registry verification. Provider failure or an empty result returns an honest retry message; it does not fabricate garments. The pair-aware contract and parser behavior are regression-tested, but overall recognition recall remains unmeasured until the documented evaluation is run; completely hidden pieces may still require a clearer second photo.

### Footwear knowledge and grammatical autofill

`lib/shoe-knowledge.ts` is a small, repository-owned reference of 23 generic footwear subtypes, aliases, singular/plural labels, and visible construction cues. Both the whole-look detector and single/multi-view classifier receive those same cues, and `lib/garment-taxonomy.ts` maps provider aliases back into the canonical subtype. This is retrieval-style prompt grounding plus deterministic output normalization—not model training, fine-tuning, a product catalog, or recognition-accuracy evidence. It contains no brands, SKUs, consumer images, or private data.

Only provider-authored names pass through the grammar helper. It removes sentence-style articles, uses canonical capitalization, and respects the detected wearable unit: a pair can be named “White Sneakers,” while one unmatched side can be named “White Sneaker.” The confirmation field remains editable, and a name the Consumer types is saved as typed. A narrower shoe estimate is permitted only when visible construction supports it; otherwise the model is instructed to use a broader shoe class or `other-shoes`. No shoe subtype, name, cue, or confidence value can create verified brand/product identity.

### Independent benchmark

Racked has selected the corrected CC BY 4.0 [Clothing Dataset for Second-Hand Fashion, version 3](https://zenodo.org/records/13788681) as an external evaluation corpus. Its 31,638 main garments plus a separately identified 100-garment annotator-agreement set include front, back, and brand-label views where available, matching Racked's evidence flow unusually well. The source images remain outside Git and AWS production. The model has **not** been trained or fine-tuned on this dataset; it is reserved for reproducible measurement of category, subtype, label-text, provider-failure, and verification-boundary behavior. No recognition-accuracy result is claimed until the measured report described in [evaluation.md](evaluation.md) is complete.

## Image preparation

The AI supplies garment understanding. Before the AWS request, the browser creates an approximately 1.2 MB, maximum-1800-pixel JPEG analysis copy of each selected photo; the original stays on the device. A deterministic server image pipeline then rotates EXIF orientation, preserves the unmodified evidence photo, and stores one bounded crop per detected piece. This prevents combined full-resolution phone photos from triggering an Amplify 413/non-JSON response while keeping label detail suitable for analysis.

## Adaptive photo-plan classification (retired from live intake)

Until intake became one photo, an optional Bedrock step classified the first photo and `lib/photo-plan.ts` requested category-specific evidence, such as a shoe's sole. Unified intake made that step unreachable, and its routes were removed in Phase 37. The planning logic and its regression tests remain, including the proof that brand verification requires the same registry evidence regardless of any plan, and `PLANNED_CATEGORIES` still supplies the intake category list. Live category and subtype now come from whole-look detection, confirmed or corrected by the person.

## Recreate This Look decision engine

Recreate This Look deliberately uses a deterministic, inspectable decision layer over the AI-extracted garment attributes. Exact ownership requires the same registry product ID. Otherwise, only same-category owned pieces are compared using declared weights: category 30%, subtype 25%, color 20%, pattern 10%, style 10%, and material 5%. The API returns every component and evidence string, prevents one owned item from filling multiple slots, and labels the result exact, strong, acceptable, weak, or missing. This avoids an opaque “AI says 87%” claim while still turning structured visual intelligence into useful wardrobe decisions.

## Consumer Hanger Agent

Allowed tools:

- signed-in account wardrobe;
- that account’s wear totals;
- that account’s saved outfits;
- bounded clothing/style signals from Community Looks that account intentionally saved as inspiration;
- submitted occasion and weather context.

It is a multi-turn conversation, not a one-click summary. The browser sends the current message, while the server loads the account-stored conversation and fits the newest complete turns into a bounded context window. It reloads authoritative wardrobe context on every message. It may select only owned items, returns its evidence and tool list, and exposes server-selected actions to save an outfit or record its pieces as worn only when that action fits the current turn. The save endpoint independently checks that every submitted item belongs to the signed-in wardrobe.

### Turn planning and active outfit

`lib/hanger-turn.ts` classifies a Consumer turn as `create`, `revise`, `explain`, `save-confirm`, `wear-confirm`, `advice`, or `clarify` before asking the model to answer. The latest proposed outfit is stored separately from cumulative suggestion history as bounded owned-item IDs and controlled occasion, weather, and style intent. “Keep the shoes, change the top” resolves only against that latest outfit and current account-owned wardrobe, preserves unaffected pieces, and re-ranks the changed slot. “Why those?”, “save that,” and wear-confirmation requests use the same active selection rather than making a fresh outfit. Advice-only turns do not rank pieces or offer outfit actions, and a reply on such a turn is rejected if it describes a selected outfit, “these exact pieces”, photographs, or a Save action, none of which exist when nothing was ranked. Every turn is reviewed against the canonical selection; advice is no longer exempt. A request that Hanger answered with a question is held open as bounded text plus an outfit count, so a short reply such as “cold” completes the original request instead of being read as a new one; answering it clears it, and instructions about the current outfit are never consumed as answers. A specifically worded request for a piece that cannot be clearly found in the saved wardrobe, or a request to add a fifth piece to a full look, enters `clarify`: Hanger asks for the exact piece or which existing one to replace instead of creating a substitute outfit. That turn offers no Save/Record action and does not replace the active outfit. If an active piece has been deleted, the server does not silently save only its survivors.

The current message can require or exclude an unambiguous owned piece; standing preferences remain exclusions unless a direct current inclusion overrides them for that turn. The model sees garment subtype, pattern, material, season, and the canonical selection as context, but cannot select or invent wardrobe IDs. Each response's names, private images, action IDs, and subsequent saved outfit derive from that same server selection.

### Outfit selection

Which garments are proposed is decided by `lib/outfit-ranking.ts` on the server, never by the model — the model writes the explanation around a set it is given, and cannot introduce, rename, or invent an item. Selection reads occasion, weather, and style signals out of the request itself, then scores every owned garment on five weighted signals:

| Signal | Outfit request | Rotation request |
| --- | ---: | ---: |
| Occasion fit (style tags vs. the stated occasion) | 30% | 10% |
| Weather and season | 20% | 10% |
| Requested style | 15% | 10% |
| Underuse (wear count) | 20% | 45% |
| Time since last worn | 15% | 25% |

The highest-scoring eligible garment fills each category slot before any remainder is filled. A dress can be the foundation instead of a top-and-bottom pair; shoes, outerwear, bags, accessories, and jewelry fill distinct supplemental slots where available. A directly requested second item in one category is retained, and an explicit one-to-four-piece count is bounded rather than ignored. If the current request contains no style direction, Hanger may use the most repeated controlled style tags from up to 50 public Looks the Consumer intentionally saved. This is a deterministic fallback: a current request such as “casual” or “formal” always replaces saved inspiration for that turn. Every returned piece carries its five score components with evidence, and those reasons are surfaced in the reply's evidence list, so a judge can see whether saved inspiration influenced it.

Racked does not scrape Pinterest or another social network. A future Pinterest connection would require a separately registered application, explicit OAuth consent, minimum read scopes, protected token storage/refresh, and the appropriate Pinterest access tier. The current first-party path provides useful, testable inspiration without adding those credentials or making Racked dependent on an external platform.

Two properties matter for honesty. Selection is **deterministic** — weighted scores with an id tie-break, never sampling — so the same request against the same wardrobe and conversation state is reproducible and testable. A new or different creation request sets aside prior owner-validated suggestions before necessary reuse; a targeted revision instead preserves active pieces the person did not ask to change. Non-outfit advice does not rotate implicitly. If a wardrobe category is too small to avoid repeating, Hanger can reuse an eligible owned piece rather than inventing one. Across a multi-outfit set each piece receives a share of the set determined by how many of that category the wardrobe holds, so a plentiful category never repeats while a scarce one is spread evenly; two outfits in a set are never the same arrangement, and any piece that had to appear more than once is reported in the response evidence. Conversational sampling runs at temperature 0.6 with top-p 0.9 so two similar requests do not return identical prose; selection itself remains deterministic and is never sampled.

## Brand Hanger Agent

Allowed tools:

- products owned by the signed-in Brand account;
- verified product-to-wardrobe links;
- per-owner aggregate consent;
- confirmed wear totals after the `k ≥ 25` gate.
- timestamped aggregate wear events and server-calculated eight-week frequency bins after the same gate.

It cannot retrieve names, emails, consumer images, or raw wardrobes.

It is also multi-turn. For each brand message, the server rechecks product ownership, consumer consent, and the cohort threshold before constructing model context. Released context may contain only product name/SKU/category plus aggregate usage metrics and trend bins. A suppressed cohort returns deterministic threshold-safe guidance before any model call; its request does not pass prior chat history to the generator, so released metrics from a previously selected product cannot be replayed through that path. This lets brands discuss retention, merchandising, education, and campaign strategy without turning Hanger into an individual-customer surveillance tool.

## Conversation controls

- Free-form message length: 1,000 characters.
- Prior history sent to the provider: a bounded window of complete turns; Consumer turns come from the account record, while Brand history is bounded page-session context.
- Provider output displayed: at most 2,500 characters.
- Conversation state: Consumer turns, controlled preferences, cumulative suggestions, and active outfit persist in an account-owned record and can be cleared by that person. Brand chat history remains page-session context. Authoritative account or wardrobe data is never accepted from the browser.
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

## Fictional demo product imagery

OpenAI image generation was used to create three clearly fictional, unbranded catalog sheets: apparel (ivory T-shirt, navy trousers, orange bomber), footwear (off-white sneaker, charcoal runner, oxblood loafer), and jewelry (gold orbit ring, silver chain, gold cuff). Each prompt required isolated ecommerce product photography with no people, logos, labels, text, watermarks, or real-brand imitation. The sheets were deterministically split into nine WebP assets under `public/demo-products/`. These images are presentation fixtures for `DEMO` records only; they are not recognition training data, evaluation data, customer uploads, or evidence of real inventory.
## Hanger alternative-outfit grounding (2026-08-21)

Hanger no longer relies only on whether the model happened to repeat exact garment names in its prose. The account-stored conversation retains accumulated recommendation IDs; the server intersects them with the signed-in account's current wardrobe and bounds retained memory to 100 owned IDs. An explicit “different” request also considers the latest account-owned saved outfit. New-look ranking uses available fresh categories before reusing pieces needed to complete the look. When an outfit action is available, the visible response and action refer to the same deterministic piece list, so generated conversation text cannot silently diverge from what will be persisted.

The follow-up intent covers ordinary revision language such as “adjust,” “redo,” “remake,” “try again,” and “use my other pieces.” Repeating an outfit-creation prompt within the same conversation also rotates accumulated owned suggestions; repeating a general advice question does not. A behavioral regression proves four four-piece turns use 16 unseen garments before cycling an older piece. Hanger also returns a signed-in-consumer-only visual projection of the exact selected garment IDs, names, categories, and one-hour private image links. The chat renders those images before Save, so the consumer can verify that a revision changed the actual wardrobe pieces rather than trusting prose. The model still cannot choose, replace, or invent any ID.

The ranked result is now materialized once as a canonical ordered selection. That same selection supplies the visible names and photos plus both Save and Wear action IDs; the saved title includes every selected name when it fits, and private board composition preserves that order. Model prose is post-checked against the signed-in wardrobe and rejected if it names an owned garment outside the canonical selection. A client-side consistency check also refuses to persist an action whose IDs differ from the cards displayed beside that action.

## Hanger required-piece grounding (2026-08-22)

An explicit request such as “use my Grey Hoodie,” “keep my Blue Oxford,” or “use my red sweatshirt” is resolved deterministically against the signed-in wardrobe before ranking. Exact saved names, unambiguous meaningful name tokens, SKU/subtype aliases, and unique color-plus-subtype descriptions may resolve; ambiguous or unknown descriptions do not. Negated phrases such as “do not use” and “without” are excluded. Resolved pieces become hard constraints—even if recently worn or already suggested—while weighted scoring fills the remaining slots. Multiple required pieces in one category remain allowed. Bedrock receives a `directlyRequested` marker, and the deterministic fallback names the instruction rather than falsely attributing the choice to low wear.
