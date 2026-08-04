# AI use and model boundaries

## Where AI adds value

### 1. Garment attribute suggestion

Intended production input: one validated garment image. Intended output: category, primary color, style tags, season, and per-field confidence. The UI blocks saving until the Consumer confirms or corrects the fields. The checked-in demo simulates this provider result so it is credential-free and reliable.

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

## Confidence and fallback

- 10+ confirmed items: high data sufficiency.
- 5–9 items: medium.
- Fewer than 5: low; recommendations should be treated as exploratory.
- Provider errors, timeouts, missing keys, or malformed output activate the visible deterministic fallback.

## Development transparency

Codex was used as an AI coding collaborator for repository inspection, product planning, TypeScript implementation, UI styling, tests, documentation, browser smoke testing, and dataset/AWS research. Human product constraints in the project prompt determined the scope, privacy boundaries, rubric mapping, and definition of done. All generated code is version-controlled and subject to test/build review.

## Unsupported claims

Racked has not been validated on real customers. It does not claim sales lift, conversion improvement, model accuracy, reduced returns, sustainability impact, or predictive validity. Those require a consented pilot, outcome definition, baseline, and statistical evaluation.
