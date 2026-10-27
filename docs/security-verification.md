# Security verification

What was checked for the security work order of October 2026, where, and how to repeat it. Three
kinds of evidence are kept apart on purpose: **live** (read-only probes of the deployed site),
**local** (a production build run against a local DynamoDB with synthetic accounts), and **not
verified** (AWS settings this environment has no access to). Passing CI, an open pull request, or a
privacy threshold does not by itself show that the live app is secure.

## Live site — read-only, unauthenticated

Run against `https://main.d2iv0khybuuaeh.amplifyapp.com` after each deploy, once `/api/version`
reports the merged commit. No account was signed in to, and nothing was written except what an
anonymous visitor's request writes.

| Check | Result |
| --- | --- |
| Security headers on `/` | HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer policy, permissions policy (camera and location: self), COOP, CSP **report-only**; no `X-Powered-By` |
| Cross-site Origin on a write | 403 |
| Forged `X-Forwarded-Host` with a matching Origin | 403 |
| Forged `Host` | refused by CloudFront at the TLS handshake — never reaches the app (the app-level refusal is tested locally) |
| `Origin: null`; no Origin with `Sec-Fetch-Site: cross-site` | 403, 403 |
| 70 KB JSON body | 413 |
| Chunked body without a length | reaches the route (401): the platform presents a length to the middleware, so the 411 path is not reached live; the routes' capped readers count the bytes that arrive |
| CSP report endpoint | 204 |
| Link previews | `og:image` uses the production address (it pointed at `localhost:3000` before) |
| Public scripts (12 files, 524 KB) | no credential patterns, no server-only setting names, no ARNs, no source maps; `.map` files not served |
| `/.env`, `/.env.local`, `/.git/HEAD`, `/.git/config`, `/package.json`, `/.next/BUILD_ID` | 404 |
| `/api/version` | `commit` and `builtAt` only |

The probe scripts send a handful of GET and POST requests; they never stress the site.

## Local integration — synthetic accounts, local DynamoDB

`scripts/security-harness/` runs the real routes and the real store code against a production build.
Nothing in it can reach AWS: DynamoDB points at a local emulator and every other AWS endpoint at a
closed local port.

```bash
# 1. A DynamoDB emulator, installed outside the repository
npm install --prefix ../racked-dynalite dynalite@4.0.0
node scripts/security-harness/dynamo.mjs ../racked-dynalite racked-harness
# 2. A production build pointed at it (any throwaway 48-character SESSION_SECRET)
npm run build
SESSION_SECRET=... RACKED_TABLE_NAME=racked-harness RACKED_UPLOAD_BUCKET=racked-harness-bucket \
AWS_REGION=us-east-2 AWS_ACCESS_KEY_ID=harness-local AWS_SECRET_ACCESS_KEY=harness-local \
AWS_ENDPOINT_URL=http://127.0.0.1:9 AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:4568 \
AI_PROVIDER=bedrock AI_DAILY_CEILING=3 RACKED_ALLOWED_ORIGINS=http://localhost:3100 RACKED_PASSWORD_SCHEME=scrypt-n17 \
npx next start -p 3100
# 3. The checks
HARNESS_SESSION_SECRET=... node scripts/security-harness/integration.mjs
node scripts/security-harness/leak-check.mjs <run id printed by step 3>
```

dynalite does not implement `TransactWriteItems`, so the harness proxy emulates it all-or-nothing:
it snapshots each target item, applies each conditional write in order, and restores every snapshot
on the first failed condition, answering with DynamoDB's `TransactionCanceledException`. Production
uses DynamoDB's native transactions.

**Result on 2026-10-27: 58 of 58 checks passed, and the leak check passed.** The 11 two-step checks compute codes as an authenticator app does (RFC 6238) and wait for a fresh 30-second step whenever a code must be new, so they add up to about a minute and a half.

- **Sign-in.** Eight wrong passwords → 401 each; the ninth pauses the email (429). A browser without
  a known-device cookie is paused too — the lockout an attacker could otherwise cause — while the
  owner's known device signs in (200). Rotating made-up `X-Forwarded-For` addresses no longer resets
  the per-client limit. A copied known-device cookie used from ten addresses is refused after eight
  wrong passwords. An unsupported role at sign-up → 400.
- **Passwords.** An account seeded with an old-cost hash signs in, is re-hashed at N = 2^17 with a new
  salt (session version unchanged), and signs in again; a wrong password → 401. A new account is
  hashed at the current cost with an 18-byte salt. Median sign-in time for an unknown email, an old
  hash, and a new hash: 375, 362, and 399 ms.
- **Activity and sessions.** The owner sees eight failed attempts and the sign-ins; another account
  sees none of them; no entry holds an IP address. Signing out other devices ends the second session
  (403) and keeps this one (200).
- **Outfits.** Own pieces save (201); another account's piece, an `ownerId` field, 40 IDs, a string
  for a list, and a path-shaped ID are each refused (400); another consumer's edit and delete → 404.
  Saving records no wear.
- **Wears.** One wear counts once on each piece and the outfit; a retried request and a double tap
  answer `duplicate: true` and change nothing; a list including another account's piece is refused
  whole and nothing is counted; a privileged field → 400; another consumer cannot record on A's
  pieces or outfit (404); exactly one wear event reaches the brand product.
- **Consent, roles, brands.** Consent accepts only a boolean and no other field; consumers get 403 on
  brand routes and brands on consumer routes; Brand X gets 404 for Brand Y's analytics and cannot put
  Y's product in a Look.
- **Cohorts.** 24 consenting owners stay suppressed with the count withheld; A opting in makes 25
  distinct owners — A's 21 linked garments count once — and releases the aggregate; 6 non-consenting
  owners' 240 wears are absent; **A's wear recorded before opting in is counted once A opts in**; the
  latest wear is a day; a group of two heavy wearers is withheld; no owner ID, email, or garment
  appears in the response; withdrawing consent suppresses the cohort again at once.
- **Enumeration.** Twelve products opened at once: six released, six refused (429).
- **AI budget.** With the model unreachable and a ceiling of three calls, Hanger answered all three
  messages from the wardrobe; the third said the AI was paused. The site counter recorded five model
  calls attempted for three messages; the account counter recorded three messages.
- **Errors.** A malformed body gets a plain refusal. With S3 unreachable, a product enrollment fails
  with a generic message and an 8-character reference, and the server log line holds only that
  reference and the error's name. No log line in the run held an email, an IP address, or a request
  body.

The AI and privacy boundaries are also tested against the real code in `tests/ai-privacy-boundaries.test.ts`:
a model reply declaring a garment verified, injected tool calls (`record_wear`, `delete_account`,
`set_role`), tool arguments naming another account, an instruction hidden in a garment name, and a
browser-supplied answer replayed below the threshold all change nothing.

## CodeQL alert #9 — `js/insufficient-password-hash` on #171

CodeQL reported "Password from a call to consumePasswordReset is hashed insecurely" at
`lib/known-device.ts:22` on the analysis of #171's merge commit `5780810` (head `f506a8a`). The
SARIF trace has one path of 14 steps:

| Step | Location (at `f506a8a`) | Value |
| --- | --- | --- |
| Source | `app/api/auth/password-reset/confirm/route.ts:15` | the record returned by `consumePasswordReset(token, password)` |
| 3–5 | same file, line 21 | `account` → `account.email` |
| 6–7 | `lib/known-device.ts:43,46` | `knownDeviceCookie(email)` → `issueKnownDeviceToken(email)` |
| 8–10 | `lib/known-device.ts:25,26,21` | `emailTag(email)` |
| 11–13 | `lib/known-device.ts:22` | `email.trim().toLowerCase()` |
| Sink | `lib/known-device.ts:22` | `createHmac("sha256", secret).update(\`racked-known-device-email:${…}\`)` |

**The value at the HMAC is the account's email address**, normalised and prefixed — not a human
password and not the reset token. The record `consumePasswordReset` returns is the updated profile
(`ReturnValues: "ALL_NEW"`), which also holds the *new scrypt hash and salt*, never the plaintext;
CodeQL treats the whole return value of a function named for passwords as password data, and
property reads from it inherit that. The HMAC binds the cookie to an address; it is not password
storage. **A false positive.** It was not dismissed: `1c32726` reads the address from the profile
through `getAccount` instead, so nothing derived from the reset record is keyed into a cookie, and
the analysis of the next merge commit reports the alert *fixed* with 0 results.

Reviewing the alert properly also meant checking the two things it gestures at:

- **Password storage.** Every write — sign-up, password change, reset, and both seed scripts — uses
  scrypt with a fresh 18-byte `randomBytes` salt, and comparisons are constant-time. But every hash
  used Node's default cost, **N = 2^14, r = 8, p = 1 — an eighth of OWASP's minimum (N = 2^17)**.
  That was a real weakness. Every check now reads both costs (`lib/password-hash.ts`), doing one
  derivation at each so timing reveals neither account existence nor scheme; each hash records its
  scheme; at most two derivations run at once (≤ 256 MiB). The strong cost is switched on separately
  with `RACKED_PASSWORD_SCHEME=scrypt-n17`, because a release writing N = 2^17 hashes must never be
  rolled back to one that cannot read them; once on, old hashes are replaced at the strong cost on
  their owner's next sign-in. Measured locally: 76 ms at the old cost, 297 ms at the new.
- **The known-device cookie.** Issued on sign-up, sign-in, and a completed reset; HMAC-signed over
  its issue time and a keyed hash of the address, compared in constant time, refused if altered, for
  another address, from the future, or older than 180 days; `HttpOnly`, `Secure` in production,
  `SameSite=Lax`, path `/api/auth`. Its bypass covered the per-email pauses only — but a copied
  cookie could then guess one account's password from many addresses without limit. **A real gap:**
  each cookie now has its own budget of eight wrong passwords per fifteen minutes, past which it
  exempts nothing. Remaining limitations: a browser remembers one account at a time, and a cookie is
  not revoked by a password change (its budget still bounds it).

## Secrets and dependencies

- **Source and history.** The working tree and every line added in all 386 commits on every branch
  were scanned for AWS keys, private keys, GitHub, Slack, Google, Anthropic/OpenAI and Stripe tokens,
  and secret or password assignments. Nothing was found except one `SESSION_SECRET` in
  `.github/workflows/ci.yml`: a 50-character placeholder the CI build needs, used only by `pnpm build`
  in CI. It is not a credential **provided production uses a different value** (check below). No
  `.env` file was ever committed.
- **Build output.** All 67 client chunks of the production build contain no credential patterns or
  server-only setting names; no source maps are produced.
- **Dependencies.** `pnpm audit --prod` and the full `pnpm audit`: no known vulnerabilities. Next.js
  15.5.28 is deployed (it closed GHSA-2464-fhr4-w9xw and GHSA-p3m5-59mp-jv5r, live on 15.5.27 before
  #169).

## AWS configuration — not verified

This environment has no AWS credentials, so **none of the following is verified**; the template in
`infra/template.yaml` is not proof of live settings. Each item gives the command to run. The
commands only read, except where marked. Region `us-east-2`; Amplify app `d2iv0khybuuaeh`.

| Area | Command | Expected | Note |
| --- | --- | --- | --- |
| Names in use | `aws amplify get-branch --app-id d2iv0khybuuaeh --branch-name main --query "keys(branch.environmentVariables)"` then the values of `RACKED_TABLE_NAME` and `RACKED_UPLOAD_BUCKET` only | — | Never print the whole map: it holds `SESSION_SECRET` |
| CI placeholder not reused | `aws amplify get-branch … --query "branch.environmentVariables.SESSION_SECRET" --output text \| sha256sum` and compare with the hash of the CI value | hashes differ | compares without printing either value |
| Table TTL | `aws dynamodb describe-time-to-live --table-name $T` | `ENABLED` on `ttl` | **If disabled, enable (write):** `aws dynamodb update-time-to-live --table-name $T --time-to-live-specification Enabled=true,AttributeName=ttl`. No cost. Counters, reset tokens, wear guards and 90-day activity rely on it |
| Point-in-time recovery | `aws dynamodb describe-continuous-backups --table-name $T` | `ENABLED` | ≈ $0.20/GB-month of table size |
| Encryption, deletion protection | `aws dynamodb describe-table --table-name $T --query "Table.[SSEDescription,DeletionProtectionEnabled]"` | SSE on; `true` | |
| Runtime role | `aws amplify get-app --app-id d2iv0khybuuaeh --query app.computeRoleArn`, then `aws iam list-attached-role-policies` and `get-role-policy` on it | only the inline `RackedRuntimeDataAccess` actions | Wear transactions need only `PutItem` and `UpdateItem`; flag any `*FullAccess` or `AdministratorAccess` |
| Bucket exposure | `aws s3api get-public-access-block --bucket $B`; `get-bucket-policy-status`; `get-bucket-encryption`; `get-bucket-ownership-controls` | all four blocks true; not public; AES256; `BucketOwnerEnforced` | |
| Private links | (code) | 1 hour | `privateImageUrl` signs for 3,600 s |
| Unkept scan photos expire | `aws s3api get-bucket-lifecycle-configuration --bucket $B` | an enabled rule expiring prefix `temp/` after 1 day | Scans write under `temp/wardrobe/<owner>/`; keeping a piece copies it to `wardrobe/<owner>/`. **If the rule is missing and no other rules exist (write, free):** `aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration '{"Rules":[{"ID":"DeleteTemporaryUploads","Status":"Enabled","Filter":{"Prefix":"temp/"},"Expiration":{"Days":1}}]}'`. This replaces every rule on the bucket, so if others exist, include them too. Never use a prefix other than `temp/`: kept photos live under `wardrobe/` and `brand/`. Photos left by scans before #173 stay under `wardrobe/<owner>/` until account deletion; brand photos stay while the product exists |
| Image backup | `aws s3api get-bucket-versioning --bucket $B` | — | Not in the template. Versioning with noncurrent versions expiring after 30 days would let a deleted photo be restored; cost is the size of deleted/overwritten photos for 30 days |
| Staging separation | `aws amplify list-branches --app-id d2iv0khybuuaeh --query "branches[].branchName"`, and each branch's `RACKED_TABLE_NAME` | production alone on the production table and bucket | |
| Alarms and destination | `aws cloudwatch describe-alarms`; `aws sns list-subscriptions` | alarms below exist; the email subscription is `Confirmed` | |

**Alarms to add** (CloudWatch standard alarms are $0.10 each a month; metric filters and SNS email
are free at this volume; two AWS Budgets are free):

1. 5xx spike — `AWS/AmplifyHosting` `5xxErrors` for the app.
2. Sign-in abuse — metric filter on the compute log group for `Sign-in pause engaged`.
3. AI spend — metric filter for `AI site ceiling reached`, plus an AWS Budget on Amazon Bedrock cost.
4. Quota-store failure — metric filter for `AI budget unavailable; failing closed` and `Shared limit unavailable; failing open`.
5. Storage — `AWS/DynamoDB` `ThrottledRequests` and `SystemErrors` on the table; `AWS/S3` `BucketSizeBytes` growth.

**Restore test (writes only to a new table; never overwrites production):**

```bash
aws dynamodb restore-table-to-point-in-time --source-table-name $T \
  --target-table-name racked-restore-test-20261026 --use-latest-restorable-time
# wait for ACTIVE, then confirm a known synthetic record (for example the seeded DEMO cohort) is present
aws dynamodb get-item --table-name racked-restore-test-20261026 --key '{"PK":{"S":"..."},"SK":{"S":"PROFILE"}}' --query "Item.PK"
aws dynamodb delete-table --table-name racked-restore-test-20261026
```

A restore is charged per GB restored (cents at this size) plus the restored table's storage until it
is deleted.

## Rollout and rollback

Merges follow `CONTRIBUTING.md`: GitHub validation and CodeQL pass, then merge, then confirm
`/api/version` reports the merge commit and spot-check the live site.

| Version | Commit | Note |
| --- | --- | --- |
| Before #169 | `cd9aa2a` | Next.js 15.5.27 (vulnerable) |
| #169 | `e96ca5b` | Next.js 15.5.28 |
| #170 | `9f8dbd5` | headers, origin guard, body caps, clean photos — verified live |
| #171 | `8035621` | shared limits, AI budgets, activity log, bot trap — verified live |
| #172 | `075a2f6` | input checks, wears counted once, small groups withheld, password schemes — verified live |
| #173 | `9798ee1` | sharing wording; unkept scan photos expire. Rolling back is safe: a scan made before the rollback and kept after it is refused and must be scanned again |
| #179 | — | two-step sign-in for brand accounts. Rolling back is safe but quietly weaker: an older release ignores the `twoStep*` attributes, so the password alone signs in until this release is back, when every enrolled authenticator works again unchanged |

**Rollback.** Fastest: in the Amplify console, redeploy the previous successful build of `main`.
Durable: `git revert -m 1 <merge commit>` in a pull request. The new records these changes write —
budget slots, wear guards, request IDs, AI call counters — are additive and expire through `ttl`;
rolled-back code ignores them. The old `AGGQ#…/PRODUCT#…` budget log is left in place, so a rollback
resumes using it. **Passwords:** until `RACKED_PASSWORD_SCHEME=scrypt-n17` is set, every hash is one
the previous release can read. Once it is set, accounts that sign in are re-hashed at N = 2^17, which
releases before this one cannot verify: from then on, roll back to this release (or later), never
earlier — or unset the variable first, which stops further upgrades but cannot undo those already made.

**Live checks that need a real sign-in** (synthetic accounts, after each deploy): sign-in and reset;
a scan; garment save and edit; outfit save; record a wear and tap it twice quickly — one wear;
consent on and off; brand enrollment; a released product shows "withheld" for small groups; Hanger
answers.

## Open decisions

- **Consent history — decided.** Opting in includes wear recorded before opting in; the owner kept
  it, and the app now says so (#173).
- **Retention — decided.** Unkept scan photos expire under `temp/` within two days (#173), once the
  live rule above is confirmed.
- **Differencing over time.** Exact totals can be watched as they change; no noise is added.
- **CSP** is report-only; **WAF** is not in place; there is **no malware scanning** of uploads.
