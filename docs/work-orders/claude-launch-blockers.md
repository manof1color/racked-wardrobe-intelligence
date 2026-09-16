# Work order — launch blockers (executor: Claude)

Opened 2026-09-16. Source: [streamline plan](../streamline-plan.md) and
[store launch plan](../app-store-launch.md). Status is updated in this file as each item lands.

| Item | Status |
| --- | --- |
| C1 — Delete a garment | Done, Phase 36 |
| C2 — Delete a consumer account | Done, Phase 36 — the storage sweep needs the IAM stack update |
| C3 — Terms of service | Done, Phase 36 |
| C4 — Remove code nothing reaches | Done, Phase 37 — narrowed after re-verification |

## Boundaries that apply to every item

- Deletion is owner-scoped: a request can only reach records under the signed-in account and
  objects under that account's own storage prefix.
- No step may leave a record pointing at something already deleted. Records go last, so an
  interrupted deletion is finished by simply retrying it.
- Nothing weakens consent, the `k >= 25` brand gate, or the rule that only registry evidence
  verifies a product.
- Each item ships with regression tests and documentation in the same PR.

## C1 — Delete a garment

**Why:** a bad scan cannot currently be removed, and both stores expect user content to be
deletable.

**Done when:**
- `DELETE /api/consumer/wardrobe` removes one of the signed-in consumer's garments.
- Saved outfits containing it lose that piece and get a regenerated board; an outfit left
  empty is deleted.
- The owner's Community posts stop showing its photograph; a post left empty is removed.
- Brand wear events recorded for that piece are deleted.
- Its display photo is deleted; the scan's evidence photo is deleted only with the last piece
  that shares it.
- Closet cards offer a two-step delete that says what else changes.

## C2 — Delete a consumer account

**Why:** Apple Guideline 5.1.1(v) and Google Play both require in-app account deletion, and
`/privacy` already promises it.

**Done when:**
- `DELETE /api/account` requires the current password and the typed word DELETE, and is rate
  limited.
- It removes Community posts, brand wear events, every photograph its records reference, and
  every record under the account, with the profile last. The session cookie is cleared.
- A sweep of the account's storage prefix also removes scan photos that were never saved,
  where the deployment grants `s3:ListBucket` on that prefix. Where it does not, deletion
  still completes and the gap is logged, not hidden.
- Settings has a clearly separated delete section. Brand accounts are told plainly that
  deletion is not yet available from Settings.
- `/privacy` describes what actually happens.

## C3 — Terms of service

A plain-language `/terms` page for the pilot, linked beside Privacy, stating it has not yet had
legal review.

## C4 — Remove code nothing reaches

The cut list in the streamline plan, re-verified against `scripts/` and `tests/` before
anything is deleted, since both can call code the app itself no longer does.

## Handed to ChatGPT

Brand account deletion, the Looks/Outfits tab merge, personal data export, and Android
packaging preparation: see [the ChatGPT work order](chatgpt-launch-follow-ups.md).
