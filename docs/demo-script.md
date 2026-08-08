# Judge demo script (7 minutes)

## 0:00–0:45 — Frame the problem

Open the landing page. Say: “Purchase history tells a brand what sold. It does not tell the brand what a customer actually uses, what pairs with their closet, or whether the next recommendation is a duplicate. Racked closes that gap with consent and explainable AI.”

Point out the four product principles below the hero: explainable matching, consent, emerging-brand focus, and fallback reliability.

## 0:45–2:45 — Consumer workflow

1. Select **Open demo → Consumer**.
2. Point out the fictional identity and check the explicit opt-in box.
3. Enter the workspace and identify the deterministic AI readout, data-sufficiency label, most/least-worn pieces, and outfit count.
4. Click **+ Wear** on the white tee. Show the count and last-worn value update.
5. Open the garment scanner and show that **Quick scan** needs only the front photo while keeping the brand unverified. Then switch to **Verified match**, load the full evidence set, and show the Northstar SKU and brand-page link.
6. Ask the **Consumer Stylist Agent** for an outfit. Show its wardrobe/wear/outfit/weather tool list, then share the result to Community.
7. Open **Community** and show the new outfit plus product-to-brand discovery links.

## 2:45–5:30 — Brand workflow

1. Choose **Switch demo → Brand → Enter brand demo**.
2. Point out the persistent privacy banner: anonymous segments only, minimum cohort `k ≥ 25`, no photos or raw wardrobes.
3. Select **Cloud Merino Vest**. The prior result clears—this is the deliberate recalculation state.
4. Click **Run product match**.
5. Read the four calculated metrics: opportunity, gap prevalence, duplicate risk, and eligible segment size. State that every number is synthetic and labeled.
6. Show the seven weighted score components and three reasons.
7. Point out the deterministic fallback label. Explain that a provider outage cannot break the judge demo.
8. Read the campaign message and the instruction not to imply a sales outcome.
9. Run the **Brand Wear Intelligence Agent**. Show that it uses aggregate wear and privacy-threshold tools, never a person-level wardrobe. Point out the **Engagement Trend** panel that appears alongside it — this is a second, independent agent (Brand Retention Agent) reporting a 30-day-vs-prior-30-day trend, not just a point-in-time rate.
10. Switch to **Moss Court Sneaker** (`productId: "p3"`) and re-run. Its retention trend genuinely comes out "at-risk" (-30% wear frequency) — an emergent result of the underlying data, not a staged number — and the agent surfaces a "Launch a re-engagement nudge" action instead of the default "maintain cadence" one. This is the clearest way to show a judge the app does more than report a snapshot: it flags declining engagement the same way a gym would flag a member at risk of cancelling, before the number gets bad enough to matter.
11. Switch the catalog selection to **Merlot Day Tote** (SKU `NA-AC-6044`) and run the match again. Its computed cohort — opted-in, relevance-matched profiles from the synthetic population — comes out to just 1, well below the `k ≥ 25` floor, so the metric row and segment card are replaced by a suppression notice, and running either the Brand Wear Intelligence Agent or the Brand Retention Agent on it returns no figure at all. This is the strongest live proof that the privacy threshold is enforced in code rather than only stated in the banner: the judge is seeing the gate actually trip on a real computed value, not reading a claim about it or a hand-picked demo number.
12. Optionally, in the Consumer app, toggle **Sharing wear data with brands** off and back on, then switch the Brand dashboard to **Sienna Soft Overshirt** (`NA-OW-1042`) and re-run the match each time. Its `ELIGIBLE SEGMENT` count moves by exactly one as the toggle flips — live proof that a consumer's own granular consent choice changes what a brand sees, not just a switch that does nothing underneath.

## 5:30–6:00 — Partner views

Open the partner navigation and briefly visit `/partners/vintage`, `/partners/clothing`, `/partners/shoes`, and `/partners/jewelry`. Each URL has vertical-specific operating metrics, inventory, and an agent recommendation.

## 5:30–6:30 — Technical and ethical proof

Open the repository’s `docs/competition-checklist.md`. Show the rubric mapping, automated tests, and AWS deployment plan. Open the Privacy page and highlight consent, protected-attribute exclusion, thresholding, retention, and deletion.

## 6:30–7:00 — Close

Say: “Racked gives consumers a reason to trust the recommendation and gives smaller brands a useful decision without giving them a person’s closet. The next milestone is an opt-in pilot that tests whether match opportunity correlates with engagement; until then, we make no sales-lift claim.”

## Failure recovery

- External model fails: keep the **DETERMINISTIC FALLBACK** label visible and continue.
- Seed changes during demo: reload or sign out; the fictional baseline is restored.
- AWS demo unavailable: run `pnpm dev` locally and explain that credentials were intentionally not committed.
