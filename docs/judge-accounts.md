# Judge accounts

Four accounts exist so a judge can see Racked from both sides without setting anything up, and two
more so the first-run experience can be shown without disturbing the populated ones. Everything in
them is synthetic: every record carries `dataClassification: "DEMO"` and `testCohort: true`, and
every address is a reserved, non-deliverable `.local` address.

**Passwords are supplied privately.** They are never in this repository, in CI, or in logs; the seed
reads one from `RACKED_TEST_PASSWORD` at runtime.

| Account | What it is for |
| --- | --- |
| `judge.consumer@racked.local` | A lived-in wardrobe: 12 pieces, 2 saved outfits, real wear history, one piece **verified** against a brand product, one linked by the owner's **own pick**, a published Community look, and a saved inspiration |
| `judge.newconsumer@racked.local` | Empty. Scan a real photo, watch pieces arrive, and see the honest first-run states |
| `judge.brand@racked.local` | **Judge Demo Atelier**: one product above the `k ≥ 25` release threshold, one deliberately below it, one retired, and a published Brand Look |
| `judge.newbrand@racked.local` | **Judge New Label**, no products. Enroll one live from a single photo |

## A three-minute tour

1. **Sign in as `judge.consumer`.** The Closet shows a verified brand piece (`Verified Judge Demo
   Atelier product`) and a picked one (`Judge Demo Atelier · your pick`) side by side, each with its
   cost per wear from the brand's listed price. That difference is the whole identity boundary:
   only the first came from label evidence.
2. **Ask Hanger for an outfit.** Pieces are chosen by the server from this wardrobe, and the reply
   is rejected if it names anything that isn't in the selection. Ask again and it rotates.
3. **Open Community**, then **Recreate with my wardrobe** on the judge's own look. It splits the
   look into what this account owns and what is missing, with the reason for each match.
4. **Sign in as `judge.brand`.** `Judge Signature Tee` (JDA-001) releases metrics: 26 opted-in
   owners, a wear chart, repeat-wear rate. `Judge Limited Overshirt` (JDA-002) has four owners, so
   everything is suppressed and the page says why — including that the count itself is withheld.
   `Judge Archive Cap` (JDA-003) is retired: it keeps its owners, and it is gone from
   `/brands/judge-demo-atelier`.
5. **Sign in as `judge.newbrand`** and enroll a product from one photo with **Fill in from photo**,
   then **`judge.newconsumer`** and scan something you own. Open *Is this a brand product?* to see
   the catalog suggest look-alikes and to search a brand by name.

## Seeding

```bash
# See exactly what it would write. No AWS, no password, no writes.
pnpm seed:judge:dry

# Write it.
ALLOW_RACKED_TEST_SEED=yes RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... \
RACKED_TEST_PASSWORD=... pnpm seed:judge

# Read it back and check a judge will actually see the demo. Read-only, no password.
RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... pnpm verify:judge
```

The seed is idempotent: stable ids mean re-running repairs the demo rather than duplicating it. If a
judge edits or deletes something, re-run it.

`tests/judge-accounts.test.ts` runs the seed in dry-run mode on every CI run and checks its output
against the app's own rules: that the released product really does clear `k ≥ 25` with opted-in
owners, that the suppressed one really is below it, that the picked piece never joins the brand's
owner index, that no record points at an image the seed never uploaded, and that the seeded catalog
verifies the label a judge can type while the retired product answers nothing.

## What the seed does not invent

- **No real people.** The 25 opted-in owners are the same synthetic cohort as
  [the demo cohort](test-cohort.md); any that are missing are created by this seed so the threshold
  demo works from a clean table.
- **No claimed outcomes.** Wear counts, likes, and public activity are labelled demonstration data.
  Nothing in the brand dashboard claims sales, revenue, or intent, in seeded data or anywhere else.
- **No real brand names.** Judge Demo Atelier and Judge New Label are fictional, and well-known
  brand names cannot be registered at all.
