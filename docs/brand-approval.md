# Approving brand accounts

A brand account registered since 2026-10-27 starts **pending**. It can sign in, change its details
and turn on two-step sign-in. It cannot enroll products, publish Looks, describe a product from a
photo, see wear or Community insights, or ask Brand Hanger until the owner approves it. Every brand
route answers 403 with its status, and its dashboard explains the wait (`lib/brand-approval.ts`,
`lib/server/brand-access.ts`).

Brand accounts created before that have no status and count as **approved**: the live brands and the
judge accounts work exactly as before, with no migration.

Approval is a manual owner step for now. An automated waiting period and business verification are
planned for after the competition.

## Before approving

There is no automated proof yet, so check by hand:

- The email domain belongs to the brand: the address is on its own domain, not a free webmail one.
  If it is webmail, confirm through a contact listed on the brand's own website.
- The brand name matches a real, findable brand, and is not a near-copy of one.
- If in doubt, leave the account pending. A pending brand can see nothing about anyone.

## Commands (AWS CloudShell, owner only)

Set the table name first. It is `RACKED_TABLE_NAME` in Amplify; print only that value, never the
whole environment map, which holds `SESSION_SECRET`.

```bash
TABLE=racked-production-table   # replace with the real RACKED_TABLE_NAME
```

List brands waiting for approval. This scans the table once: a few cents at most, and usually less.

```bash
aws dynamodb scan --table-name "$TABLE" --region us-east-2 \
  --filter-expression "#role = :brand AND brandStatus = :pending" \
  --expression-attribute-names '{"#role":"role"}' \
  --expression-attribute-values '{":brand":{"S":"brand"},":pending":{"S":"pending"}}' \
  --projection-expression "id, email, brandName, createdAt" --output table
```

Approve one, by the `id` from that list. The condition refuses anything that is not a brand account.

```bash
ACCOUNT_ID=00000000-0000-0000-0000-000000000000   # the id to approve
aws dynamodb update-item --table-name "$TABLE" --region us-east-2 \
  --key "{\"PK\":{\"S\":\"USER#$ACCOUNT_ID\"},\"SK\":{\"S\":\"PROFILE\"}}" \
  --update-expression "SET brandStatus = :status" \
  --condition-expression "#role = :brand" \
  --expression-attribute-names '{"#role":"role"}' \
  --expression-attribute-values '{":status":{"S":"approved"},":brand":{"S":"brand"}}'
```

To **revoke** a brand, run the same command with `"revoked"` in place of `"approved"`. It takes effect
on the brand's next request:

- Every brand route refuses it.
- Its products leave the public registry: searches, matches, label verification and its public page.
- Pieces consumers already linked keep their link.

To restore it, set it back to `"approved"`. Nothing is deleted either way.

## Limits

- **300 products per brand** (`BRAND_PRODUCT_LIMIT`).
  - It is checked before any photo is read, and enforced in the same DynamoDB transaction that saves
    the product.
  - Archived products still count, because their photos are still stored.
  - A brand from before the limit is counted from its real catalog the first time it enrolls.
  - Raising the limit is a one-line code change.
- **60 enrollments per hour** per brand, as before.

## Known gaps

- A pending account still reserves its brand name, so a squatter could hold a real brand's name until
  the owner deals with it. Revoking the account stops it using the name. Freeing the name for the
  real brand means deleting that account's `BRANDNAME#<slug>` claim item, which should be a reviewed
  step, not a one-off console edit.
- There is no notification when an account is approved; the brand sees it on its next visit.
