# Judge accounts

Four accounts exist so a judge can see Racked from both sides without setting anything up, and two
more so the first-run experience can be shown without disturbing the populated ones. Everything in
them is synthetic: every record carries `dataClassification: "DEMO"` and `testCohort: true`, and
every address is a reserved, non-deliverable `.local` address.

**Passwords are supplied privately.** They are never in this repository, in CI, or in logs; the seed
reads one from `RACKED_TEST_PASSWORD` at runtime.

| Account | What it is for |
| --- | --- |
| `judge.consumer@racked.local` | A lived-in wardrobe: 13 pieces, 2 saved outfits, real wear history, two pieces **verified** against a brand product, one linked by the owner's **own pick**, a published Community look, and a saved inspiration |
| `judge.newconsumer@racked.local` | Empty. Scan a real photo, watch pieces arrive, and see the honest first-run states |
| `judge.brand@racked.local` | **Judge Demo Atelier**: one product with **50 opted-in owners**, so the dashboard shows what a live product looks like; one with **4**, deliberately below the `k ≥ 25` threshold, so suppression is visible beside it; one retired; and a published Brand Look |
| `judge.newbrand@racked.local` | **Judge New Label**, no products. Enroll one live from a single photo |

## One click: Try the demo

The finalists' instructions ask for a judge to get in with one click and never type a username or
password, and for every judge to start from the same place. The sign-in screen does that with one
button for each of the four accounts above (`app/api/auth/demo/route.ts`, `lib/server/demo-entry.ts`,
rules in `lib/demo-session.ts`). Signing in to one of the four addresses with its password opens
exactly the same thing as its button, never the shared account itself, so no judge can change what
the next one sees; a full session to a seeded judge account is refused outright (`lib/session.ts`).

- **Judge Consumer** copies `judge.consumer`'s pieces, outfits and saved inspiration into a new account
  (`demo-session-<uuid>`) and signs the visitor in for 24 hours. The copy has no email and no
  password, and its records carry a DynamoDB `ttl` of 48 hours (TTL is on for the table, read back on 2026-11-01, so DynamoDB removes them in the background after that). Photos are shared with the seeded
  wardrobe, which is safe because deletion only removes photos under the deleting account's own
  folder. Re-seeding `judge.consumer` changes what the next demo starts from.
- **New Consumer** is the same, but empty: a private wardrobe with nothing in it, for the first-run
  screens. It expires the same way.
- **New Brand** is a private, empty brand of the judge's own (`demo-session-brand-<uuid>`, approved,
  with no email, password or brand-name claim). It may enrol up to 5 products and draft Looks, but
  never publish one. Its products are never written to the product registry, so they never answer a
  real person's label, a search, a public brand page or a Community card; its photos are stored
  under `temp/`, which the bucket empties after a day, and its records carry the same 48-hour `ttl`.
- **Judge Brand** signs into `judge.brand` itself, read-only: product edits, enrollment,
  retiring a product and Brand Looks are refused, so the brand stays the same for everyone. Brand
  Hanger and the metrics work. It is refused unless the account is the seeded one, labelled `DEMO`.
- **Fill in from photo works in the demo brand**, because it stores nothing: it reads the photo and
  proposes the fields, and enrolling the result is still refused. Every demo session gets its own
  allowance of 12 readings a day, counted under a key minted for that session rather than the shared
  account, so one judge cannot use up the next judge's; each reading still counts against the
  site's daily AI ceiling.
- **Settings in the demo brand is a preview.** It shows two-step sign-in in its "on" state, the
  brand's approval status, today's product budget (products opened of 6, shared by every visitor)
  and a security activity log, with every control disabled. No authenticator secret is stored on the
  shared account, and the activity log is made up: the account's real log is every judge's sign-ins,
  so a demo session is never shown it, from Settings or from `/api/account/activity`.
- **None reaches a real person or brand.** A demo wardrobe never joins a product's owner index, so
  its wears never reach a brand, and brand metrics skip demo accounts as well. It cannot publish to
  Community, and its look comparisons are not counted as Community activity. No demo can change
  email, password, two-step sign-in, or sign out other sessions — otherwise one visitor could lock the
  shared demo brand.
- **Limits.** 10 demo sessions per address per ten minutes on one server, 30 per address per hour
  across all of them, 120 new demos of any kind an hour site-wide; 12 scans and 30 Hanger messages a
  day per demo wardrobe, and 12 photo readings and 30 Brand Hanger questions a day per brand-demo
  visitor. All demos together may use at most 80% of the day's AI model calls, so real brands and
  consumers always keep the rest.
- **Not cleaned up yet:** records a judge adds during a demo (new pieces, wear markers) and photos
  they keep are not given a `ttl`, so they stay after the account expires. The account itself is
  gone, so nobody can reach them.

## A three-minute tour

1. **Sign in as `judge.consumer`.** The Closet shows a verified brand piece (`Verified Judge Demo
   Atelier product`) and a picked one (`Judge Demo Atelier · your pick`) side by side, each with its
   cost per wear from the brand's listed price. That difference is the whole identity boundary:
   only the first came from label evidence.
2. **Ask Hanger for an outfit.** Pieces are chosen by the server from this wardrobe, and the reply
   is rejected if it names anything that isn't in the selection. Ask again and it rotates.
3. **Open Community.** Compare the DEMO brand and member photos wearing the Judge Founder Jacket (JDA-004). Both jacket cards lead to the same $295 product. The member's closet jeans and sneakers have no price. The jacket has no seeded wear events. Then select **Recreate with my wardrobe** on the judge's own look. It splits the
   look into what this account owns and what is missing, with the reason for each match.
4. **Sign in as `judge.brand`.** `Judge Signature Tee` (JDA-001) releases metrics: 50 opted-in
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

### When to re-seed

Every date the seed writes is counted back from the day it runs: the accounts are 120 days old,
and the wears, looks and public activity are recent. That is what keeps `Judge Signature Tee`'s
eight-week chart full; with a fixed date it went blank once the weeks moved past it. The chart is
the current week and the seven before it, and a week with fewer than 5 wears is withheld, so the
seed gives every owner of the released product a wear every week for three to twelve weeks back,
each owner on at least three different days.

Re-seed **once after this change merges**, and again on **18 or 19 November**, just before judging.
`pnpm verify:judge` fails if the newest wear on the released product is more than 7 days old, or if
fewer than 6 of the 8 weeks on its chart hold 5 or more wears: that is the signal to re-seed. To
rehearse a particular day, set `RACKED_SEED_NOW` (an ISO date, such as `2026-11-18T12:00:00Z`).

Re-running does not double anything. Records with stable ids are overwritten in place. Records
whose sort key carries a date (the products' wear events, the four public-activity events, the
two published looks, the two saved outfits and the Brand Look) would get new keys every day, so the
seed deletes the seeded copies first. It deletes only items carrying `testCohort: true`, only in
those families, and each delete is conditional on that flag, so a real wear, event or post is never
touched. The dry run reads nothing and so counts no deletions; to see the real count first, add
`RACKED_SEED_COUNT_EXISTING=yes` and `RACKED_TABLE_NAME=...` to the dry run, which reads the table
read-only. If a judge edits or deletes something, re-run the seed.

`tests/judge-accounts.test.ts` runs the seed in dry-run mode on every CI run and checks its output
against the app's own rules: that the released product really does clear `k ≥ 25` with opted-in
owners, that the suppressed one really is below it, that the picked piece never joins the brand's
owner index, that nothing a judge is shown points at an image the seed never uploaded (the synthetic
cohort's linked garments, which only the brand aggregate reads, have no images), and that the seeded catalog
verifies the label a judge can type while the retired product answers nothing.

## What the seed does not invent

- **No real people.** The opted-in owners are the same synthetic cohort as
  [the demo cohort](test-cohort.md); any that are missing are created by this seed so the threshold
  demo works from a clean table.
- **No claimed outcomes.** Wear counts, likes, and public activity are labelled demonstration data.
  Nothing in the brand dashboard claims sales, revenue, or intent, in seeded data or anywhere else.
- **No real brand names.** Judge Demo Atelier and Judge New Label are fictional, and well-known
  brand names cannot be registered at all.
- **Photos are AI-generated, of fictional items.**
  - **What they are:** every photo on the judge accounts was generated for this demo with an image
    model. That covers the ten closet pieces, and the front, back and label of each Judge Demo
    Atelier product. None shows a real product, a person or a real brand's logo, and the label
    photos read only "JUDGE DEMO ATELIER" and the item's code.
  - **Where they live:** `scripts/assets/judge-photos/`, as 900×1100 WebP.
  - **How they are seeded:** `scripts/lib/judge-photos.mjs` writes them, and the seed stops if one
    is missing.
  - **The main demo cohort** still uses the illustrated art from
    `scripts/lib/synthetic-garment-art.mjs`.
