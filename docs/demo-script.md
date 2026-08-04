# Judge demo script (7 minutes)

## 0:00–0:45 — Frame the problem

Open the landing page. Say: “Purchase history tells a brand what sold. It does not tell the brand what a customer actually uses, what pairs with their closet, or whether the next recommendation is a duplicate. Racked closes that gap with consent and explainable AI.”

Point out the four product principles below the hero: explainable matching, consent, emerging-brand focus, and fallback reliability.

## 0:45–2:45 — Consumer workflow

1. Select **Open demo → Consumer**.
2. Point out the fictional identity and check the explicit opt-in box.
3. Enter the workspace and identify the deterministic AI readout, data-sufficiency label, most/least-worn pieces, and outfit count.
4. Click **+ Wear** on the white tee. Show the count and last-worn value update.
5. Click **Add a garment → Use simulated extraction instead**. Explain that a real multimodal provider can suggest attributes, but saving is blocked until the user confirms them.
6. Confirm the new garment. Point out that the image is not retained by this demo.
7. Scroll to the recommendations and read one grounded reason. Emphasize that the score changed from confirmed wardrobe facts, not inferred identity.

## 2:45–5:30 — Brand workflow

1. Choose **Switch demo → Brand → Enter brand demo**.
2. Point out the persistent privacy banner: anonymous segments only, minimum cohort `k ≥ 25`, no photos or raw wardrobes.
3. Select **Cloud Merino Vest**. The prior result clears—this is the deliberate recalculation state.
4. Click **Run product match**.
5. Read the four calculated metrics: opportunity, gap prevalence, duplicate risk, and eligible segment size. State that every number is synthetic and labeled.
6. Show the seven weighted score components and three reasons.
7. Point out the deterministic fallback label. Explain that a provider outage cannot break the judge demo.
8. Read the campaign message and the instruction not to imply a sales outcome.

## 5:30–6:30 — Technical and ethical proof

Open the repository’s `docs/competition-checklist.md`. Show the rubric mapping, automated tests, and AWS deployment plan. Open the Privacy page and highlight consent, protected-attribute exclusion, thresholding, retention, and deletion.

## 6:30–7:00 — Close

Say: “Racked gives consumers a reason to trust the recommendation and gives smaller brands a useful decision without giving them a person’s closet. The next milestone is an opt-in pilot that tests whether match opportunity correlates with engagement; until then, we make no sales-lift claim.”

## Failure recovery

- External model fails: keep the **DETERMINISTIC FALLBACK** label visible and continue.
- Seed changes during demo: reload or sign out; the fictional baseline is restored.
- AWS demo unavailable: run `pnpm dev` locally and explain that credentials were intentionally not committed.
