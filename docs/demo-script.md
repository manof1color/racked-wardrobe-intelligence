# Presentation script (8 minutes)

Live application: <https://main.d2iv0khybuuaeh.amplifyapp.com>

Run the [demo checklist](demo-checklist.md) before presenting. Everything below uses the clearly labeled synthetic demo cohort; never describe it as real customer traction.

## 0:00–1:00 — The problem

Open the landing page. The headline states the thesis: **"Brands know what you bought. Not what you wear."**

Say: *"A sale is where most brands stop seeing. They don't know whether a product became a staple, sat unworn, or only works with one other thing the customer owns. Racked measures what happens after checkout — and gives brands that picture without ever showing them a person's closet."*

Scroll to the flywheel to show how consumer value and brand value come from the same loop.

## 1:00–3:00 — Consumer: the wardrobe and the AI

1. Sign in with the demo Consumer account and show the wardrobe.
2. Add a garment. Photograph the front, then tap **Get an AI photo plan**.
3. Read the agent's reasoning aloud. Point out that it asks a shoe for its **sole and tongue label**, not a generic back view — the agent adapts what evidence it collects to what it just classified.
4. Change the category in the dropdown to show the plan rebuild. *The person stays in control.*
5. Complete the photos and analyze. Show the controlled category/subtype, the confidence, the alternatives, the auto-cropped display image beside the preserved evidence photo, and the prefilled brand label.
6. Stress the boundary: *"A brand name read from a photo, typed by hand, or matched from a name list only fills in an editable field. Only registry SKU or GTIN evidence makes a product verified — even if a brand account already exists under that name."*

## 3:00–4:00 — Outfits and wear

1. Open **Looks**, tap a combination, review the slide preview, and choose **Save & wear this look**.
2. Open the **Outfits** tab and use **Wear this again** to record a repeat wear in one tap.
3. Say: *"That confirmed wear is the raw material. It only ever reaches a brand as an aggregate, from people who opted in, above a 25-owner threshold."*

## 4:00–6:00 — Community and Recreate This Look (the flagship)

1. Open **Community**. Point out the feed leads with the outfit, and that **Brand Looks** and **Community Looks** are visually distinct — brand merchandising versus real social proof. Every seeded record carries a **Demo data** label.
2. Pick a look and press **Recreate with my wardrobe**.
3. Show the coverage headline, then the split: **Use yours** versus **You're missing**.
4. Expand a matched piece with **Why?** to show which owned garment Racked chose and the evidence behind it.
5. Say the core consumer message: *"Use what you own first. Buy only what you're missing."*
6. Note the honesty of the engine: an exact match requires the same registry product; substitutes are only ever compared inside the same category, and one owned piece can cover only one role.
7. Open **Shop the Look** to show exact-verified separated from similar, unverified, and unavailable — *"only an exact, brand-authorized product is ever linkable."* Follow one fictional exact product into its clearly labeled demo storefront, add it to the Demo Bag, complete the $0.00 simulation, and use **Return to Racked**. State plainly that no payment, order, address, contact, or account record was created.

## 6:00–7:00 — Brand

1. Open the public brand page. Three sections: **Products**, **Brand Looks** (styled by the brand), **Community Looks** (published by people). Read the footnote: Community Looks are not brand-created.
2. Sign in to the Brand workspace and select the hero product.
3. Show the plain-language readouts: *Are people actually wearing it? Do they wear it more than once? Is it becoming a wardrobe staple? Who bought it but never wore it?*
4. Show **What it gets worn with** — pairing intelligence from public looks only.
5. Show the suppressed state on a below-threshold product: *"Suppression is the control working, not a missing feature."*

## 7:00–8:00 — Business model

Open `/pricing`. Say: *"Consumers stay free to solve cold-start. Brands carry the revenue, because post-purchase wear intelligence is what they cannot get anywhere else. The Starter tier exists because an emerging brand often can't reach the privacy threshold immediately — we price that waiting period honestly instead of faking data."*

Close on the loop: consumer utility → confirmed wear → privacy-safe brand intelligence → optional verified commerce.

## Claims discipline

Say **observed**, not **caused**. Racked does not claim recognition accuracy, sales lift, conversion, purchase intent, demographics, fit prediction, or production-scale validation. Every number on screen during this demo is synthetic demonstration data and is labeled as such in the interface.

## Failure handling

- **Bedrock unavailable:** the photo plan falls back to the standard back-plus-label set and analysis opens explicit manual review. Show it — the graceful degradation is a feature, not an excuse.
- **Cohort below 25:** show the suppression state and explain it is a successful privacy control.
- **No shopping destination configured:** Shop the Look will not appear. Skip it and describe the state distinction from the Products section of the brand page instead.
