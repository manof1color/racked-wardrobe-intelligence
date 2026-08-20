# Small/medium brand UX review

Reviewed 2026-08-20 against the current Brand enrollment, catalog, dashboard, Brand Looks, Community metrics, and Hanger implementation. Perspective: one owner/operator managing 2–20 SKUs without a data-science team.

## What already works

- Enrollment is a simple single-product form; a spreadsheet, API, ecommerce integration, or catalog platform is not required.
- The first-time state sends the operator directly to one product enrollment and explains the three authorized photos needed.
- A selected product keeps raw Consumer records out of the interface. Released wear metrics, public-post metrics, and Hanger use separate privacy-filtered sources.
- Suppressed data is shown honestly rather than replaced with invented metrics.

## Cheap fixes completed

- Replaced unexplained `k ≥ 25` dashboard shorthand with **25+ owners** and a nearby plain-language explanation of what is hidden and why.
- Labeled enrollment as “one product at a time” and explicitly stated that no spreadsheet or catalog system is required.

## Known limitations

- There is no edit/archive interface after enrollment. An owner must currently enroll carefully or ask an administrator to correct a record.
- There is no optional CSV/bulk import for a growing catalog. This is acceptable for 2–20 SKUs but becomes repetitive beyond that range.
- The dashboard does not yet provide an onboarding checklist that persists across sessions.
- Private wear metrics correctly remain unavailable below 25 eligible opted-in owners. Small brands still receive product enrollment, Brand Looks, public Community appearances, and public interaction counts, but the interface could group those early-stage tools more prominently.
- Brand Hanger is product-specific; there is not yet a safe multi-product portfolio comparison.

These are product-polish limitations, not reasons to weaken the 25-owner privacy threshold or expose individual Consumer activity.
