# Presentation script (5 minutes, plus 3 minutes of Q&A)

Live application: <https://main.d2iv0khybuuaeh.amplifyapp.com>

Run the [demo checklist](demo-checklist.md) before presenting. Everything below uses the clearly
labeled synthetic demo cohort; never describe it as real customer traction.

## The format this is built for

Ten minutes per presenter: **0:30** MC intro, **5:00 live demo on a hard timer** (yellow card at
4:00, red at 5:00), **3:00 judges' Q&A**, 1:30 transition. The demo runs from the live URL on the
podium laptop — there is no slide deck to hide behind, and there is no time to recover from a
tangent. Judges fill in their scores *during the Q&A*, which is why the second half of this document
matters as much as the first.

**Three rules this script is built around.**

1. **Two flows, nothing else.** A person: *scan → confirm → recommendation*. A brand: *anonymous
   cohort → wear evidence → campaign brief*. Every other feature is built and working, and it goes in
   the "also live" line at the close — not on screen. Each extra feature is one more thing that can break
   or blur the story.
2. **Open with something that cannot be staged.** Scan a garment you are wearing, live. It answers
   "does this actually work" in the first minute, before anyone wonders.
3. **Never stand in silence.** If a network call is slow, keep talking and cut to the backup clip.

---

## 0:00–0:30 — The problem, in one breath

Open the landing page. Say:

> *"Brands know what you bought. They have no idea what you actually wear. Racked measures what
> happens after checkout — and gives brands that picture without ever showing them a person's
> closet. I started it after seeing clothing waste in Kenya. WRAP found that 26% of the average UK
> wardrobe went unworn for a year; Racked helps people use more of what they own and helps brands
> learn which products actually earn continued use."*

Do not explain the architecture yet. Do not list features.

## 0:30–2:15 — A person: scan, confirm, recommendation

Signed in as the judge Consumer account.

1. **Scan.** Tap **+** and photograph **a garment you are wearing** — take off a jacket, put it on
   the table. While it runs: *"That is a live call to Amazon Bedrock. Nova Pro is finding each piece
   in the photo right now."*
2. **Confirm.** When the cards appear, land on one detail: *"When the AI isn't sure, the Type field
   asks instead of guessing. Nothing reaches my wardrobe until I confirm it."* Save.
3. **Recommendation.** Open **Hanger** and ask *"What should I wear with this today?"* — or *"I need a
   more formal outfit."* The outfit arrives as photo cards built from pieces this account owns, the new
   one included. Say:

> *"The model decides what it needs — it can search my wardrobe, check the forecast, call the outfit
> builder. But the outfit itself comes from a deterministic ranker over things I own. The model can
> explain a look; it cannot invent one."*

> **If the scan stalls past ten seconds:** keep talking, cut to the backup clip, and say *"that's the
> live path — here it is completing on a better connection."* If Hanger is slow, the **Looks** tab
> opens on the same builder's pick for today — show that.

## 2:15–3:45 — A brand: anonymous cohort, wear evidence, campaign brief

Switch to the judge Brand account.

1. **The privacy gate.** Open **Judge Limited Overshirt**: *"Four opted-in owners. Under twenty-five,
   the brand sees nothing — not zeroes, not a sample, not even the count, because four is itself
   identifying."*
2. **The anonymous cohort.** Open **Judge Signature Tee**: *"Fifty owners who opted in. Same code,
   same query — the only difference is that enough people chose to share. Real wear, repeat wear, what
   it's worn with. No name, no photo, no closet."*
3. **The campaign brief.** Ask **Brand Hanger**: *"Write me a campaign brief for this product."*
   *"It writes only from the released aggregate. On the product below the threshold it won't make an
   evidence claim at all — that reply doesn't even call the model."*

## 3:45–4:30 — How it was built

Open the repository's README on the podium laptop. This is 15% of the rubric and most presenters
skip it.

> *"The first thing in the README is a scorecard: every rubric category, with links to the code and
> the tests that prove it. Every change went through a pull request, and CI runs the dependency audit,
> lint, type check, the full test suite, a production build, and CodeQL before anything merges."*

Read the current test count off the scorecard rather than from memory. Then the honest boundary:
*"Every brand number on screen today is synthetic demonstration data, labelled in the interface. The
one real number is recognition: on 300 independent photos, locked before the first call, the live
scan got the category right 92.8% of the time. I don't claim sales lift or purchase intent."*

## 4:30–5:00 — Close, and what else is live

> *"Consumers stay free, because the wardrobe has to earn its place on its own. Brands pay, because
> post-purchase wear is what they cannot get anywhere else. Three real apparel brands have already
> agreed to the pilot, created accounts and uploaded products, and all three have accepted our pricing in
> writing, one of them on the $40 Pro plan — not yet payment. At
> the proposed Pro price, helping a brand avoid 20 excess units at a $25 landed cost
> would cover a year, although that is a break-even illustration, not a result I claim. Also built
> and running, but not in these five minutes: Community, Recreate This Look, Shop the Look, and batch
> brand enrollment."*

Close on the loop: **consumer utility → confirmed wear → privacy-safe brand intelligence.**

---

## Optional, only if asked or time allows: saved looks and the demo purchase (about 1 minute)

Not part of the five-minute path. Use it for a judge who asks "can people buy things?" or "what happens
to a look I like?". Steps below are read from the code; lines marked **OWNER CONFIRM** have not been
run end to end on the live site by anyone but you.

**Saved from Community** — signed in as the judge Consumer (a demo session may heart and unheart; it may not publish).

1. Tap **Community** in the bottom bar. Tap the **heart** under any look: it fills, the word **Saved**
   appears and the count goes up by one.
2. Open the **Outfits** tab. Under your own outfits, **Saved from Community** now lists that look. Open it:
   it shows the look as Community does, with no wear button, because these are other people's clothes.
3. Tap the heart again: *"Removed from your Outfits."* The count drops by one. Tap it once more to keep it.
4. To show **rename**: in **Outfits**, open one of your own saved outfits, tap **Rename**, type a name in
   **Outfit name** and save.
   **OWNER CONFIRM** by hand on the demo account, once, before presenting: the heart, the unsave and the rename.

**The demo purchase** — a *fictional* product, $0.00, no card, nothing ships.

The live site sets no Stripe key (owner decision 2026-11-13), so Racked's Stripe test checkout is switched off and
every product has one purchase path: the brand's own store.

1. Open `/demo-store/racked-test-atelier/RTA-001`. The banner says it is a fictional shop. The page's only purchase
   button is **Add to demo bag**.
2. Tap **Add to demo bag**, then **Complete demo purchase — $0.00**. No card, contact, shipping or account details
   are asked for.
3. The confirmation says no card was requested and no order was created, and shows how the proposed 8% referral
   commission would split this price between Racked and the brand. Nothing is split or moved.
   **OWNER CONFIRM** once on the live site, after the Stripe key is removed: the button is **Add to demo bag** and
   the commission line appears.
4. Say: *"On a real brand, this button sends the shopper to the brand's own store. The brand keeps its checkout,
   and pays Racked 8% on what we send. Its dashboard shows how many shoppers we sent and whether they came through
   its affiliate link."*
5. Optional: sign in as the judge Brand, open the product, and show **How many shoppers has Racked sent to your
   store?**

---

## Prepared answers for the 3-minute Q&A

Judges score here. Answer in two sentences, then stop.

| Likely question | Answer |
| --- | --- |
| **"How do you solve cold start? An empty closet is useless and a brand sees nothing until 25 owners."** | The consumer side has to be worth using alone — organizing a closet, building outfits, cost per wear — and it is. Brand intelligence switches on later, per product, and until it does the dashboard says so plainly instead of showing invented numbers. |
| **"You call them agents. What actually calls a model?"** | Three things: finding garments in a photo, the consumer Hanger — which is the only real agent, choosing its own tools — and Brand Hanger's reply once a product is released. Everything else, including the outfit ranker, the privacy gate, and brand verification, is deterministic code; the README has one row per action. |
| **"Isn't a public outfit feed at odds with privacy-first?"** | It is private by default: nothing is public until someone picks one saved outfit and presses Publish, and only that outfit appears, under new IDs. Its owner can unpublish it at any time. Community is built and live, and a judge can open it, but it is not in the five minutes because it is not one of the two flows. |
| **"How much of this did you actually write?"** | I directed it and reviewed every change; the history is public, pull request by pull request. Open any file and I will walk you through it — the ranker, the session guard, or the registry match. |
| **"What stops someone claiming they own a product they don't?"** | Nothing stops them *claiming* it — that is why a claim and evidence are stored as different things. A pick shows them their own product details; only a barcode or brand-plus-style-code match against the registry ever reaches a brand. |
| **"Is the AI doing real work, or writing text around a rule engine?"** | Both, deliberately. Bedrock does the vision and the conversation, and decides which tools to use; a deterministic ranker picks the outfit, so the model explains a selection it cannot override — and a reply listing outfits the ranker never built is refused. |
| **"What is your accuracy?"** | 92.8% on garment category, with a 95% interval of 89.3–95.3%, on 300 photos from an independent public dataset. I locked every answer by hash before the first model call and ran the exact code the app runs. The first round found 89.7% and one clear mistake — hoodies called outerwear — so I fixed it and re-measured on 300 fresh photos rather than the ones I tuned on. Exact type is 74.6%, which is why the person always confirms before anything is saved. |
| **"What would you do differently?"** | I built background removal before I had evidence it worked on real phone photos, and it erased white garments against pale walls. The fix was to stop cutting pieces out and show an honest bounded crop. |
| **"Do you take payments? Why no checkout?"** | No, on purpose. Shoppers buy on the brand's own site, and the brand pays Racked an 8% referral commission on those sales. A second checkout would compete with the brand's store and make Racked responsible for orders, returns and tax. A Stripe test checkout is built and tested but switched off; it accepts only test keys and fictional products. Nobody is billed during the pilot. |
| **"Who pays, and how much?"** | Brands, on two plans: $20 a month before a product crosses the privacy threshold, and $40 once it does. Set after talking with the pilot brands, in line with the apps small brands already pay for on platforms like Shopify. Consumers stay free. |
| **"How does this create financial value for a brand?"** | Wear and pairing evidence can inform restocks, production quantities, product design, merchandising and campaign creative. At $40 a month, avoiding 20 excess units at a $25 landed cost would cover a year; that is an explicit break-even scenario, not measured pilot ROI. |
| **"Does the pilot prove there is a market?"** | It is an early market signal: three independent apparel brands agreed to participate, created accounts and uploaded products, which is stronger than hypothetical interest. It does not yet prove willingness to pay, recurring demand or product-market fit, so those are the next validations. |
| **"What breaks first at scale?"** | Per-instance limits are only a first layer: shared DynamoDB counters and fail-closed model-call budgets now bound abuse and AI usage. Edge rate limiting and production-scale validation remain follow-ups, not claims. |

## Failure handling

| If this happens | Do this |
| --- | --- |
| The live scan is slow or fails | Cut to the backup clip, narrate it as the live path, continue. The fallback card is itself designed behaviour worth showing. |
| Bedrock is unavailable entirely | Show the **needs your label** card: no invented attributes, nothing lost, never a dead end. Hanger still answers from the wardrobe and says it was written without the stylist model. |
| A cohort is below 25 | That *is* the privacy demo. Show it and say so. |
| The podium laptop cannot sign in | Use the judge credentials delivered privately before demo day; they are seeded and verified beforehand. |
| The demo bag does not complete | Skip it. Say the purchase happens on the brand's own site, and show the brand dashboard's **sent to your store** readout instead. |
| You are at 4:00 with two segments left | Skip "how it was built" and close. Never let the red card interrupt the close. |

**Verification snapshot (2026-11-14):** 1154 tests in 137 files. Read the current README scorecard during the demo rather than memorising this dated count.

## Claims discipline

Say **observed**, not **caused**. Racked does not claim recognition accuracy beyond the [measured benchmark](evaluation-results.md), sales lift, conversion,
purchase intent, demographics, fit prediction, or production-scale validation. Racked takes no real payments: purchases happen on the brand's own site, and fictional products end in a $0.00 simulation. Every number on screen
during this demo is synthetic demonstration data and is labeled as such in the interface.
