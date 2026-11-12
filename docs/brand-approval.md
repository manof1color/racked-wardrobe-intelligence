# Approving brand accounts

A brand account registered since 2026-10-27 starts **pending**. It can sign in, change its details
and turn on two-step sign-in. It cannot enroll products, publish Looks, describe a product from a
photo, see wear or Community insights, or ask Brand Hanger until the owner approves it. Every brand
route answers 403 with its status, and its dashboard explains the wait (`lib/brand-approval.ts`,
`lib/server/brand-access.ts`).

Brand accounts created before that have no status and count as **approved**: the live brands and the
judge accounts work exactly as before, with no migration.

A pending brand holds its name for 14 days. After that, a new registration may take the name and the stale account is set to revoked (`lib/brand-approval.ts`).

Approval is a manual owner step for now. An automated waiting period and business verification are
planned for after the competition.

## Before approving

There is no automated proof yet, so check by hand:

- The email domain belongs to the brand: the address is on its own domain, not a free webmail one.
  If it is webmail, confirm through a contact listed on the brand's own website.
- The brand name matches a real, findable brand, and is not a near-copy of one.
- If in doubt, leave the account pending. A pending brand can see nothing about anyone.

## Find out when a brand registers

Every new brand registration emails the owner: the brand name, the address it registered with, its
account id and the exact command that approves it (`lib/brand-signup-alert.ts`). It goes only to the
owner's addresses, never to the person registering, and an unsent alert never fails a registration.

It is off until two Amplify settings exist (one-time, owner only):

1. In the AWS console, **Amazon SES → Identities → Create identity → Email address**, enter the
   owner's address in us-east-2, and click the link SES emails. While the account is in the SES
   sandbox, both the sender and the recipient must be verified, so verifying the owner's own address
   covers both.
2. In Amplify, add `RACKED_BRAND_ALERT_TO` (up to three comma-separated owner addresses) and
   `RACKED_BRAND_ALERT_FROM` (the verified sender; `RACKED_PASSWORD_RESET_FROM` is used if this is
   unset), then redeploy. The compute role already allows `ses:SendEmail` (`infra/template.yaml`).

## Commands (owner only)

Sign in to AWS on your own computer first, then run these from the repository. They use the
production table (`RACKED_TABLE_NAME` overrides it) and us-east-2 (`scripts/brand-approval.mjs`).

```bash
aws login --profile racked-benchmark
```

List brands waiting for approval, oldest first. It reads only, with one filtered scan of the table: a
few cents at most.

```bash
pnpm brands:pending
```

`pnpm brands:list` shows every brand account and its status. Temporary demo brands are left out.

Approve one by the `id` from that list, or from the alert email. It shows the brand, its address and
its current status, then asks you to type `approve` before it changes anything. It writes only that
account's `brandStatus` (and when it changed), and only if the account is a brand.

```bash
pnpm brands:approve <account-id>
```

The shared judge brands and the temporary demo brands are refused: their status belongs to the seed
and the demo. Add `--yes` to skip the confirmation.

To **revoke** a brand, run `pnpm brands:revoke <account-id>`. It takes effect on the brand's next
request:

- Every brand route refuses it.
- Its products leave the public registry: searches, matches, label verification and its public page.
- Pieces consumers already linked keep their link.

To restore it, approve it again. Nothing is deleted either way.

## Limits

- **300 products per brand** (`BRAND_PRODUCT_LIMIT`).
  - It is checked before any photo is read, and enforced in the same DynamoDB transaction that saves
    the product.
  - Archived products still count, because their photos are still stored.
  - A brand from before the limit is counted from its real catalog the first time it enrolls.
  - Raising the limit is a one-line code change.
- **60 enrollments per hour** per brand, as before.

## Known gaps

- A pending account reserves its brand name for 14 days, so a squatter can still hold a real brand's name
  for that long unless the owner deals with it sooner. Revoking the account stops it using the name. Freeing the name for the
  real brand means deleting that account's `BRANDNAME#<slug>` claim item, which should be a reviewed
  step, not a one-off console edit.
- The brand is not emailed when it is approved; it sees the change on its next visit.
