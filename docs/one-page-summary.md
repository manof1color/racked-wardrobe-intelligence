# Racked — one-page summary

**James Harris · [Live app](https://main.d2iv0khybuuaeh.amplifyapp.com) · [Repository](https://github.com/manof1color/racked-wardrobe-intelligence)**

## Problem

A sale is where most apparel brands stop seeing. They know what was bought; they cannot tell whether
a garment became a staple, sat unworn, or only works with one other thing the owner already had. The
data that would answer this — what people actually wear, how often, and with what — sits in private
closets, and the obvious ways to collect it are invasive. Consumers have the mirror-image problem:
no simple, private way to organize real clothes, build outfits, and see what they actually use, which
is why most wardrobe apps are abandoned after a week of manual data entry.

James began Racked after seeing clothing waste in Kenya. WRAP found that 26% of the average UK
wardrobe went unworn for a year; globally, production doubled from 2000 to 2015 while utilization
fell 36%. Racked acts before disposal by helping clothing remain useful. [Evidence and boundaries](sustainability-and-business-impact.md).

## Solution

Racked is a two-sided wardrobe-intelligence platform. A consumer photographs an outfit, a flat lay, or
a whole rail; Amazon Bedrock Nova Pro proposes visible garments in that photo and returns a controlled
category, type, colour, and material per piece. They confirm each card, build outfits, and record
wear — and outfit building *is* wear tracking, which is why the data stays honest. A brand enrols a
product from one photo plus its style code, and receives actual-wear intelligence for its own
products only: confirmed wears, repeat-wear rate, what it gets worn with. Those aggregates are
released only for owners who opted in, and only once **25** of them exist; below that the brand is
told it sees nothing, and is not even shown the count. A garment becomes a verified brand product
only through registry evidence — a barcode, or the brand together with its own style code. A product
the owner picked from the catalog is stored as their claim and never reaches a brand. Consumers are
free; brands pay, because post-purchase wear is what they cannot buy anywhere else.

Two real brands agreed to the pilot, created accounts and uploaded products, and both accepted the
proposed $20/mo Basic plan in writing: participation and price acceptance, not payment. Repeat-wear and pairing evidence can inform product, inventory and campaign decisions. At
the proposed $40 monthly Pro price, avoiding 19 excess units at a $25 landed cost is an illustrative
annual break-even, not measured pilot ROI.

## Key technical choices

- **Next.js 15 (SSR) on AWS Amplify, DynamoDB single-table, private encrypted S3.** One table keeps
  ownership in the key itself (`USER#<id>`), so one account's data cannot be reached by a filter bug.
- **Amazon Bedrock Nova Pro for vision and Hanger, Nova Lite as fallback.** One remote call per scan, with a
  bounded timeout; a provider failure degrades to an editable manual-review card instead of guesses.
- **The model never picks the outfit.** A deterministic server-side ranker scores every owned garment
  on five signals and selects; the model writes the explanation. A reply naming a piece outside that
  selection is rejected before it is shown.
- **Privacy enforced in code, not policy:** consent gates account creation, `k ≥ 25` suppression runs
  before aggregates are computed, and a DynamoDB-backed enumeration budget caps how many distinct
  products one brand can query so aggregates cannot be differenced apart.
- **1028 tests and a CI gate** — lint, type check, tests, production build, dependency audit, accessibility checks, CodeQL —
  on every pull request, with a build log through Phase 110 (the Phase 85 photo audit is owner-run and not executed against AWS; tests verified 2026-11-03).

## Lessons learned

- **Build the evidence system before the AI feature.** Recognition alone cannot prove a SKU. The
  useful invention here was not the vision call; it was separating a *claim* from *evidence* and
  making only evidence count.
- **A feature that looks better can be worse.** I built background removal early because cut-outs
  look sharp, and on real phone photos it erased white trousers against a pale wall. Showing an
  honest bounded crop beat a cut-out that sometimes deleted the garment.
- **Measure before you claim.** I did not claim recognition accuracy until I had measured it: the live
  scan placed 92.8% of 293 independent, locked photos in the right category. I still do not claim
  sales lift or purchase intent. Naming the gaps cost nothing and made everything else more credible.
