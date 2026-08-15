# Progress log

A judge-facing summary of how Racked was actually built, sourced from the repository's real merge history (`git log --merges`). Every entry below is a merged, CI-validated pull request on this public repository; nothing here is projected or invented.

## Phase 1 — Foundation (2026-08-03 → 2026-08-04)

- Initial commits: Next.js competition foundation, explainable wardrobe matching, rubric/AWS documentation.
- [#1](https://github.com/manof1color/racked-wardrobe-intelligence/pull/1) Automated repository security maintenance (CI, CodeQL, Dependabot).
- [#10](https://github.com/manof1color/racked-wardrobe-intelligence/pull/10) Front-first garment scanning.
- [#11](https://github.com/manof1color/racked-wardrobe-intelligence/pull/11) Installable consumer PWA.

## Phase 2 — Real AWS production platform (2026-08-08)

- [#12](https://github.com/manof1color/racked-wardrobe-intelligence/pull/12) Privacy-safe real vision garment analysis (Bedrock).
- [#14](https://github.com/manof1color/racked-wardrobe-intelligence/pull/14) Amplify SSR session configuration fix.
- [#15](https://github.com/manof1color/racked-wardrobe-intelligence/pull/15) Live AWS deployment documented.
- [#16](https://github.com/manof1color/racked-wardrobe-intelligence/pull/16)–[#21](https://github.com/manof1color/racked-wardrobe-intelligence/pull/21) Real AWS-backed production data: accounts, uploads, persistence, honest landing content, mobile registration fix, resilient Bedrock analysis, testable Consumer Hanger cohort.
- [#22](https://github.com/manof1color/racked-wardrobe-intelligence/pull/22) Mobile-safe uploads and brand wear analytics.

## Phase 3 — Conversational Hanger (2026-08-09)

- [#23](https://github.com/manof1color/racked-wardrobe-intelligence/pull/23) Hanger became a contextual multi-turn conversation with fresh server-side context per message.
- [#24](https://github.com/manof1color/racked-wardrobe-intelligence/pull/24) Aggregate-only brand strategy enforcement (server-side output review).

## Phase 4 — Security hardening and feature build-out (2026-08-09 → 2026-08-10)

- [#25](https://github.com/manof1color/racked-wardrobe-intelligence/pull/25) Security hardening: community API responses rebuilt from a public-field allowlist; product-enumeration budget enforced on the production aggregate path (DynamoDB-backed); sliding-window rate limits on auth, AI, metrics, and community endpoints. Verified live (11th rapid sign-in attempt receives HTTP 429).
- [#27](https://github.com/manof1color/racked-wardrobe-intelligence/pull/27) Doc accuracy (real test counts), all four pre-existing `tsc --noEmit` errors fixed and type checking wired into CI, saved-outfit wear totals actually increment, and a Saved Outfits tab with one-tap "Wear this again".
- [#28](https://github.com/manof1color/racked-wardrobe-intelligence/pull/28) Garment auto-crop for display with the unmodified evidence photo preserved separately and tested fallbacks.
- [#29](https://github.com/manof1color/racked-wardrobe-intelligence/pull/29) Avatar replaced by the mobile-first Looks outfit slide view (horizontal carousel of cropped garment photos); outfit save/wear APIs unchanged.
- [#30](https://github.com/manof1color/racked-wardrobe-intelligence/pull/30) Adaptive photo classification agent: the first photo is AI-classified and enrollment requests only the shots that category needs (sole for footwear, hallmark for jewelry) with visible reasoning and user override; verification evidence unchanged, regression-tested.
- [#31](https://github.com/manof1color/racked-wardrobe-intelligence/pull/31) AI brand-name autofill from photos — suggestion only; regression tests prove AI-read brand text can never create verified status, even for enrolled brands.
- [#32](https://github.com/manof1color/racked-wardrobe-intelligence/pull/32) Planned business model and the labeled, not-billed `/pricing` page.
- [#33](https://github.com/manof1color/racked-wardrobe-intelligence/pull/33) One-page README navigability pass — embedded architecture diagram, key-file map, and rubric-evidence table — plus this progress log sourced from real merge history.
- [#34](https://github.com/manof1color/racked-wardrobe-intelligence/pull/34) Documentation refresh across README, CONTRIBUTING, SECURITY, the PR/issue templates, architecture, and the demo script to match shipped behavior.

## Phase 5 — Recognition V2, social commerce, and independent evaluation (2026-08-12 → 2026-08-13)

- [#35](https://github.com/manof1color/racked-wardrobe-intelligence/pull/35) Garment Recognition V2: controlled subtypes, uncertainty alternatives, multi-view reasoning, manual correction, and a registry-only identity boundary; 82 tests and CodeQL passed.
- [#36](https://github.com/manof1color/racked-wardrobe-intelligence/pull/36) Saved-outfit product-resolution contracts and privacy-safe Community publishing: public garment IDs, selected-outfit-only publication, and a post-scoped image proxy; 85 tests and CodeQL passed.
- [#37](https://github.com/manof1color/racked-wardrobe-intelligence/pull/37) Recreate This Look: explainable exact/substitute/missing matching against only the signed-in wardrobe, with deterministic scoring and identity-free request events; 90 tests and CodeQL passed.
- [#38](https://github.com/manof1color/racked-wardrobe-intelligence/pull/38) Controlled commerce and Brand Looks: server-validated outbound product destinations (HTTPS-only, no private hosts, no client-supplied URLs) and brand-composed looks restricted to the brand's own enrolled products.
- [#39](https://github.com/manof1color/racked-wardrobe-intelligence/pull/39) Privacy-safe brand community intelligence and `DEMO`/`PILOT`/`REGULAR` data classification, with public-activity metrics kept separate from the private `k ≥ 25` wear cohort; 96 tests and CodeQL passed.
- [#40](https://github.com/manof1color/racked-wardrobe-intelligence/pull/40) Brand Hanger grounded in public community activity alongside released wear aggregates.
- [#41](https://github.com/manof1color/racked-wardrobe-intelligence/pull/41) Independent garment-evaluation benchmark: an external second-hand-fashion corpus adopted for measurement only, explicitly not training data, with scoring/audit scripts and a strict no-accuracy-claim-without-a-report rule.

## Phase 6 — Competition-ready product experience (2026-08-13)

- [#42](https://github.com/manof1color/racked-wardrobe-intelligence/pull/42) Corrected stale current-state test counts and completed this progress log through #41.
- [#43](https://github.com/manof1color/racked-wardrobe-intelligence/pull/43) Community 2.0: outfit-first feed, in-app Shop the Look inspection sheet with exact/similar/unverified/unavailable separation, plain-language Recreate results, and quiet demo-provenance labels.
- [#44](https://github.com/manof1color/racked-wardrobe-intelligence/pull/44) Public brand pages split into Products, Brand Looks, and Community Looks with a tested provenance guarantee; Brand Look builder grouped by garment slot with a live preview.
- [#45](https://github.com/manof1color/racked-wardrobe-intelligence/pull/45) Brand dashboard rewritten around business questions, with a regression test forbidding sales/revenue/conversion/intent/causation language in brand-facing copy.
- [#46](https://github.com/manof1color/racked-wardrobe-intelligence/pull/46) Post-purchase landing story and the business flywheel visual.

## Phase 7 — Similar-product demo commerce (2026-08-14)

- [#51](https://github.com/manof1color/racked-wardrobe-intelligence/pull/51) implements the registry-only Similar Products endpoint, activates `SIMILAR_AVAILABLE`, adds fictional demo commerce metadata, and adds a deterministic second Recreate Consumer.
- [#52](https://github.com/manof1color/racked-wardrobe-intelligence/pull/52) corrects the demo footwear category to the canonical `shoe` value; the production seed was rerun and the documented exact + strong substitute + missing Recreate result was verified live.

## Phase 8 — Multi-piece Consumer intake (2026-08-15)

- [#55](https://github.com/manof1color/racked-wardrobe-intelligence/pull/55) adds one-photo, up-to-eight-piece Bedrock detection with private per-piece crops and human confirmation, preserves three-view verification, and gives Consumers direct desktop/mobile Community navigation.

## Phase 9 — Authenticated mobile continuity and item cutouts (2026-08-15)

- [#59](https://github.com/manof1color/racked-wardrobe-intelligence/pull/59) keeps the logo and Community inside each authenticated role workspace, adds stable Consumer deep links and role-aware Community bottom navigation, and prepares each detected piece as an independent private display image with conservative transparent-background removal and a tested opaque fallback. All three GitHub checks passed, AWS Amplify deployed the merge, and the Consumer session redirects, Add deep link, role-home wordmark, and mobile Community bar were verified live.

## Phase 10 — Compact authenticated app menu (2026-08-16)

- [#61](https://github.com/manof1color/racked-wardrobe-intelligence/pull/61) adds a role-specific mobile header menu above the persistent bottom tabs, keeps every shortcut inside the authenticated Consumer or Brand workspace, and makes failed logout requests preserve the active session honestly. The focused route contract and full 151-test suite pass locally; CI, deployment, and live visual checks are recorded on the PR.
- [#62](https://github.com/manof1color/racked-wardrobe-intelligence/pull/62) fixes the mobile menu's production CSS specificity conflict and adds a regression contract proving the authenticated dropdown overrides the older header-navigation hide rule.

## Continuous verification

Every merged PR above ran `pnpm lint`, `pnpm test`, `pnpm build`, and a production dependency audit in CI (`pnpm typecheck` joined the pipeline at #27), passed CodeQL, and was deployed by AWS Amplify from `main` with the live URL spot-checked after each merge. Through #62, the repository carries **152 passing tests** (re-verified 2026-08-16). The authenticated Consumer route, public-route session redirects, Add deep link, and mobile Community navigation were confirmed live after #59; the compact menu's post-fix production visual check, a live Brand-session return-path check, and a physical-iPhone whole-look/cutout retest remain explicit device/account follow-ups.
