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

## Fixed since this review

- **Edit and retire.** A product's name, look, price, availability, destinations, and aliases are
  editable; identity (brand, style code, barcode, photos) is immutable, and retiring keeps existing
  owners and their wear history while removing the product from matching, search, and the public page.
- **Navigation.** The workspace is three views — Overview, Catalog, Brand Looks — instead of one
  scroll that put the enrollment form and the Look builder above the daily job. The mobile tabs now
  switch views rather than jumping to an anchor.
- **The catalog reads as products.** Cards with the product photo, style code, and a chip per state,
  with search and a retired filter.
- **Visual hierarchy on a product.** One hero number (confirmed wears) with the supporting metrics
  demoted, captions under both charts, and a skeleton while the cohort is calculated so the layout
  does not jump.
- **The threshold banner moved** from the top of every visit to the suppressed state it explains.
- **The enumeration budget is stated** — what is left, and why the limit exists — instead of
  surfacing only as a refusal.
- **An onboarding checklist** of four steps, derived from the account's own records so it persists
  across sessions and devices, hideable, and gone once finished.
- **Hanger reads the situation.** A brand with products but none open is told to open one, rather
  than to enrol a product it already has.
- **No budget spent on a product enrolled moments ago.** It cannot have owners, so its aggregates are
  not requested; the product says so instead.

## Known limitations

- There is no optional CSV/bulk import for a growing catalog. This is acceptable for 2–20 SKUs but becomes repetitive beyond that range.
- A catalog-wide comparison of private wear **will not** be built. Release status is derived from cohort size, so comparing products side by side is the differencing attack the enumeration budget prevents. The overview answers catalog questions instead.
- Private wear metrics correctly remain unavailable below 25 eligible opted-in owners. Small brands still receive product enrollment, Brand Looks, public Community appearances, and public interaction counts, but the interface could group those early-stage tools more prominently.
- Brand Hanger is product-specific; there is not yet a safe multi-product portfolio comparison.

These are product-polish limitations, not reasons to weaken the 25-owner privacy threshold or expose individual Consumer activity.
