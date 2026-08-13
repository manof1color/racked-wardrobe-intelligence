# Presentation script (7 minutes)

## 0:00–0:45 — Problem

Open the [live AWS application](https://main.d2iv0khybuuaeh.amplifyapp.com). Explain: “Purchase history tells a brand what sold. It does not tell the brand what a customer actually wears. Racked creates useful wardrobe intelligence for the consumer and releases only safe aggregate product use to the owning brand.”

## 0:45–3:15 — Real Consumer flow

1. Create a Consumer account and explain the image-processing consent.
2. Show the empty private wardrobe.
3. Add the front photo, then tap **Get an AI photo plan**. Show the controlled broad category/subtype hypothesis, confidence, visible reasoning, and category-specific evidence requests.
4. Add the remaining views and analyze. Explain that final analysis receives the first hypothesis and can revise it when later evidence disagrees. Show the editable category/subtype controls and uncertainty alternatives; none of these descriptive fields can verify a brand.
5. Show the prefilled brand label — read from the photo, suggested from the allowlist, or typed — and explain that none of those can verify identity. Only an enrolled SKU/GTIN registry match does, and that holds even if a brand account already exists under that name.
6. Confirm or edit the labels and save the garment; reload to prove persistence.
7. Add enough pieces to open **Looks**, tap a combination, review the slide preview, and choose **Save & wear this look**.
8. Open the **Outfits** tab to show the saved outfit with its pieces and wear count, then use **Wear this again** to record a repeat wear in one tap.
9. Open Hanger from the bottom of the dashboard and inspect its account-owned tools and evidence.

## 3:15–5:30 — Real Brand flow

1. Sign out and create a Brand account.
2. Enroll an authorized product with front, back, label, SKU, optional GTIN, aliases, and exact label text.
3. Reload to prove the brand-owned registry persists.
4. Explain that future Consumer label/SKU evidence can connect to this registry product.
5. Run actual-wear calculation. With fewer than 25 opted-in owners, the correct result is a suppression notice—not an invented metric.
6. Run the Brand Agent and show that it respects the same threshold.

## 5:30–6:30 — Technical and ethical proof

Open the [README](../README.md) — the architecture diagram, key-file map, and rubric-evidence table are embedded there, so no judge has to hunt. Then show:

- DynamoDB and private S3 persistence;
- Amazon Bedrock multimodal analysis and the adaptive photo-plan agent;
- server-signed garment confirmation over both image keys;
- account and brand ownership checks;
- `k ≥ 25` after per-account consent filtering, plus the product-enumeration budget that stops SKU-sweeping;
- rate limits returning HTTP 429 on abusive traffic;
- the regression tests that lock the brand-verification boundary;
- GitHub tests, CodeQL, and the real incremental history in [PROGRESS.md](../PROGRESS.md).

If time allows, open `/pricing` and note that the business model is published and clearly labeled as not yet billed.

## 6:30–7:00 — Close

“Racked gives a person a useful private wardrobe and gives a brand a decision only when enough people have safely contributed. It does not pretend that an early product has data it has not earned.”

## Failure handling

- Bedrock unavailable: show the explicit manual-review state; the consumer may save only labels they review or enter themselves.
- Cohort below 25: explain that suppression is a successful privacy control.
- AWS unavailable: verify Amplify and CloudFormation status; do not switch to fake data.
