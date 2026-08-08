# Privacy and ethics

## Consumer controls

- Image-processing consent is required before Consumer account creation.
- Brand-data sharing is a separate, ongoing preference stored per account.
- AI fields require human confirmation before a wardrobe record exists.
- Public Community posts are explicit and reveal only the selected post content.

## Brand boundary

Brands may access only products enrolled under their own authenticated account. Product wear metrics are built from connected garment records, then filtered by each owner’s current consent. Results are suppressed before calculation when fewer than 25 distinct opted-in owners qualify.

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
