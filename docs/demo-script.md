# Presentation script (8 minutes)

Live application: <https://main.d2iv0khybuuaeh.amplifyapp.com>

Run the [demo checklist](demo-checklist.md) before presenting. Everything below uses the clearly
labeled synthetic demo cohort; never describe it as real customer traction.

**Two rules this script is built around.** Show the real model working at least once, deliberately,
so nobody can call the AI decorative — then show the deterministic fallback and name it. And give
privacy and control their own segment: consent, the 25-owner threshold, and deletion are the part
most submissions will not have, and they are evidence, not housekeeping.

## 0:00–0:45 — The problem

Open the landing page. The headline states the thesis: **"Brands know what you bought. Not what you
wear."**

Say: *"A sale is where most brands stop seeing. They don't know whether a product became a staple,
sat unworn, or only works with one other thing the customer owns. Racked measures what happens after
checkout — and gives brands that picture without ever showing them a person's closet."*

## 0:45–2:30 — Consumer intake, with the model actually running

1. Sign in with the demo Consumer account and show the wardrobe.
2. Tap **+**, then **Take photo** or **Choose image**, and add a photo with two or three pieces. A
   flat lay on a plain surface works best.
3. **Say it out loud while it runs:** *"This is a live call to Amazon Bedrock right now — Nova Pro
   is finding each garment in one photo and returning bounded coordinates and controlled
   attributes."* That sentence is the point of the segment.
4. Show one card per piece: the controlled category and **Type**. When AI is unsure, the Type field
   asks rather than guesses, and anything typed is kept in the person's own words.
5. Open **Is this a brand product?** on one piece and enter a label code to show the registry check.
6. Confirm and save. Show the pieces in Closet.
7. **Then show the second path on purpose.** Open the recorded fallback clip (or the pre-saved
   manual-review piece) and say: *"When the provider is unavailable or returns nothing usable, you
   get one editable card with zero confidence and no invented attributes — never a dead end, and
   never a guess dressed up as a result."*
8. Boundary line: *"A brand name read from a photo, typed by hand, or matched from a name list only
   fills in an editable field. Only registry SKU or GTIN evidence makes a product verified — even if
   a brand account already exists under that name."*

> **If the live scan stalls past about ten seconds:** keep talking, cut to the backup clip, and say
> *"that's the live path; here it is completing on a better connection."* Do not stand in silence
> waiting for a network call.

## 2:30–3:15 — Outfits and wear

1. Open **Looks**, tap a combination, review the slide preview, and choose **Save & wear this look**.
2. Open the **Outfits** tab and use **Wear this again** to record a repeat wear in one tap.
3. Say: *"That confirmed wear is the raw material. It only ever reaches a brand as an aggregate, from
   people who opted in, above a 25-owner threshold."*

## 3:15–4:45 — Recreate This Look (the flagship)

1. Open **Community**. The feed leads with the outfit, **Brand Looks** and **Community Looks** are
   visually distinct, and every seeded record carries a **Demo data** label.
2. Pick a look and press **Recreate with my wardrobe**.
3. Show the coverage headline, then the split: **Use yours** versus **You're missing**.
4. Expand a matched piece with **Why?** to show which owned garment was chosen and the evidence.
5. Core consumer message: *"Use what you own first. Buy only what you're missing."*
6. Name the engine's honesty: an exact match requires the same registry product; substitutes are
   compared only inside the same category; one owned piece can cover only one role. *"Those rules
   are pinned to exact numbers in the test suite, including that an unverified label never becomes
   ownership."*
7. Open **Shop the Look**: exact-verified separated from similar, unverified, and unavailable —
   *"only an exact, brand-authorized product is ever linkable."* Follow one fictional exact product
   into its clearly labeled demo storefront, complete the $0.00 simulation, and use **Return to
   Racked**. State plainly that no payment, order, address, contact, or account record was created.

## 4:45–6:30 — Privacy and control (the differentiator)

This is the segment to slow down in.

1. **Consent is a gate, not a checkbox.** Show sign-up: a Consumer account cannot be created without
   image-processing consent, and the button stays disabled until it is ticked. Brand data sharing is
   a *separate* preference in Settings, off until deliberately enabled.
2. **The threshold, seen working.** In the Brand workspace, open the below-threshold product and
   show the suppressed state. Say: *"Fewer than 25 opted-in owners means the brand sees nothing —
   not zeroes, not a sample. Suppression is the control working."* Add that an enumeration budget
   caps how many distinct products one brand can query, so aggregates can't be differenced apart.
3. **What a brand never receives.** Names, emails, photographs, raw wardrobes, owner IDs. Public
   posts get new public garment IDs; private wardrobe IDs and storage keys never enter the feed.
4. **Deletion, performed live.** In the throwaway Consumer account: delete one garment from Closet —
   it leaves saved outfits and any Community post that showed it. Then open Settings and show the
   delete-account card: current password plus typing DELETE, with the list of what goes. Say:
   *"Both Apple and Google require this, and the privacy page describes exactly what it removes."*
5. Close the segment: *"Every insight in this product is a by-product of something a person chose to
   do, and can undo."*

## 6:30–7:30 — Brand

1. Open the public brand page: **Products**, **Brand Looks** (styled by the brand), **Community
   Looks** (published by people), with the footnote that Community Looks are not brand-created.
2. In the Brand workspace, select the hero product and read the plain-language answers: *Are people
   actually wearing it? Do they wear it more than once? Is it becoming a staple? Who bought it but
   never wore it?*
3. Show **What it gets worn with** — pairing intelligence from public looks only.

## 7:30–8:00 — Business model and close

Open `/pricing`. Say: *"Consumers stay free to solve cold-start. Brands carry the revenue, because
post-purchase wear intelligence is what they cannot get anywhere else. The Starter tier exists
because an emerging brand often can't reach the privacy threshold immediately — we price that
waiting period honestly instead of faking data."*

Close on the loop: consumer utility → confirmed wear → privacy-safe brand intelligence → optional
verified commerce.

## Claims discipline

Say **observed**, not **caused**. Racked does not claim recognition accuracy, sales lift, conversion,
purchase intent, demographics, fit prediction, or production-scale validation. Every number on screen
during this demo is synthetic demonstration data and is labeled as such in the interface.

## Failure handling

| If this happens | Do this |
| --- | --- |
| The live scan is slow or fails | Cut to the backup clip, narrate it as the live path, and continue. The fallback card is itself a designed behaviour worth showing. |
| Bedrock is unavailable entirely | Show the **needs your label** card and present it as designed degradation: no invented attributes, nothing lost. |
| A cohort is below 25 | Show the suppression state and explain it is a successful privacy control. |
| No shopping destination is configured | Shop the Look will not appear. Skip it and describe the state distinction from the Products section instead. |
