# Agent instructions

Two AI agents work on this repository at the same time: **Codex** (branches `codex/…`) and
**Claude Code** (branches `claude/…`). The owner merges every pull request. These rules keep the
two from overwriting each other, and keep a live product used by pilot brands safe.

Everything in [CONTRIBUTING.md](CONTRIBUTING.md) applies, above all its **hard boundaries** and its
verification gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:prod`).

## Working together

1. **One task, one branch, one pull request.** Branch from the latest `main`. Never push to `main`,
   never merge your own pull request, never force-push, and never commit to the other agent's branch.
2. **Stay in your lane** (below). If a task needs a file in the other lane, stop and say so in your
   pull request instead of editing it. A file not listed belongs to whoever touches it first; say
   which files you expect to change at the top of your pull request.
3. **Shared documents** — `README.md`, `PROGRESS.md`, `SECURITY.md`, `docs/competition-checklist.md`,
   `docs/demo-script.md`, `docs/one-page-summary.md` — are edited by both. Keep those edits small.
   Whoever's pull request is still open when the other merges brings `main` into their branch, keeps
   both sets of changes, recounts tests from a real run (`tests/readme-numbers.test.ts` checks the
   counts), re-measures any coverage figure the merge invalidated, and takes the next free
   `PROGRESS.md` phase number.
4. **Report what you ran.** State the real test count and every check you could not run. Never
   copy a number from an older document.

## Lanes

| Lane | Owns |
| --- | --- |
| **Codex** | `infra/`, `scripts/` (except `scripts/security-harness/`), new `tests/infra-*.test.ts` and `tests/script-*.test.ts`, and the AWS sections of `docs/aws-deployment.md` and `docs/security-verification.md` |
| **Claude Code** | `app/`, `components/`, `lib/`, `middleware.ts`, `next.config.ts`, `scripts/security-harness/`, and every other test file |

Lanes move only when the owner says so; update this table in the same pull request.

## Production safety

- Production is `https://main.d2iv0khybuuaeh.amplifyapp.com`, deployed from `main` by AWS Amplify.
  It holds real brands' accounts, products, images, and usage records. Never sign in there, create
  accounts, write test data, or load-test it. Live checks are read-only and unauthenticated; anything
  more uses a local build with synthetic data (`docs/security-verification.md`).
- Never print, log, or commit a secret, password, session value, or AWS credential — including the
  synthetic test password, which is supplied privately.
- AWS changes are the owner's to apply. A script that writes to AWS must do nothing unless an
  explicit opt-in variable is set, must default to a dry run that only counts, and must never touch
  `brand/` objects or a brand's records.
- Anything that adds a recurring AWS charge states its monthly cost in the pull request.
- After a merge, confirm `/api/version` reports the merge commit before calling it deployed.
