# Privacy, ethics, and accessibility

## Data principles

- **Opt in before analysis.** Consumer access requires explicit consent in the demo.
- **Confirm inference.** Suggested garment attributes are not saved until corrected or confirmed.
- **Collect less.** Matching needs garment/product attributes and use counts—not demographic profiles.
- **Separate trust zones.** Brand users cannot access names, emails, images, or raw wardrobes.
- **Release aggregates cautiously.** Segment output is suppressed below 25 opted-in, relevance-matched members. See "Aggregate-release safeguards" below for how this is enforced in code, not just documented here.
- **Explain decisions.** Score components, weights, confidence, and fallback state are visible.

## Aggregate-release safeguards

Four separate, code-level controls govern anything brand-facing that is an aggregate (a wear rate, an opportunity score, a segment size) rather than a per-item inspectable match:

1. **k-anonymity gate, computed rather than declared.** [`lib/privacy.ts`](../lib/privacy.ts) exports `canExposeAggregate` (the `k ≥ 25` check). Cohort size itself is *computed*, not a hand-typed number per product: [`lib/population.ts`](../lib/population.ts) generates a deterministic 160-profile synthetic population (seeded PRNG, not `Math.random()` — reproducible on every run), and [`lib/segments.ts`](../lib/segments.ts)'s `computeProductCohort` counts only profiles that are *both* opted in *and* score above a relevance bar for that specific product. Both [`lib/agents.ts`](../lib/agents.ts)'s Brand Wear Intelligence Agent and [`lib/metrics.ts`](../lib/metrics.ts)'s dashboard calculation call this before composing any figure. One seeded catalog product genuinely computes below the floor — `NA-AC-6044` (Merlot Day Tote), whose cohort lands at size 1 because so few synthetic profiles own a "dress" item for the accessory to pair with. This is an emergent result of the population and matching logic, not a hand-picked constant, and it's exercised by `tests/privacy.test.ts`.
2. **Computed server-side, not shipped to the browser.** The Brand dashboard's four segment metrics used to be computed in the client component directly from imported wardrobe data — meaning the underlying population was sitting in the browser's JS bundle regardless of what the UI chose to render. `POST /api/brand/metrics` moved that computation onto the server; the client only ever receives the (possibly already-suppressed) final numbers. The per-item "inspectable score" (single seeded demo wardrobe, explicitly labeled synthetic) still computes client-side — that's a different, much smaller, already-disclosed piece of demo scaffolding, not a population.
3. **Anti-enumeration budget.** A single k-anonymity check per query doesn't stop a brand from querying many SKUs in sequence and reconstructing a picture of a near-threshold group from the pattern of releases and suppressions. [`exceedsEnumerationBudget`](../lib/privacy.ts) caps how many *distinct* products one subject can pull an aggregate for within a 5-minute rolling window (6, currently), shared across both `/api/agents/brand` and `/api/brand/metrics` so alternating between them doesn't bypass it. Re-querying an already-seen product never counts against the budget. Every aggregate query (allowed or blocked) is recorded in an in-memory audit log ([`getAggregateQueryAudit`](../lib/server/demo-store.ts)) for later review — this is the "Security logs" row in the retention table below, made concrete.
4. **Granular, revocable consumer consent.** The one-time consent checkbox at login only governs entering the Consumer workspace at all. A separate, ongoing preference — "include my (fictional) wear data in brand-facing cohorts" — is toggled from the Consumer dashboard and calls `PATCH /api/consumer/consent`. When off, the demo consumer's own wardrobe is excluded from every product's computed cohort on the next query; when on, it's included, subject to the same relevance-matching rule as any other profile. This is a real, live effect, not a cosmetic switch: toggling it measurably moves a product's `segmentSize` by exactly one (verified live — `NA-OW-1042`'s cohort moves 130 → 129 → 130 as the toggle flips), though it doesn't itself flip suppression status for any current catalog product, since none sit within 1 of the k ≥ 25 floor.

## Bias controls

The score excludes age, gender, ethnicity, disability, body shape, income, address, and inferred socioeconomic proxies. Style and color inputs are confirmed garment attributes, not identity labels. A future evaluation should compare missingness, confirmation corrections, recommendation exposure, and opt-out rates across voluntarily reported groups without adding those groups to the ranking model.

## Retention plan

| Data | Demo | Production target |
| --- | --- | --- |
| Uploaded image | Not retained by Racked; when optional vision is enabled, bytes are sent directly from request memory to the configured provider | Private S3 only if asynchronous processing is required; delete after extraction or within 24 hours; document provider retention separately |
| Confirmed garment attributes | Seed/session only | Until user deletion or account closure |
| Wear events/outfits | Seed/session only | Until user deletion or documented inactivity limit |
| Match results | Recomputed | Short audit window, then aggregate/delete |
| Security logs | In-memory aggregate-query audit log (`lib/server/demo-store.ts`); resets on process restart | Metadata only; never raw images or secrets; durable store with a retention window |

## Delete-my-data workflow

1. Authenticated Consumer requests deletion and reauthenticates.
2. Account is disabled to prevent new writes.
3. Owned wardrobe items, wear events, outfits, consent records, match results, and S3 objects are deleted.
4. Segment aggregates are recomputed; small cohorts are suppressed.
5. A non-sensitive audit record stores request/completion timestamps.
6. Cognito identity is deleted after application records succeed.

## Accessibility evidence

- Semantic headings, navigation, articles, forms, dialog, status, and alert roles.
- Controls have visible labels and unique accessible names.
- Keyboard focus uses a high-contrast 3 px outline.
- Color is supplemented with words, values, and shape—not used as the only status signal.
- `prefers-reduced-motion` disables transitions and smooth scrolling.
- Layouts adapt from four columns to one without horizontal content loss.

Formal WCAG 2.2 AA auditing remains a pre-production task; the current implementation is aligned but does not claim certification.
