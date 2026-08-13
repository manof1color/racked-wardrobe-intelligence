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

- [ ] Public outfit chosen in advance
- [ ] Signed in as the *second* Consumer account
- [ ] Expected result known: which pieces should be owned, which substituted, which missing
- [ ] A genuinely missing piece exists, so the "you're missing" column is not empty

## Shop the Look — **currently blocked**

Shop the Look appears only when a product has an authorized destination. **Every seeded demo product currently has `commerceState: NO_DESTINATION` and no outbound URL, so the button never renders.**

- [ ] Sign in as a demo Brand and add a `productUrl` (and optionally `price`, `currency`, `availability`) to at least one enrolled product
- [ ] Confirm the product then reports `EXACT_AVAILABLE`
- [ ] Confirm **Shop the Look** now appears on a Community look containing it
- [ ] Confirm the outbound link redirects through `/api/products/[id]/outbound`

If this is not configured before the demo, **skip the step** and describe the state distinction from the brand page instead. Do not fake it.

## Fallback plan

| If this happens | Do this |
| --- | --- |
| Bedrock unavailable | Show the fallback: the photo plan reverts to the standard back-plus-label set and analysis opens explicit manual review. Narrate it as designed degradation. |
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
