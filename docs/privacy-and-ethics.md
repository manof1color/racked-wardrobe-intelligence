# Privacy and ethics

## Consumer controls

- Image-processing consent is required before Consumer account creation.
- Brand-data sharing is a separate, ongoing preference stored per account. Each change is recorded permanently under the account, together with the setting, in one write: on or off, when, and which version of the wording beside the switch was on screen (`lib/brand-sharing-consent.ts`, where every wording is kept and pinned by test). The person sees each change for 90 days in their security activity; the records themselves are deleted only with the account. Choices made before 2026-10-27 have no record and read as the earlier wording, which did not say earlier wear is included.
- AI fields require human confirmation before a wardrobe record exists. Category/subtype predictions use a controlled vocabulary, show bounded alternatives when uncertain, and remain editable; neither prediction nor correction has authority to verify brand identity.
- Garment isolation is a deterministic pixel operation: it decides which pixels are backdrop and which are the piece, keeps only the largest connected region so a neighbouring item cannot be absorbed, and never generates, restyles, or repaints garment pixels. It inspects no person and infers no body, demographic, or preference attribute. When the photo is ambiguous — two subjects of comparable size, or a backdrop too patterned to model — it declines and the original framing is shown instead of a confidently wrong crop.
- One-photo multi-piece intake detects only wearable instances and explicitly prohibits person, body, demographic, preference, and ownership inference. Its source photo and separate item images remain in the signed-in Consumer’s private S3 prefix; each selected candidate requires human confirmation and an account-bound HMAC before it can become a wardrobe record. Detection uses the US Nova Pro geographic inference profile, whose destination regions remain within the United States; routine vision and Hanger use Nova Lite. Synchronous intake uses local silhouette and conservative edge isolation so a scan never fans out into one remote cleanup request per piece; unsafe isolation falls back to the ordinary bounded crop rather than sacrificing garment pixels. The implemented US-only Bedrock segmentation helper is reserved for a future asynchronous enhancement and is not an intake gate. AI-read logo text remains unverified.

- Authenticated app links preserve the signed-in role workspace and never clear a session as a navigation side effect. The logo, Community, and primary mobile bottom tabs remain inside the authenticated shell; the compact header menu is session-only, and only its explicit Sign out action calls the logout endpoint.
- Public Community posts require one explicitly selected saved outfit, and the owner can unpublish any of them at any time from the feed. Each published piece gets a new public ID, while source outfit IDs, wardrobe IDs, account IDs, and S3 keys remain private. Images are served only through a post-scoped proxy. Exact brand links require registry evidence; user/AI labels remain visibly unverified.
- Recreate This Look is account-bound: the server ignores client wardrobe input and loads only the signed-in Consumer's DynamoDB partition. Exact ownership requires the same registry product ID; visual/style similarity can produce only a substitute. Its analytics event contains only the public post ID, event type, and timestamp—not a Consumer identity.
- A signed-in Consumer may intentionally save a public Look as Hanger inspiration. The private account record keeps only bounded style, color, category, subtype, public post ID, and public title fields—never creator identity, images, or another wardrobe. The Community partition receives only the aggregate like increment. Brands can see that aggregate but cannot learn who inspired it. Hanger uses these signals only as a fallback; current instructions override them.
- Shopping destinations are stored only on Brand-authorized product records, must be public HTTPS, and are revalidated at redirect time. The route accepts a product ID—not an arbitrary URL—so it cannot be an open redirect. Attribution events contain product/public-post references and timestamps, not Consumer identity.

## Brand boundary

Brands may access only products enrolled under their own authenticated account. Product wear metrics are built from connected garment records, then filtered by each owner’s current consent. Results are suppressed before calculation when fewer than 25 distinct opted-in owners qualify; many garments or wear events from one person count as one owner.

**What consent covers in time.** Consent is read when an aggregate is built, not when a wear is recorded. Turning sharing on therefore includes the person's **earlier** wear history for linked products — wear counts and wear events recorded before they opted in — and turning it off removes all of it from every aggregate built afterwards, at once. It cannot recall a figure a brand was already shown or exported. This is deliberate, and the app says so where the choice is made: the Anonymous brand insights switch, the verified-label note in the scan review, and the Privacy page each state that turning sharing on includes earlier wear and that turning it off stops it counting from then on.

**Small groups inside a released cohort.** Passing 25 protects the cohort, not a small group inside it: "6+ wears: 1 owner" describes one person. Every released owner count below five — and every count whose complement is below five, since "23 of 25 active" says as much about the other two — is withheld, and when one distribution bucket is withheld a second is too, so the total cannot give it back. Weekly wear counts of one to four, and totals under five with the average that would reveal them, are withheld as well. The latest wear is released as a day (noon UTC), never an instant. A withheld figure is `null` in the response, reads "withheld" on the dashboard and in exports, and is described to Brand Hanger as never to be estimated (`lib/metrics.ts`, `releaseWearAnalytics`).

Community intelligence is a separate public-activity dataset. It counts only products deliberately included in public Looks plus identity-free likes, recreate requests, and controlled outbound clicks. Consumer inspiration records remain in that Consumer's private partition and are never joined into Brand responses. A Brand may query Community aggregates only for its own enrolled product IDs, and the response contains no creator handles or account identifiers. This public-post aggregate does not bypass, join to, or lower the `k ≥ 25` threshold for private wear behavior.

To resist differencing and enumeration attacks, the production aggregate path also enforces a per-account budget: a brand can pull aggregates for at most six distinct products in any five-minute window (re-opening an already-viewed product costs nothing). The budget is six slots stored in DynamoDB under the brand's own partition, holding only product IDs and timestamps — no consumer data — and each is claimed with a conditional write, so requests sent at once cannot all pass the check before any is recorded. Requests over the budget receive a generic HTTP 429 that does not reveal which cohorts are near the threshold.

## Brand identity boundary

AI-read brand text is autofill, never verification. When garment analysis can read a brand name from a visible label or logo, that name only prefills the Consumer's editable brand-label field — the same trust level as the typed major-brand suggestion, just image-sourced. It is marked `suggested`/`ai-label-text`, carries an explicit "not a verified product link" warning, and can never produce verified status by itself, **even when a brand account or registry product already exists under that exact name**. Verified identity is granted exclusively by a registry match on GTIN or brand-plus-SKU evidence, unchanged by this feature and guarded by a regression test (`tests/brand-autofill.test.ts`).

## Image boundary

Consumer and Brand images are encrypted in an S3 bucket with all public access blocked. The browser receives short-lived signed URLs. Wardrobe save confirmation is HMAC-bound to the account, S3 key, garment fields, and registry result, preventing another browser from substituting an image or verified product connection.

## Location and weather

Hanger can check the weather, which means it can know roughly where someone is. That is kept as small and as local as the feature allows.

- **Home city.** A consumer may choose one in Settings. It is stored on their own profile as a place name and a coordinate rounded to two decimal places — about a kilometre — read only by their own Hanger, never placed in a brand aggregate or a Community post, removable at any time, and deleted with the account.
- **Shared location.** The Hanger chat offers "Use my location". Only when the person taps it does the phone share a position, at low accuracy, which is rounded to about a kilometre on the device before it is sent. It is used for that message's forecast and kept in the browser's session storage, so it ends when the browser session does. The server never stores it.
- **What leaves Racked.** To get a forecast, the rounded coordinate — and nothing else: no name, account, or wardrobe — is sent to Open-Meteo. A city search sends the typed city name to Open-Meteo's geocoder. Searches are rate-limited.
- **No forecast, no weather.** Without a location Hanger never states or guesses the weather. A forecast also never overrides weather the person states themselves.

Open-Meteo's free service is licensed for non-commercial use, which covers the competition build. Charging customers would require its commercial plan or another provider.

## Account security activity

Each account keeps its own security log for 90 days, then it expires: sign-ins, failed sign-in attempts on its email address, password and detail changes, and sign-outs from other devices. Each entry carries a coarse device label — "Safari on iPhone" — and **never an IP address or location**. Failed attempts are filed under a keyed hash of the email typed, written the same way whether or not that email has an account, so neither storage nor response time reveals which emails do; only the account's owner sees them. Shared rate-limit counters are likewise stored under keyed hashes, never an email or account id, and expire with their window.

## Data minimization

The matching and wear systems do not store protected demographic attributes. Brand analytics do not query names, email addresses, images, or full wardrobes. Password hashes and salts are never returned by application APIs.

Password recovery does not reveal account existence. Reset secrets are never stored directly: DynamoDB receives only a keyed HMAC derived with the private session secret. Tokens expire after 30 minutes, work once, and become invalid after any password change. SES delivery logs exclude the email address and token.

## Retention and deletion

A Consumer can delete their account from Settings with their current password and the typed word DELETE. Racked removes their Community posts, the wear events they recorded under brand products, every private photo their records reference, and every record under the account — the profile last, so an interrupted deletion is completed by retrying. Where the deployment grants `s3:ListBucket` on `wardrobe/<account>/`, a sweep also removes photos no record points at, such as those left by scans before unkept photos began to expire; without that permission those photos remain and the gap is logged.

A scan stores its photo and one crop per piece before the person has chosen anything, under `temp/wardrobe/<account>/`. The bucket's `DeleteTemporaryUploads` lifecycle rule deletes everything under `temp/` a day after it was written, and S3 applies expiry once a day, so a photo nobody keeps is gone within two days — also after the account is deleted — with nothing in Racked having to run. Keeping a piece copies its crop and the scan's photo out of `temp/` before the garment record is written (`lib/scan-storage.ts`). This depends on the live bucket having that rule; `docs/security-verification.md` shows how to check it. Brand aggregates are computed from live records on every request, so a deleted account's wears simply stop counting. Identity-free Community counts, such as likes and recreate requests, are not reduced. Brand account deletion is not yet available from Settings, because consumer wardrobes link to enrolled products and must be unlinked first. Security logs must exclude tokens, passwords, signed URLs, and image bytes.

Hanger's conversation is stored under the account: the recent turns, the style preferences stated in them, and the pieces already suggested. A remembered preference can only ever be a garment type, category, colour, or style that the controlled taxonomy and that person's own wardrobe already contain, so a sentence about health, body, or circumstances leaves nothing stored. The conversation can be cleared from the Hanger panel at any time, and account deletion removes it with the rest of the account's records.

A Consumer can also delete a single garment. Unlike deleting an outfit, this does retract the photo from their own Community posts: the photo itself is being deleted, and a post must never display an image that no longer exists. A post left with no garments is removed.

A Consumer may also delete an individual saved outfit. That owner-scoped action removes the private outfit record and best-effort deletes its generated board image. It deliberately retains historical wear events so past usage totals are not falsified, and it does not silently retract a Community snapshot the Consumer separately chose to publish.

## Known limitations

`DEMO`, `PILOT`, and `REGULAR` classifications prevent synthetic activity from being mistaken for real pilot evidence. A guarded pilot-classification script rejects synthetic accounts; demo records remain explicitly fictional in public Community output.

- Transparent garment isolation and flat-lay composition are not a full body-aware virtual try-on system.
- Crop quality is measured on seeded synthetic backdrops, not on a labelled corpus of real photographs. A strongly patterned backdrop still fuses with the garment and yields a loose crop; that limitation is carried forward from the previous pass and is recorded in `tests/garment-isolation.test.ts`.
- Brand enrollment confirms control of an account and supplied catalog evidence; a later business-verification workflow should validate legal brand authority.
- K-anonymity reduces re-identification risk but does not replace broader governance, audit logging, rate limits, and legal review.
