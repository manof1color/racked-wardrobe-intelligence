# Clearly Labeled Test Cohort

> Judge note: every record described here is synthetic and carries `testCohort: true`. It demonstrates the privacy threshold without representing real customers or commercial results.

Racked includes an explicit seeding workflow for one fictional small brand, **Racked Test Atelier**, one enrolled product, and 25 opted-in synthetic Consumer accounts. Each Consumer owns the same verified test product with 1–4 synthetic wear events plus one clearly labeled, unverified companion pant. The companion makes Consumer Hanger testable without adding another brand-linked aggregate. This allows the Brand dashboard and Hanger brand agent to cross the production `k ≥ 25` privacy boundary with data that cannot be mistaken for real customer evidence.

The seed is intentionally not automatic. Run `scripts/generate-test-cohort-assets.mjs`, then run `scripts/seed-test-cohort.mjs` only with `ALLOW_RACKED_TEST_SEED=yes`, the production table and bucket names, and a separately supplied `RACKED_TEST_PASSWORD`. No password is committed to GitHub.

The cohort is idempotent by stable test IDs. Re-running refreshes only the clearly labeled test accounts, product, images, and garment records.

## Judge path

1. Sign in with the separately provided Racked Test Atelier Brand account.
2. Select **Test Rotation Tee**.
3. Calculate actual wear and inspect the 25-owner aggregate.
4. Open **Hanger** at the bottom of the dashboard and request the privacy-safe wear analysis.
5. Sign in as any supplied Test Consumer to inspect the enrolled garment and consumer Hanger experience.
