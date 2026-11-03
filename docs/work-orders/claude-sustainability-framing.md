# Work order — sustainability framing on the public landing page

**Executor:** Claude Code  
**Reviewer:** Codex  
**Owner request:** 2026-11-03  
**Branch:** start from the latest `main` after the documentation PR containing
`docs/sustainability-and-business-impact.md` has merged.

## Objective

Make Racked's existing consumer, brand and pilot story visibly answer one question on the public main
page: **how does using clothing more, and learning what earns repeat wear, create environmental and
monetary value?** This is a framing and evidence task, not a new platform build.

## Why this belongs in Claude's lane

`app/page.tsx`, landing-page styles, components and their tests belong to Claude Code under
`AGENTS.md`. Codex owns the evidence document and judge-facing wording; Claude owns the public UI
implementation.

## Required changes

### 1. Preserve the current hero and add one sustainability sentence

Keep the primary value proposition and privacy statement. The hero must still communicate within one
viewport:

- consumers get more from clothing they already own;
- brands learn what earns continued wear; and
- no brand sees a person's closet.

Do not turn the hero into a list of statistics. One sentence may connect the loop to lower-waste,
better-informed decisions.

### 2. Add a compact, sourced impact section

Place it after the current blind-spot story or audience cards, wherever the existing page hierarchy
tests best. Use no more than three evidence points:

1. **26%** of the average wardrobe in a large UK study had not been worn in the previous year.
2. Clothing production doubled from 2000 to 2015 while utilization fell **36%**.
3. Two real apparel brands have agreed to the pilot, created accounts and uploaded products.

Every external number needs a visible source link. The first must say **UK study**; never present it as
a worldwide average. Do not use the unsupported "people wear only 20% of their wardrobe" claim.
The pilot point must use the existing evidence-gated pilot helper rather than duplicating brand state
in a component.

### 3. Include the founder's Kenya origin without overstating it

Add a short first-person or attributed sentence: James began Racked after seeing clothing waste while
in Kenya. Link the broader context to the official Kenya circular-economy source already recorded in
`docs/sustainability-and-business-impact.md`. Do not imply that the Kenyan government, UNEP or any
Kenyan organization endorses Racked.

### 4. Show the two-sided value chain

The section should make this relationship scannable:

```text
use more of what is owned
→ confirmed repeat-wear and pairing evidence
→ privacy-safe brand insight
→ better-informed restocking, production, merchandising and campaigns
```

The language is **can inform**, not **reduces** or **prevents**. Racked has not measured avoided waste,
production, emissions, sales lift or return on investment.

### 5. Add a restrained monetary illustration

Use the proposed Standard price from the existing canonical pricing source. If the UI can derive the
annual price without duplicating it, show:

> At $149/month, avoiding roughly 72 excess units at a $25 landed cost would equal one year of the
> proposed plan.

It must be labeled **illustrative break-even**, not ROI, savings, forecast or pilot result. If deriving
the price cleanly would create coupling or duplicate parsing logic, omit the arithmetic from the main
page and link to the evidence document instead.

### 6. Make the pilot evidence prominent but exact

The existing landing page already calls `landingPilotLine()`. Keep that evidence gate. Visually place
the line where it supports the impact story, but preserve the exact distinction:

- proved: two brands agreed to participate, created accounts and uploaded products;
- not proved: written confirmation, pricing acceptance, payment, recurring usage or ROI.

## Follow-up measurement task — separate PR

Do not start this work in the landing-page PR. The repository trace in
`docs/sustainability-and-business-impact.md` found:

- garment records already retain `createdAt`, `wearCount` and `lastWornAt`;
- `isRediscovered` already identifies the 60-day condition;
- `recordRealWear` already calculates and returns the rediscovered count; but
- the private totals record does not persist a rediscovery total, and a garment keeps only its latest
  wear timestamp, so historical return-to-rotation events cannot be reconstructed reliably.

Propose a second PR that:

1. Adds `rediscoveredTotal` to the existing private `POINTS` record with an atomic `ADD` in the same
   transaction as the wear, only when `award.rediscovered.length > 0`.
2. Keeps the value consumer-private, independent of brand-sharing consent, unreachable from Brand
   routes and deleted with the account.
3. Extends `GET /api/points` with the all-time total and presents it as **pieces recorded back in
   rotation after 60+ days**, never as avoided waste or purchases.
4. Tests concurrency, duplicate requests, daily repeats, capped points, account deletion, DEMO
   separation and Brand-route non-access. A retry or double tap must not increment the counter twice.
5. Does not attempt to backfill historical rediscoveries. The UI and documentation must state when
   counting began.

A third, owner-approved evidence task may produce an aggregate report from consenting non-DEMO study
accounts. It must publish the observation dates, account and piece denominators, exclusions and the
fact that unlogged wears are invisible. Codex should own any dry-run-by-default reporting script under
`scripts/`; Claude should own the production record, route, UI and ordinary tests.

## UX and accessibility requirements

- Keep one dominant hero CTA.
- At 390 × 844, the first viewport must still communicate consumer value, brand value and privacy.
- Statistics cannot rely on color or animation to be understood.
- Source links need meaningful accessible names and visible keyboard focus.
- Respect reduced motion and existing reveal behavior.
- Avoid a fourth visually competing card row if the existing page becomes denser; consolidate instead.
- Verify 200% zoom, keyboard navigation and no horizontal overflow.

## Tests and verification

- Add focused tests in Claude's lane proving the UK scope qualifier, source URLs, claims boundary and
  use of the evidence-gated pilot helper.
- Update accessibility fixtures only if the real landing page requires it.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:prod` and the landing-page
  accessibility checks.
- Capture 390 × 844 and 1440 × 900 screenshots in the pull request.
- Do not update test counts in shared documents from memory; use the real run.

## Acceptance criteria

A fresh reviewer should be able to answer these after ten seconds on the landing page:

1. Why does wardrobe underuse matter?
2. What does Racked do for a person?
3. What does Racked do for a brand?
4. How could that create monetary value?
5. What have the two real pilot brands actually done?
6. What impact has Racked **not** yet proved?

The task is complete only if all six answers are visible or reachable without creating a new claim.
