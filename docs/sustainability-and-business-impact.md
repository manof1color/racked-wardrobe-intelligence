# Sustainability and business impact

This is the evidence and claims boundary behind Racked's sustainability story. It separates published
industry context, behavior Racked actually supports, observed pilot participation, and illustrative
commercial scenarios. It does not convert any of those into a claim of avoided waste, emissions or
customer return on investment.

## Why the project exists

James Harris began Racked after seeing the consequences of clothing waste while in Kenya. The product
connects two needs that are usually treated separately:

1. A person needs a private way to see, combine and use more of the clothing they already own.
2. A brand needs evidence about what happens after checkout: whether a product earns repeat wear,
   remains useful over time and works with other pieces.

The central idea is prevention before disposal. Recycling and upcycling recover value after a garment
has left active use. Racked works earlier: it helps a person return owned pieces to rotation and gives
a brand aggregate evidence about the products that stayed useful.

## External evidence

These figures are context, not Racked results.

| Claim | Scope and source | What Racked may say |
| --- | --- | --- |
| The average surveyed UK adult owned 118 clothing items; 26%, about 31 pieces, had not been worn in the previous year | WRAP, *Citizen Insights: Clothing Longevity and Circular Business Models Receptivity in the UK* | "In a large UK study, 26% of the average wardrobe went unworn for a year." Never present it as a worldwide average or as "people wear only 20% of their clothes." |
| Clothing production doubled between 2000 and 2015 while utilization — wears before disposal — decreased 36% | Ellen MacArthur Foundation, *Circular business models: redefining growth for a thriving fashion industry* | "The industry produced more while using each garment less." |
| Globally, 73% of material used for clothing is eventually landfilled or burned and less than 1% of old clothing becomes new clothing | Ellen MacArthur Foundation, `#WearNext` | "Longer use complements reuse and recycling." Do not imply that Racked controls end-of-life handling. |
| Kenya's circular-economy strategy treats textiles, apparel and fashion as a priority and emphasizes resource efficiency, extended product life and less waste | Kenya State Department for Environment and Climate Change | Use as context for the founder's Kenya experience, not as government endorsement of Racked. |
| UNEP has documented Kenyan collection and upcycling businesses returning textile waste to use | UNEP, *In Kenya, textiles get a second life* | Use as evidence that circular textile work already exists in Kenya, not as evidence of Racked's impact. |

Sources, checked 2026-11-03:

- [WRAP: Citizen Insights — Clothing Longevity and Circular Business Models Receptivity in the UK](https://www.wrap.ngo/resources/report/citizen-insights-clothing-longevity-and-circular-business-models-receptivity-uk)
- [Ellen MacArthur Foundation: Rethinking business models for a thriving fashion industry](https://www.ellenmacarthurfoundation.org/fashion-business-models/overview)
- [Ellen MacArthur Foundation: #WearNext](https://www.ellenmacarthurfoundation.org/articles/wearnext)
- [Kenya State Department for Environment and Climate Change: National Circular Economy Strategy validation](https://environment.go.ke/index.php/ministry-validates-national-circular-economy-strategy-and-implementation-plan-2027-2032)
- [UNEP: In Kenya, textiles get a second life](https://www.unep.org/en/news-and-stories/story/kenya-textiles-get-second-life)

## What Racked does today

### For a person

- Records an owned wardrobe from photographs after human confirmation.
- Builds outfits only from owned pieces.
- Finds underused pieces and supports rotation requests.
- Lets a person save and repeat outfits instead of treating every occasion as a shopping prompt.
- Awards private wear points, including a three-point return-to-rotation bonus after 60 days.
- Shows how much of a public look can already be recreated from that person's wardrobe.

### For a brand

- Reports confirmed wear, repeat use, observation windows and common pairings for the brand's verified
  products.
- Releases those facts only from an opted-in cohort of at least 25 owners.
- Produces campaign strategy from released aggregates, never from identities or raw wardrobes.
- Keeps public Community activity separate from private, consented wear intelligence.

These are utilization signals. Racked has not measured disposal, avoided purchases, production
changes, carbon, water, landfill diversion or lifecycle impact.

## How the signals can create monetary value

Racked cannot promise revenue or savings. It can identify decisions where post-purchase evidence may
reduce uncertainty:

| Racked signal | Brand decision it can inform | Potential value mechanism |
| --- | --- | --- |
| Sustained repeat wear | Restock or expand a proven product | Lower product-selection risk |
| Weak use after purchase | Revise or limit a future run | Less inventory committed to a weak product |
| Common product pairings | Merchandising, collections and campaign creative | Less guesswork in content and assortment planning |
| Pairing diversity | Prioritize versatile designs | More occasions and styling uses per product |
| Use across several weeks | Product development and lifecycle messaging | Evidence of continued usefulness rather than a one-time sale |

The formulas are deliberately simple so a brand can replace every assumption:

```text
inventory cost avoided = avoided excess units × landed cost per unit
markdown margin protected = units kept out of markdown × (full-price contribution − markdown contribution)
annual subscription cost = monthly price × 12
```

At the proposed Brand Pro price, the plan that releases wear data:

```text
$40 × 12 = $480 per year
$480 ÷ $25 landed cost = 19.2 units
```

Therefore, avoiding roughly **19 excess units at a $25 landed cost** would equal one annual Pro
subscription. This is a break-even illustration, not a forecast or a result from either pilot brand.
It excludes revenue, markdown recovery, implementation costs and taxes. Change either assumption and
the answer changes.

## Current market evidence

As of 2026-10-29, two independent apparel brands, **_victimdesigns** and **vversatile.usa**, had:

- agreed by phone to participate in the Racked pilot;
- created brand accounts; and
- uploaded products.

That is observed participation and implementation feasibility, not hypothetical survey intent. It is
fair to call it an **early market signal** or **pilot adoption**.

It does not yet prove:

- written problem validation;
- pricing acceptance or willingness to pay;
- recurring usage;
- a production, restocking or campaign decision influenced by Racked;
- avoided inventory, markdowns or waste;
- product-market fit; or
- customer return on investment.

The next validation step is one permissioned, dated statement from each brand about the problem and
one concrete commercial step: price feedback, an agreed paid pilot, a letter of intent or payment.

## Measures Racked can add without inventing environmental impact

| Measure | Definition | Status |
| --- | --- | --- |
| Wardrobe activation | Share of saved pieces worn at least once in a stated 30- or 90-day window | Proposed; needs a defined denominator and real-user consented measurement |
| Returned to rotation | Pieces worn after at least 60 days without a recorded wear | The event already drives a private wear-points bonus; an aggregate impact metric is not yet published |
| Outfit reuse | Recorded wears from a previously saved outfit | Proposed |
| Recommendation activation | Hanger recommendations saved, recorded or later worn | Save acceptance can be counted; causal impact is not established |
| Brand decision influenced | A documented restock, production, merchandising or campaign decision using a Racked insight | Requires permissioned pilot evidence |

## What the repository can measure now

The current production model already contains the inputs for a **snapshot**, but not for every
longitudinal claim:

- Each wardrobe record has `createdAt`, `wearCount` and `lastWornAt` (`lib/types.ts` and
  `lib/server/production-store.ts`).
- `isRediscovered` in `lib/wear-points.ts` identifies a piece that has been owned for at least 60
  days and has not been recorded as worn during that period.
- `recordRealWear` calculates the rediscovered piece IDs inside the same operation that records the
  wear, and returns their count to the consumer UI.
- That rediscovery count is **not stored durably**. The all-time points record stores points and
  streak fields, while each garment retains only its latest wear timestamp. After a later wear,
  Racked cannot reconstruct every earlier 60-day return-to-rotation event.
- Durable product wear events exist for registry-linked brand products, but those are not a complete
  consumer wardrobe history and must not be used as a proxy for all garments.

Therefore the repository supports these statements today:

> Racked detects when an eligible piece is recorded as worn after at least 60 days out of rotation
> and gives the consumer a private bonus.

> At a stated snapshot date, Racked can calculate what share of the currently saved wardrobe has a
> recorded wear in a defined recent window.

It does **not** yet support:

> Racked has returned N pieces to rotation.

> Racked increased wardrobe utilization by X%.

> Racked prevented N purchases or N garments from becoming waste.

## Measurement contract needed for a wardrobe-use claim

### Claim A — current recorded wardrobe activation

This is the smallest claim available from existing garment records:

```text
eligible pieces = non-DEMO pieces created on or before the snapshot time
active pieces = eligible pieces whose lastWornAt falls within the previous 90 days
recorded wardrobe activation = active pieces ÷ eligible pieces
```

Publish the snapshot time, window, account count, piece count, missing/invalid timestamp count and
whether each account is weighted equally or every piece is pooled. Call it **recorded activation**:
Racked does not observe unlogged wear. A stricter mature-wardrobe view can limit the denominator to
pieces added before the 90-day window so every piece had the full opportunity to be recorded.

### Claim B — pieces returned to rotation

Persist a private counter when `award.rediscovered` is non-empty, in the same DynamoDB transaction as
the wear. The minimum record is an additive `rediscoveredTotal` on the consumer's existing private
points record. Store no brand-visible field and do not make points or the count depend on consent.
If product analysis needs time windows, add a bounded, owner-scoped event with event time and garment
ID; define retention and delete it with the account. Do not copy it into a brand product partition.

Once this exists, a public aggregate may say:

> Across N consenting study accounts during [dates], users recorded M pieces returning to rotation
> after at least 60 days.

It still may not say Racked **caused** those wears.

### Claim C — change in wardrobe activation

To say activation changed, prospectively freeze a study cohort and denominator:

1. Recruit consenting participants, excluding `DEMO` and synthetic data.
2. Require a minimum wardrobe size and observation period; publish both.
3. Freeze the eligible piece IDs before the first measurement window.
4. Measure recorded activation over equal baseline and follow-up windows.
5. Report participant retention, missing wear logs, median per-account change and the number whose
   activation rose, not only one pooled percentage.
6. Say **increased during the study**, not **because of Racked**, unless a randomized or otherwise
   credible comparison supports causation.

The first competition-safe result should be Claim B or a Claim A snapshot. Claim C is stronger but
needs time and prospective consent; it should not be manufactured from incomplete historical fields.

## Claims rule

Use **helps**, **supports**, **can inform** and **is designed to**. Do not use **prevented**, **saved**,
**reduced** or **caused** for waste, emissions, purchases, production, revenue or margin until a
measurement with a denominator and counterfactual supports it.
