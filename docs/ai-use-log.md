# AI use and model boundaries

## Where AI adds value

### 1. Garment attribute suggestion

Working input: one validated front image for quick classification, with optional back and label evidence for product verification. When `AI_PROVIDER=anthropic` and `AI_API_KEY` are configured server-side, `analyzeGarmentImages` sends the actual request-memory bytes to the pinned `claude-haiku-4-5-20251001` Messages API model. A JSON Schema constrains category, color, style, construction, material, confidence, OCR text, and per-view evidence. The route never writes raw bytes to disk.

The model's label reading is evidence, not authority. Racked passes readable text into its own Brand registry matcher; only a matching enrolled SKU plus brand alias, GTIN, label hash, or catalog image set can produce `label.matched: true`. A front-only result never claims a brand or SKU. The UI blocks saving until the Consumer confirms or corrects the fields.

Suggested system instruction:

> Describe only visible garment attributes using the allowed schema. Return `unknown` when evidence is insufficient. Do not infer identity, gender, age, size, body type, income, occasion, or personal preference.

### 2. Hybrid product matching

The core decision is deterministic rather than delegated to a language model. [`../lib/matching.ts`](../lib/matching.ts) stores seven weighted components:

| Signal | Weight | Why it matters |
| --- | ---: | --- |
| Outfit pairing | 22% | Number of existing items in compatible categories |
| Color compatibility | 16% | Confirmed color coordination |
| Style compatibility | 14% | Shared confirmed style tags |
| Wear relevance | 14% | Whether compatible items are actually used |
| Season fit | 10% | Product season availability |
| Wardrobe gap | 16% | Missing or thin category bonus |
| Low duplicate risk | 8% | Penalty for category saturation |

Weights sum to 100%. The score is clamped to 0–100 and every component is shown to the Brand user.

### 3. Explanation and campaign language

The deterministic path selects language templates from score thresholds. A future text model may improve phrasing, but it may receive only product attributes, aggregate score components, and approved reason facts. It must not receive a name, email, image, or raw wardrobe and must not invent sales lift, likelihood to buy, demographic traits, or personal preferences.

### 4. Three bounded agents

The Consumer Stylist Agent can call wardrobe, wear-history, saved-outfit, and demo-weather tools. It may recommend only pieces in the user’s wardrobe. The Brand Wear Intelligence Agent and the Brand Retention Agent can call catalog, aggregate-wear, and privacy-threshold tools. Neither can access a user identity or raw wardrobe. All three return their tool trace and limitations in the interface; their checked-in path is deterministic and tested.

The privacy-threshold tool is a real gate, not a label: `runBrandWearAgent` (in [`../lib/agents.ts`](../lib/agents.ts)) computes the product's opted-in, relevance-matched cohort via [`computeProductCohort`](../lib/segments.ts) and checks it against `MINIMUM_COHORT_SIZE` (25, in [`../lib/privacy.ts`](../lib/privacy.ts)) *before* composing a reply. Above the threshold, it returns the 60-day actual-wear rate and cohort size. Below it, it returns a suppression notice — cohort size, the minimum required, and why — with no wear rate, no segment drill-down action, and `confidence: "low"`. The Brand dashboard's own metric calculation (`calculateBrandMetrics` in [`../lib/metrics.ts`](../lib/metrics.ts), called server-side from `POST /api/brand/metrics`) applies the identical gate, so a below-threshold product also shows no opportunity score, gap prevalence, or duplicate-risk figure in the UI — only the per-item inspectable match score, which is not a population aggregate and so isn't subject to the cohort floor. All three aggregate-releasing routes share an anti-enumeration query budget and read a live, revocable consumer consent flag — see [`docs/privacy-and-ethics.md`](./privacy-and-ethics.md#aggregate-release-safeguards) for the full mechanics.

`runBrandRetentionAgent` (also in [`../lib/agents.ts`](../lib/agents.ts), backed by [`../lib/retention.ts`](../lib/retention.ts)) reports an engagement *trend* rather than a point-in-time rate — comparing the same eligible cohort's wear frequency in the last 30 days against the 30 days before that, and classifying the result as suppressed / at-risk / softening / stable / rising. It's the same pattern as a gym flagging declining member check-ins before a cancellation, applied to product engagement instead of membership churn. It shares the identical `k ≥ 25` gate and enumeration budget as the wear-rate agent — bundled into the same `POST /api/agents/brand` response so checking both costs one query against the budget, not two.

## Confidence and fallback

- 10+ confirmed items: high data sufficiency.
- 5–9 items: medium.
- Fewer than 5: low; recommendations should be treated as exploratory.
- Missing configuration, provider errors, the 12-second timeout, refusals, truncated output, or malformed output activate the visible deterministic fallback. `tests/three-view-upload.test.ts` exercises both a real-provider-shaped success response and an HTTP failure without making a paid network call.

## Development transparency

Codex was used as an AI coding collaborator for repository inspection, product planning, TypeScript implementation, UI styling, tests, documentation, browser smoke testing, and dataset/AWS research. Human product constraints in the project prompt determined the scope, privacy boundaries, rubric mapping, and definition of done. All generated code is version-controlled and subject to test/build review.

## Unsupported claims

Racked has not been validated on real customers. It does not claim sales lift, conversion improvement, model accuracy, reduced returns, sustainability impact, or predictive validity. Those require a consented pilot, outcome definition, baseline, and statistical evaluation.
