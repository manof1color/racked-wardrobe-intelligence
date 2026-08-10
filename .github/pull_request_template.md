## What changed

## Why it matters to the competition rubric

## Validation

Report real command output, not intent. If something could not be verified, say so plainly rather than leaving the box implied.

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test` (state the pass/total count from the run)
- [ ] `pnpm build`
- [ ] `pnpm audit:prod`
- [ ] Full diff reviewed; touches only what this change intended
- [ ] Any test file plausibly affected was run in isolation first
- [ ] Pre-existing functionality re-checked, not just the new feature

## What could not be verified

<!-- e.g. a Bedrock-dependent path with no test AWS credentials, or UI behavior with no component-test harness. Leave "nothing" if everything was confirmed. -->

## Safety review

- [ ] No secrets, credentials, PII, or real customer data
- [ ] Demo/synthetic claims remain labeled
- [ ] Privacy and role boundaries remain enforced (consent, `k ≥ 25`, enumeration budget, product ownership)
- [ ] Brand verification still requires registry GTIN or brand-plus-SKU evidence
- [ ] Documentation claims in this PR were verified against current code, not carried forward

## Post-merge

- [ ] AWS Amplify deployed this merge from `main` (confirmed, not assumed)
- [ ] Live production URL spot-checked
