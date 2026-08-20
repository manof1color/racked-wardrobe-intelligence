# Clearly Labeled Competition Demo Cohort

> Judge note: every record described here is synthetic, carries `testCohort: true` and `dataClassification: DEMO`, and is never represented as a real customer, pilot, or commercial result.

The deterministic seed creates three fictional Brand accounts: **Racked Test Atelier** (apparel), **Synthetic Stride Lab** (footwear), and **Lumen Test Objects** (jewelry). Each owns 10 original synthetic products and two Brand Looks. Twenty-five opted-in synthetic Consumer accounts each receive one verified hero product per fictional brand, a saved outfit, deterministic 0–8 wear histories, and—on the first 10 accounts—a published Consumer Look with clearly fictional public activity.

Each hero product receives the same reproducible 76 wear events across 25 owners: 22 active owners, 19 repeat wearers, and 3 zero-wear owners. This crosses the real production `k ≥ 25` rule without pretending that the observations came from customers. The Community seed also exercises public outfit appearances, likes, recreate requests, product pairings, Consumer-vs-Brand source distinctions, and the separate privacy-safe public-activity dashboard.

Images are generated locally from original SVG templates by the seed and uploaded as private encrypted PNG objects. They visibly say **SYNTHETIC DEMO** and do not copy real catalogs or copyrighted product photography.

## Safe seeding and credentials

The seed is intentionally not automatic. Run `scripts/seed-test-cohort.mjs` only with `ALLOW_RACKED_TEST_SEED=yes`, the production table and bucket names, and a separately supplied `RACKED_TEST_PASSWORD` of at least 16 characters. That one runtime-only password is used for all demo accounts so the competition owner can test role flows; it is never written to source, CI, logs, or this public repository.

Brand login emails are safe to document because they are fictional:

- `demo.apparel@racked.local`
- `demo.footwear@racked.local`
- `demo.jewelry@racked.local`

Consumer emails follow `demo.consumer01@racked.local` through `demo.consumer25@racked.local`. The password must be given privately by the project owner.

These `.local` addresses are deliberately non-deliverable and therefore cannot receive SES password-reset messages. Recovery testing must use a separate synthetic account tied to an SES-verified recipient; no real recipient address belongs in this public document or the seed.

The seed is idempotent by stable demo IDs. Re-running refreshes only clearly classified DEMO records. A real business first registers normally as `REGULAR`; the guarded `scripts/classify-pilot-brand.mjs` can mark that real Brand account `PILOT` and explicitly refuses DEMO/test-cohort accounts. No synthetic activity is copied into a pilot account.

## Right-brand verification

The automated suite builds the three existing fictional registries and proves that each brand+SKU label resolves to that exact registry record—not either neighboring brand. With production AWS runtime access, run `pnpm verify:demo-match` to query the deployed `BRAND_PRODUCTS` index and verify `RTA-001` (or set `RACKED_MATCH_TEST_SKU`) against the real seeded table. The script reports only DEMO identifiers and fails if the resolved brand/product differs. This repository does not claim that production-table command was run unless its output is recorded in a deployment report.

## Judge path

1. Sign in with any separately supplied fictional Brand credential.
2. Select its first product to inspect the 25-owner private wear aggregate, eight-week chart, frequency distribution, and aggregate-only CSV.
3. Inspect **Public Community Activity** for separate outfit appearances, inspiration, recreate requests, outbound interest, and common pairings.
4. Create or inspect Brand Looks; Community labels seeded content as fictional DEMO data.
5. Open **Hanger** and ask a strategy question grounded in the selected product’s released aggregate.
6. Sign in as a supplied demo Consumer to inspect the wardrobe, saved outfit, Community, Recreate This Look, and Consumer Hanger flows.
