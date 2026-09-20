# Competition demo checklist

Work through this **before** presenting. Pair it with the [presentation script](demo-script.md).

> Everything in the seeded environment is synthetic and labeled `DEMO` in the interface. Never describe it as real customer traction, and never present pre-seeded state as something generated live during the demo.

## Accounts required

| Purpose | Account | Notes |
| --- | --- | --- |
| Consumer walkthrough | A demo Consumer account | Needs a saved outfit and at least one recorded wear before the demo |
| Recreate This Look | A **second** Consumer account with a *different* wardrobe | Recreate compares a public look against the signed-in wardrobe only, so the first account's own post will show near-total coverage and make a weak demo |
| Brand workspace | A demo Brand account | Must own the hero product being shown |
| Pilot brand (optional) | An authorized pilot brand | Only if a real pilot relationship genuinely exists |

Passwords are shared privately and are never committed to this repository.

## Demo brands actually seeded

The production environment currently contains these fictional brands. **Verify names in the app before scripting around them** — do not assume placeholder names from planning documents.

- Racked Test Atelier
- Synthetic Stride Lab
- Lumen Test Objects

## Pre-flight checks

- [ ] Live URL loads: <https://main.d2iv0khybuuaeh.amplifyapp.com>
- [ ] `/community` shows looks with images rendering
- [ ] Brand Looks and Community Looks are both present in the feed
- [ ] The public brand page shows Products, Brand Looks, and Community Looks
- [ ] The Brand dashboard shows released metrics for the hero product
- [ ] At least one below-threshold product exists to demonstrate suppression
- [ ] `/pricing` loads and is labeled as planned, not billed

## Upload demo

- [ ] Exact photos chosen in advance (front, plus whatever the plan requests)
- [ ] Expected category/subtype known, so a wrong classification can be corrected calmly on camera
- [ ] Manual-correction path rehearsed — correcting the AI **is** part of the story, not a failure

## Recreate This Look

Use public post `demo-consumer-post-01` (**Synthetic Consumer Look 01**) while signed in as `demo.consumer.recreate@racked.local` (synthetic `DEMO`; password comes only from runtime `RACKED_TEST_PASSWORD`). Expected: `RTA-001` exact; owned `SSL-002` strongly substitutes for post product `SSL-001`; jewelry missing.

- [ ] Public outfit chosen in advance
- [ ] Signed in as the *second* Consumer account
- [ ] Expected result known: which pieces should be owned, which substituted, which missing
- [ ] A genuinely missing piece exists, so the "you're missing" column is not empty

## Shop the Look - seeded demo commerce

All fictional demo products carry a Racked demo-storefront URL, fictional USD price, and availability. At least 29 are available; `LTO-010` is deliberately unavailable. All remain `DEMO`. Nine committed AI-generated, unbranded product photographs cover representative apparel, footwear, and jewelry SKUs.

- [ ] Open a seeded Community look with an exact verified demo product and confirm the product photograph depicts a recognizable fictional garment, shoe, or jewelry piece
- [ ] Confirm **Shop the Look** appears and exact, similar, unverified, and unavailable states stay visually distinct
- [ ] Confirm the exact-product outbound link redirects through `/api/products/[id]/outbound` to the internal fictional storefront
- [ ] Select **Add to demo bag**, then **Complete demo purchase — $0.00**
- [ ] Confirm the completion screen states no card, payment, order, shipping, contact, or account data was collected
- [ ] Use the visible **Return to Racked** button to return to Community

## Before you present: the two moments that can cost you

The live scan is the riskiest thing in the five minutes, and the privacy segment is the most
valuable. Prepare both.

- [ ] **Record a 30-second backup clip** of a successful scan: photo chosen, cards returned, one
      label-code check, save. Keep it open in a second tab, muted and ready. A screenshot of the
      result card is a usable second fallback.
- [ ] **Warm the real path 20–30 minutes before**: run one real scan end to end so Bedrock access,
      the deployed model policy, and the network are all proven on the day.
- [ ] **Keep one pre-scanned piece in the wardrobe**, so the Closet and Outfits segments never
      depend on a live call.
- [ ] **Save a manual-review card** (or its clip) so the deterministic fallback can be shown
      deliberately rather than only when something breaks.
- [ ] **Use a throwaway Consumer account for the deletion demo.** Never delete the judge account,
      and never demonstrate deletion on an account you still need.
- [ ] **Have the below-threshold product open** in a Brand tab for the suppression view.
- [ ] Confirm the demo Consumer account still has: a published Community look, a saved outfit, and
      at least one registry-verified piece for the Recreate segment.

## Fallback plan

| If this happens | Do this |
| --- | --- |
| Bedrock unavailable | Show the fallback: the scan returns one editable **needs your label** card with no invented attributes. Narrate it as designed degradation. |
| Live upload fails | Switch to a garment already in the wardrobe and continue from the confirmation step. |
| Weak network | Open the public pages (landing, community, brand profile, pricing) which are server-rendered, and defer the upload segment. |
| Demo account unavailable | Use the public Community and brand pages, which need no sign-in, and describe the signed-in flow from the script. |
| A metric looks wrong | Say so plainly and move on. Never explain a number you cannot source. |

Any fallback state shown must stay clearly labeled. If pre-seeded synthetic data is shown, say it is pre-seeded synthetic data.

## Post-demo honesty checklist

- [ ] No claim of recognition accuracy was made
- [ ] No claim of sales lift, conversion, revenue, or purchase intent was made
- [ ] Synthetic data was described as synthetic every time it appeared
- [ ] Suppression was framed as a working control, not a limitation
