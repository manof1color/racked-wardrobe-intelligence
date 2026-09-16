# Streamline plan — competition build to shippable app

Written 2026-09-16 against the merged `main`. Every count below was measured in this
repository, not estimated.

## 1. What exists today

| Surface | Size |
| --- | --- |
| Pages | 14 |
| API routes | 26 |
| Components | 23 files, 1,909 lines |
| Tests | 350 passing |
| Runtime dependencies | 10 (AWS SDKs, Next, React, sharp) |

The dependency list is already lean — there is nothing to remove there. The weight is in
surfaces and half-connected features, not libraries.

**Consumer:** Today · Looks · Closet · Outfits · Community · Add, plus the Hanger stylist.
**Brand:** dashboard, product enrollment, Brand Looks, community intelligence.
**Public and demo:** landing, pricing, partner verticals, privacy, brand pages, two demo
storefronts with the $0 purchase simulation.

## 2. Cut list — code nothing reaches

> **Corrected 2026-09-16 after re-verification.** The first version of this list was checked only
> against `app/`, `components/`, and `lib/`. Checking `scripts/` and `tests/` as well showed three
> items are still in use, so they stay. The cut shipped in PROGRESS Phase 37.

| Item | Evidence | Action |
| --- | --- | --- |
| `components/three-view-uploader.tsx` | Only a *type* import survived, in `garment-intake.tsx` | Removed; `GarmentOverrides` moved to `lib/types.ts` |
| `app/api/garments/classify/` and `/analyze/` | That component was their only caller | Removed |
| `garmentAnalyze`, `garmentClassify` rate limits | Used only by those routes | Removed |
| CSS for the three-photo flow | Classes only that component used | Removed |
| `lib/photo-plan.ts` | `garment-intake.tsx` uses `PLANNED_CATEGORIES` | **Kept** |
| `analyzeGarmentImages` and the three-view analyzer | The evaluation script and the brand-identity tests use them | **Kept** |
| `lib/agents.ts`, `lib/brand-wear-insight.ts` | Not used by the product, but they carry the tests proving brand aggregates stay suppressed below 25 owners | **Kept** until those guarantees are tested on the live path |

**No consumer feature was lost.** The three-photo path stopped being reachable when intake was
unified; brand label checking runs through `/api/garments/verify`, which stays.

## 3. Simplify what remains

1. **Six tabs to four, plus Add.** `Looks` (build an outfit) and `Outfits` (saved outfits)
   are one job. Merge into **Outfits**, with "Build a look" as the primary button inside it.
   Final bar: Today · Closet · Outfits · Community · **+**. The six-column bar currently
   renders labels at 0.44rem, which is below comfortable reading size on a phone.
2. **One decision per intake card.** Name, Type, and optional brand linking. Everything else
   stays collapsed.
3. **Demo commerce out of the app.** The storefronts and the $0 simulation are judge
   material. Keep them reachable on the web for the competition, and keep them out of the
   mobile app entirely — a shipped app containing a fake shop invites an App Store rejection.
4. **Brand workspace stays web-only.** The mobile app is the consumer product. Brands are a
   desktop audience and shipping both roles doubles the review surface for no user gain.

## 4. Gaps that block a store submission

| Gap | Why it blocks | Where |
| --- | --- | --- |
| No way to delete a garment | Apple and Google both require deleting user content; people cannot remove a bad scan today | `/api/consumer/wardrobe` has GET and POST only |
| No account deletion | Apple Guideline 5.1.1(v); Google Play data deletion policy | `/api/account` has GET and PATCH only; Settings offers name, email, password |
| No terms of service | Both stores expect terms alongside a privacy policy | No `/terms` page exists |
| No data export | Not required, but expected of a privacy-first product | — |
| Small-jewellery recognition | A bracelet spanning both wrists fell back to the whole photo | Open recognition case |

**Status 2026-09-16:** garment deletion, consumer account deletion, and a pilot terms page are done (PROGRESS Phase 36). Brand account deletion and data export are in the [ChatGPT work order](work-orders/chatgpt-launch-follow-ups.md).

Outfit deletion and per-piece removal already exist, so the missing wardrobe delete is an
inconsistency as much as a policy gap.

## 5. Two-week sequence

**Week 1 — blockers and cuts.** Garment delete (API + closet control + confirm step);
account deletion (API, Settings entry, S3 and DynamoDB cleanup, session invalidation); terms
page; the cut list above; tab merge.

**Week 2 — polish and prove.** Physical iPhone pass on the scan, closet, and tab bar; rescan
the pieces saved as broken cut-outs; update README, PROGRESS, and the checklist; cut the
first closed-test build.

Nothing in this plan changes recognition, privacy boundaries, or the `k >= 25` brand gate.
