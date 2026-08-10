# Presentation script (7 minutes)

## 0:00–0:45 — Problem

Open the [live AWS application](https://main.d2iv0khybuuaeh.amplifyapp.com). Explain: “Purchase history tells a brand what sold. It does not tell the brand what a customer actually wears. Racked creates useful wardrobe intelligence for the consumer and releases only safe aggregate product use to the owning brand.”

## 0:45–3:15 — Real Consumer flow

1. Create a Consumer account and explain the image-processing consent.
2. Show the empty private wardrobe.
3. Add real front, back, and label photos from the phone camera or library.
4. Point out the Bedrock-visible attributes and the auto-cropped display image.
5. Show a major-brand suggestion or add a personal label, then explain why it remains unverified without an enrolled SKU/GTIN match.
6. Confirm or edit the labels and save the garment; reload to prove persistence.
7. Add enough pieces to open **Looks**, tap a combination, review the slide preview, and choose **Save & wear this look**.
8. Open Hanger from the bottom of the dashboard and inspect its account-owned tools and evidence.

## 3:15–5:30 — Real Brand flow

1. Sign out and create a Brand account.
2. Enroll an authorized product with front, back, label, SKU, optional GTIN, aliases, and exact label text.
3. Reload to prove the brand-owned registry persists.
4. Explain that future Consumer label/SKU evidence can connect to this registry product.
5. Run actual-wear calculation. With fewer than 25 opted-in owners, the correct result is a suppression notice—not an invented metric.
6. Run the Brand Agent and show that it respects the same threshold.

## 5:30–6:30 — Technical and ethical proof

Open `docs/competition-checklist.md`. Show:

- DynamoDB and private S3 persistence;
- Amazon Bedrock multimodal analysis;
- server-signed garment confirmation;
- account and brand ownership checks;
- `k ≥ 25` after per-account consent filtering;
- GitHub tests, CodeQL, and incremental history.

## 6:30–7:00 — Close

“Racked gives a person a useful private wardrobe and gives a brand a decision only when enough people have safely contributed. It does not pretend that an early product has data it has not earned.”

## Failure handling

- Bedrock unavailable: show the explicit manual-review state; the consumer may save only labels they review or enter themselves.
- Cohort below 25: explain that suppression is a successful privacy control.
- AWS unavailable: verify Amplify and CloudFormation status; do not switch to fake data.
