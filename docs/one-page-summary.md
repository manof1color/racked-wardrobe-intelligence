# Racked — one-page summary

**James Harris · [Live app](https://main.d2iv0khybuuaeh.amplifyapp.com) · [Repository](https://github.com/manof1color/racked-wardrobe-intelligence)**

## Problem

A sale is where most apparel brands stop seeing. They know what was bought; they cannot tell whether
a garment became a staple, sat unworn, or only works with one other thing the owner already had. The
data that would answer this — what people actually wear, how often, and with what — sits in private
closets, and the obvious ways to collect it are invasive. Consumers have the mirror-image problem:
no simple, private way to organize real clothes, build outfits, and see what they actually use, which
is why most wardrobe apps are abandoned after a week of manual data entry.

## Solution

Racked is a two-sided wardrobe-intelligence platform. A consumer photographs an outfit, a flat lay, or
a whole rail; Amazon Bedrock Nova Pro finds every garment in that one photo and returns a controlled
category, type, colour, and material per piece. They confirm each card, build outfits, and record
wear — and outfit building *is* wear tracking, which is why the data stays honest. A brand enrols a
product from one photo plus its style code, and receives actual-wear intelligence for its own
products only: confirmed wears, repeat-wear rate, what it gets worn with. Those aggregates are
released only for owners who opted in, and only once **25** of them exist; below that the brand is
told it sees nothing, and is not even shown the count. A garment becomes a verified brand product
only through registry evidence — a barcode, or the brand together with its own style code. A product
the owner picked from the catalog is stored as their claim and never reaches a brand. Consumers are
free; brands pay, because post-purchase wear is what they cannot buy anywhere else.

## Key technical choices

- **Next.js 15 (SSR) on AWS Amplify, DynamoDB single-table, private encrypted S3.** One table keeps
  ownership in the key itself (`USER#<id>`), so one account's data cannot be reached by a filter bug.
- **Amazon Bedrock Nova Pro for vision, Nova Lite for the stylist.** One remote call per scan, with a
  bounded timeout; a provider failure degrades to an editable manual-review card instead of guesses.
- **The model never picks the outfit.** A deterministic server-side ranker scores every owned garment
  on five signals and selects; the model writes the explanation. A reply naming a piece outside that
  selection is rejected before it is shown.
- **Privacy enforced in code, not policy:** consent gates account creation, `k ≥ 25` suppression runs
  before aggregates are computed, and a DynamoDB-backed enumeration budget caps how many distinct
  products one brand can query so aggregates cannot be differenced apart.
- **457 tests and a CI gate** — lint, type check, tests, production build, dependency audit, CodeQL —
  on every pull request, with a 46-phase merged-PR history.

## Lessons learned

- **Build the evidence system before the AI feature.** Recognition alone cannot prove a SKU. The
  useful invention here was not the vision call; it was separating a *claim* from *evidence* and
  making only evidence count.
- **A feature that looks better can be worse.** I built background removal early because cut-outs
  look sharp, and on real phone photos it erased white trousers against a pale wall. Showing an
  honest bounded crop beat a cut-out that sometimes deleted the garment.
- **Measure before defending.** Asked about test coverage, I measured instead of arguing: the two
  weakest modules were the session guard at 76% branch coverage and the Recreate engine at 61%. Both
  are now above 97%, and writing those tests exposed a real defect — a signed token with a surplus
  segment was being accepted.
- **A UI can lie in both directions.** The worst bug I shipped told users a brand product was linked
  while saving no link at all, so no brand ever received that owner. It passed every test that
  checked the screen and none that checked what was stored.
- **Say what you cannot prove.** I do not claim recognition accuracy, sales lift, or purchase intent,
  because I have not run an independent benchmark. Naming the gap cost nothing and made everything
  else more credible.
