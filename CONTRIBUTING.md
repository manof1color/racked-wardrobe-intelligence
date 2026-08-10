# Contributing

Keep every change easy for judges to follow: one focused branch, one coherent change, one reviewable pull request.

## Workflow

1. Confirm a clean working tree and pull the latest `main`.
2. Create a focused branch (`feat/…`, `chore/…`, `docs/…`, `security/…`).
3. Read the current contents of every file you intend to change. Treat documentation as unverified until checked against real code — several docs in this repository have described features that were not yet built.
4. Make the change and add or update tests alongside it.
5. Update the documentation that the change actually affects, including this repository's judge-facing docs.
6. Run the full gate below and fix failures before committing.
7. Review the complete diff. It must touch only what the change intended.
8. Commit with a descriptive message (`feat: add explainable product matching`).
9. Open a pull request using the template, filling in what was verified and what could not be.
10. Wait for GitHub validation and CodeQL. Merge only after both pass.
11. Confirm AWS Amplify deployed the merge from `main`, then spot-check the live URL.

## Verification gate

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:prod
```

All five run in CI on every push and pull request. Report the real test count from your run rather than copying a number from an older document. If a change plausibly affects an existing test file, run that file in isolation first, then the whole suite.

## Hard boundaries

These are not style preferences. A change that weakens one should be closed rather than merged.

- Never commit `.env.local`, credentials, AWS keys, session values, PII, real customer data, copied product imagery, or unlicensed catalog data.
- Never weaken authentication or role checks. Consumers reach only their own wardrobes, outfits, conversations, and photos; brands reach only their own registered products.
- Preserve explicit consumer consent and the `k ≥ 25` aggregate-release threshold, and keep the product-enumeration budget in place.
- Brands must never receive names, emails, photos, raw wardrobes, owner identifiers, individual rows, or cohort membership.
- Consumer-entered or AI-read brand text must never create verified brand identity. Verification stays tied to registry GTIN or brand-plus-SKU evidence.
- Keep synthetic records clearly labeled, and never present the demo cohort as commercial evidence.
- Do not claim photorealistic virtual try-on, body-fit accuracy, sales lift, purchase intent, demographic inference, or production-scale validation.

## Documentation expectations

Only write a claim you just verified: a test count from a run you performed, a behavior you confirmed by reading the code or exercising it, a deploy status you checked against the live URL. If you notice an untrue claim while working on something unrelated, fix it in the same pull request.

Judge-facing documents worth keeping current: [README](README.md), [PROGRESS.md](PROGRESS.md), [competition checklist](docs/competition-checklist.md), [architecture](docs/architecture.md), [backend API](docs/backend-api.md), [AI use log](docs/ai-use-log.md), [privacy and ethics](docs/privacy-and-ethics.md), and the [presentation script](docs/demo-script.md).
