# Getting people to link their pieces to brands

A brainstorm on how to nudge consumers to link wardrobe pieces to the brand products they are, why
some ideas are ruled out, and what order to build the rest in. Written 2026-09-18, alongside brand
catalog recognition and search ([PROGRESS Phase 44](../PROGRESS.md)).

## Why it matters

Brand wear analytics only work if enough owners link the product. A brand sees nothing until **25
opted-in owners** have a verified link to a product (`k ≥ 25`). Every linked piece moves a product
toward that threshold. Until now, linking needed the code from the care label, and most people
skipped it.

## The rules any incentive has to follow

1. **Linking is not sharing.** A link shows the person their own product details. Sharing wear with
   brands is a separate opt-in in Settings. **No reward may depend on turning sharing on**, because
   consent that is bought is not freely given. Rewards attach to *linking*, never to *sharing*.
2. **Private by default.** Nothing about who linked what reaches a brand. A brand-funded perk has to
   be deliverable without the brand learning who received it.
3. **Honest.** No invented savings, no claims about resale value, sales, or purchase intent. Money
   figures say where they come from (for example, "from the brand's listed price").
4. **Small.** The aim is a nudge, not a points economy. Nothing converts to cash.
5. **Picks and verified links stay different.** A product chosen by search or suggestion is the
   owner's pick; only the label code verifies it. Rewards may differ between the two, and the UI
   always says which one a piece is.

## The biggest incentive is less friction

The largest reason people didn't link was effort: find the care label, read a code, type it. So the
first thing built is simply making linking easier ([#127](https://github.com/manof1color/racked-wardrobe-intelligence/pull/127)):

- **Recognition.** Opening *Is this a brand product?* on a scanned piece shows up to three enrolled
  products that look like it, with the reason for each.
- **Search.** A person can type the brand they bought from, the product name, or a style code.
- **One tap.** *This is mine* links the product as the owner's pick, and the label code can upgrade
  it to verified at any time.

## Built now

| Incentive | What the person gets | Why it's allowed |
|---|---|---|
| Product details in the Closet | The brand's product name and a clear **Verified** or **your pick** label on the piece | Private to the owner |
| **Cost per wear** | For a linked piece whose brand lists a price: "$30.00 a wear, from the brand's listed price", or "Listed at $90.00 · wear it to see its cost per wear" | Private, labelled as the listed price rather than what they paid, and it rewards wearing, not buying |
| A reason shown at the moment of choice | *Linked pieces show their product details in your Closet, and their cost per wear where the brand lists a price.* | States the benefit plainly and is not pushy |

## Next, in order

1. **Linking progress on Home** (small). "12 of 30 pieces linked", with a shortcut to the unlinked
   ones. It is dismissible and never nags, and there's no streak or badge pressure. → Work order **X7**.
2. **"Verify to make it shoppable"** (small). Verified pieces already make a Community look
   shoppable through Shop the Look. Say so where it matters: when publishing a look that contains
   *picked* pieces, show "Add the label code to make this piece shoppable in your post." → Work order **X7**.
3. **Care guide from the brand** (small–medium). Brands can add care instructions at enrollment. A
   linked piece shows them in the Closet, and Hanger can use them ("wash cold, hang dry"). Useful to
   the owner, free for the brand, and nothing flows back.
4. **Owner perks** (medium, needs design). A brand publishes a perk, such as a repair service, a
   care kit, or early access, and it appears for anyone with a **verified** piece from that brand.
   Redemption uses one code shared by everyone who sees the perk, so the brand never learns who used
   it. Racked never pays for perks. This is the one brand-facing incentive, and it gives brands a
   reason to promote linking to their own customers.
5. **Provenance card for resale** (later). A verified piece can export a card with the brand, style
   code, date linked, and wear count, which the owner can attach to a resale listing. It is shared
   only when they choose, and it makes no value claim.

## Ruled out

- **Discounts, points, or entries for turning on brand data sharing.** This buys consent (rule 1).
- **Leaderboards or public "most linked" lists.** They expose wardrobes.
- **Points that convert to money or store credit.** They are a regulatory burden and turn a wardrobe
  app into a loyalty scheme.
- **Push notifications asking people to link.** A nudge in the flow is enough, and nagging costs trust.
- **Estimated resale value.** Racked has no basis for the number, and it would be read as a promise.

## How we'll know it works

Measured privately, as counts with no person attached:

- **Link rate:** the share of saved pieces that are linked, split into verified and picked.
- **Upgrade rate:** the share of picks later verified with a label code.
- **Products that cross `k ≥ 25`:** the number that actually matters to brands.

None of these is reported as a sales or behaviour claim.
