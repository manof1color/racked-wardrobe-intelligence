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

## Review

Claude reviews each PR before merge against: the spec above; tests that genuinely fail when the
behaviour breaks; no edits to unreachable code; none of the "Never" list; no control characters or
lost escapes; honest docs; green CI. Findings go on the PR, and nothing merges until they are resolved.
