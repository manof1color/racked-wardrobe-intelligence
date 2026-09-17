# Work order — launch follow-ups (executor: ChatGPT / Codex · reviewer: Claude)

Opened 2026-09-16. These items follow [Claude's launch-blocker work order](claude-launch-blockers.md)
and must start from a `main` that already contains garment and consumer account deletion.

## How to work

- **One item, one branch, one PR.** Branch `codex/<item-id>`; never commit to `main`.
- **Read first:** README "Security and Privacy Boundaries", `docs/privacy-and-ethics.md`, and the
  existing tests for the area you touch.
- **Gate:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:prod` — all green,
  with the summary pasted into the PR.
- **Every behaviour gets a regression test that would fail if the behaviour broke.** Test the code a
  page actually renders or a route actually calls. (#113 edited and tested a component no page
  rendered; that test proved nothing.)
- **Patch hygiene:** after any scripted edit, scan changed files for raw control characters and for
  regexes that lost their backslash (`\s` written as `s`). (#115 nearly shipped a filter that deleted
  every letter "s".)
- **Docs in the same PR:** README where behaviour is described, a PROGRESS phase, the competition
  checklist.

## Never

- Weaken authentication, role checks, or rate limits.
- Give brands names, emails, photos, raw wardrobes, or owner IDs; change the `k >= 25` threshold.
- Let typed or AI-read text create verified brand identity — only GTIN or brand+SKU registry evidence does.
- Commit secrets, signing keys, or AWS credentials.
- Add a dependency without saying why in the PR.
- Present `DEMO` records as real, or claim try-on, fit prediction, sales lift, or purchase intent.

---

## X1 — Brand account deletion

**Today:** `DELETE /api/account` returns 409 for brand accounts.

**Spec:**
- Same request contract as consumer deletion: current password plus the typed word `DELETE`.
- Removes the brand's records (profile last), its `AGGQ#<owner>` enumeration-budget records, its
  Brand Look posts in `COMMUNITY`, `WEAR#` events under each of its `PRODUCT#` partitions, and objects
  under `brand/<owner>/`. Reuse `ownedObjectKey` and the ordering pattern in `lib/deletion-plan.ts`.
- **Consumer data is never deleted.** Consumer garments verified against a deleted product are found
  through `GSI1` (`GSI1PK = PRODUCT#<id>`) and degraded: clear `registryProductId` and `GSI1PK`, set
  `identityStatus` to `user-labeled`, keep the consumer's own brand text.
- Consumer Community posts whose `publishedGarments[].verifiedProduct` points at a deleted product:
  remove `verifiedProduct`, set `resolutionState` to `GENERIC_UNVERIFIED`, keep `unverifiedBrandLabel`.
- Retry-safe ordering: dependants first, the brand profile last.
- Settings: replace the "not in Settings yet" note with the working form.

**Tests:** pure planning helpers unit-tested; step order checked inside the store function; a
REGRESSION test proving a brand deletion deletes no consumer record.

## X2 — Merge Looks into Outfits

- Bottom bar becomes **Today · Closet · Outfits · Community · +**.
- Outfits shows saved outfits with a primary **Build a look** that opens the existing `OutfitBuilder`.
- Links to the old Looks view still land on the builder (see `lib/workspace-navigation.ts`).
- Tab labels at least 0.6rem.
- No change to outfit save, wear, or delete APIs.

**Tests:** update `workspace-navigation` and navigation tests; assert five items and the
Looks-to-builder redirect.

## X3 — Download my data

- `GET /api/account/export` returns a JSON attachment of the signed-in account's own profile (never
  `passwordHash`, `passwordSalt`, `sessionVersion`, or DynamoDB keys), garments with one-hour signed
  image links instead of storage keys, outfits, wear counts, consent, saved inspiration, and its own
  Community posts in their public shape.
- Rate limited. A **Download my data** button in Settings.

**Tests:** no secret or storage-key field can appear; the export is scoped to `session.subject`.

## X4 — Android packaging preparation (no store submission)

- `app/.well-known/assetlinks.json/route.ts` serves Digital Asset Links from `ANDROID_APP_PACKAGE`
  and `ANDROID_SHA256_CERT_FINGERPRINTS` (comma-separated), and returns 404 when either is unset.
  Register both names in `scripts/write-amplify-env.mjs`.
- `docs/android-twa.md`: Bubblewrap steps, where the signing key lives (never in the repo), and the
  Play closed-testing plan (12 testers, 14 consecutive days).

**Tests:** response shape; 404 when unconfigured; no fingerprint committed anywhere.

---

## X5 — Closet audit: search, sort, and "not worn lately"

**Why:** a closet is only useful if people can find a piece and see what they ignore. Today the
Closet filters by category and nothing else. This is also the exact screen a creator records for
the TikTok "closet audit" content pillar, so it earns its place twice.

**Spec** — Closet view in `components/consumer-dashboard.tsx`, above the garment grid:

- **Search** box. Case-insensitive; matches name, `customType`, the subtype's display label, colour,
  and brand text. It combines with the existing category filter.
- **Sort**: Recently added (default), Most worn, Least worn, Longest since worn.
  - Recently added orders by `createdAt`, newest first; items without `createdAt` follow the dated
    ones in the order the server returned them.
  - Ties keep the server order, so the grid never reshuffles between renders.
- **Not worn in 60+ days** toggle. A piece counts as not worn when `wearCount` is 0 or
  `lastWornDays` is at least 60; `NEVER_WORN_DAYS` (999) in `lib/wear-recency.ts` means never worn.
- **Audit line**, for example "12 of 41 pieces haven't been worn in 60 days". Always computed across
  the whole wardrobe, never just the filtered view.
- When nothing matches: a plain empty state with a **Clear filters** button.
- All logic lives in a new pure module, `lib/closet-view.ts` (`filterWardrobe`, `sortWardrobe`,
  `closetAudit`). The dashboard only holds state and calls it.
- No API, database, or type changes. It works entirely on the wardrobe the Closet already loads.
- Accessible and readable: a labelled search input, sort as a labelled `<select>`, the toggle as a
  real checkbox or a button with `aria-pressed`, nothing under 0.72rem, and it works at 390px wide.

**Tests** — `tests/closet-view.test.ts`:
- search matches each field and combines with the category filter
- every sort order, including ties and items without `createdAt`
- never-worn pieces count as not worn in 60+ days
- the audit count ignores active search and filters
- the dashboard actually calls the helpers and renders **Clear filters** (a source check on the
  rendered component, not a dead one)

**Out of scope:** Hanger, brand-side views, new data fields, server changes.

---

## X6 — Session and auth: behavioural tests for the paths that protect everything else

**Why:** a reviewer asked whether the scoring engine was tested as rigorously as the auth layer.
Measuring it showed the opposite of the worry: the decision engines sit at 94–100% branch coverage,
while `lib/session.ts` sits at **76%** with two tests, and `lib/auth.ts` has no test file of its own.
Session handling is what protects every privacy boundary in the product, so it should be the
best-tested module in the repo, not the weakest.

**Spec** — new `tests/session-guards.test.ts` (plus additions to `tests/session.test.ts` if it reads
better there). Behavioural tests only; do not change the session or auth implementation unless a
test exposes a real defect, and if it does, fix it in the same PR and say so in the PR body.

Cover, at minimum:
- a valid token round-trips and yields the same subject, role, and expiry
- a token with a tampered payload is rejected
- a token with a tampered or truncated signature is rejected
- a token signed with a different secret is rejected
- an expired token is rejected, including exactly at the expiry boundary
- a malformed token (wrong segment count, empty string, non-base64) is rejected rather than throwing
- an unknown or missing role is rejected
- `sessionVersion` mismatch is rejected, and a session issued before a password change stops working
  (this is how "other sessions are invalidated" is enforced — see `updateOwnAccount`)
- `getSession` returns null when the account no longer exists (the deletion path depends on this)
- `requireRole` sends a signed-in Consumer away from Brand routes and vice versa

**How to test `getSession` without AWS:** it calls `getAccount`. Either inject the lookup, or test
the decision logic it applies (role match, session version, missing account) as a pure helper
extracted from it. If you extract a helper, it must be the same code the route path uses — no
parallel copy.

**Done when:** `lib/session.ts` branch coverage is at least 95%, measured with
`node --experimental-strip-types --test --experimental-test-coverage tests/*.test.ts`, and the PR
body quotes the before and after numbers for that file.

**Out of scope:** password hashing changes, new auth features, rate-limit changes, anything that
alters how sessions are issued or validated in production.

---

## Review

Claude reviews each PR before merge against: the spec above; tests that genuinely fail when the
behaviour breaks; no edits to unreachable code; none of the "Never" list; no control characters or
lost escapes; honest docs; green CI. Findings go on the PR, and nothing merges until they are resolved.
