# Privacy and ethics

## Consumer controls

- Image-processing consent is required before Consumer account creation.
- Brand-data sharing is a separate, ongoing preference stored per account.
- AI fields require human confirmation before a wardrobe record exists. Category/subtype predictions use a controlled vocabulary, show bounded alternatives when uncertain, and remain editable; neither prediction nor correction has authority to verify brand identity.
- Public Community posts require one explicitly selected saved outfit. Each published piece gets a new public ID, while source outfit IDs, wardrobe IDs, account IDs, and S3 keys remain private. Images are served only through a post-scoped proxy. Exact brand links require registry evidence; user/AI labels remain visibly unverified.
- Recreate This Look is account-bound: the server ignores client wardrobe input and loads only the signed-in Consumer's DynamoDB partition. Exact ownership requires the same registry product ID; visual/style similarity can produce only a substitute. Its analytics event contains only the public post ID, event type, and timestamp—not a Consumer identity.
- Shopping destinations are stored only on Brand-authorized product records, must be public HTTPS, and are revalidated at redirect time. The route accepts a product ID—not an arbitrary URL—so it cannot be an open redirect. Attribution events contain product/public-post references and timestamps, not Consumer identity.

## Brand boundary

Brands may access only products enrolled under their own authenticated account. Product wear metrics are built from connected garment records, then filtered by each owner’s current consent. Results are suppressed before calculation when fewer than 25 distinct opted-in owners qualify.

To resist differencing and enumeration attacks, the production aggregate path also enforces a per-account budget: a brand can pull aggregates for at most six distinct products in any five-minute window (re-opening an already-viewed product costs nothing). The budget log is stored in DynamoDB under the brand's own partition and contains only product IDs and timestamps — no consumer data. Requests over the budget receive a generic HTTP 429 that does not reveal which cohorts are near the threshold.

## Brand identity boundary

AI-read brand text is autofill, never verification. When garment analysis can read a brand name from a visible label or logo, that name only prefills the Consumer's editable brand-label field — the same trust level as the typed major-brand suggestion, just image-sourced. It is marked `suggested`/`ai-label-text`, carries an explicit "not a verified product link" warning, and can never produce verified status by itself, **even when a brand account or registry product already exists under that exact name**. Verified identity is granted exclusively by a registry match on GTIN or brand-plus-SKU evidence, unchanged by this feature and guarded by a regression test (`tests/brand-autofill.test.ts`).

## Image boundary

Consumer and Brand images are encrypted in an S3 bucket with all public access blocked. The browser receives short-lived signed URLs. Wardrobe save confirmation is HMAC-bound to the account, S3 key, garment fields, and registry result, preventing another browser from substituting an image or verified product connection.

## Data minimization

The matching and wear systems do not store protected demographic attributes. Brand analytics do not query names, email addresses, images, or full wardrobes. Password hashes and salts are never returned by application APIs.

## Retention and deletion

Production account deletion must remove the exact account partition, owned S3 objects, public posts, and brand product records, then recompute affected product aggregates. Security logs must exclude tokens, passwords, signed URLs, and image bytes.

## Known limitations

- Plain-background trim is not a full body-aware virtual try-on system.
- Brand enrollment confirms control of an account and supplied catalog evidence; a later business-verification workflow should validate legal brand authority.
- K-anonymity reduces re-identification risk but does not replace broader governance, audit logging, rate limits, and legal review.
