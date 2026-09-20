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

1. **Open with something that cannot be staged.** Scan a garment you are wearing, live. It answers
   "does this actually work" in the first minute, before anyone wonders.
2. **Show one boundary, not five.** Verified versus your pick is the intellectual core. Everything
   else is supporting evidence.
3. **Never stand in silence.** If a network call is slow, keep talking and cut to the backup clip.

---

## 0:00–0:40 — The problem, in one breath

Open the landing page. Say:

> *"Brands know what you bought. They have no idea what you actually wear. A sale is where most
> brands stop seeing — they can't tell whether a product became a staple, sat unworn, or only works
> with one other thing someone owns. Racked measures what happens after checkout, and gives brands
> that picture without ever showing them a person's closet."*

Do not explain the architecture yet. Do not list features.

## 0:40–2:00 — Live scan (the thing that cannot be faked)

1. Sign in as the judge Consumer account, tap **+**, and photograph **a garment you are wearing** —
   take off a jacket, put it on the table. A plain surface works best.
2. Say it while it runs: *"That is a live call to Amazon Bedrock. Nova Pro is finding each garment
   in the photo and returning bounded coordinates and controlled attributes right now."*
3. When the cards appear, land on two details and move on:
   - the whole piece is visible in its own crop, and
   - when AI is unsure, the **Type** field *asks* instead of guessing, and keeps whatever is typed
     in the person's own words.
4. Save it. It is in the Closet.

> **If the scan stalls past ten seconds:** keep talking, cut to the backup clip, and say *"that's the
> live path — here it is completing on a better connection."*

## 2:00–3:00 — The boundary: verified versus your pick

This is the segment to slow down in. Open **Is this a brand product?** on the piece just saved.

1. **Search the brand.** Type the brand name, pick the product, tap **This is mine**. It links, and
   the Closet labels it *your pick*, with cost per wear from the brand's listed price.
2. **Then add the code from the label** and check the registry. Now it reads *Verified*.
3. Say the difference out loud:

> *"Those look the same and they are not. The first is a claim — someone said this is their jacket.
> The second is evidence: a barcode, or the brand together with its own style code, checked against
> what that brand enrolled. Only the second one joins the brand's owner index, only the second one
> makes a piece shoppable in a public look, and only the second one counts toward what a brand sees.
> A photo, a file name, or a typed brand name has never been enough, and the tests fail if that ever
> changes."*

## 3:00–4:00 — Privacy, seen working

1. Switch to the Brand workspace. Open the **below-threshold product**: *"Fewer than 25 opted-in
   owners means the brand sees nothing — not zeroes, not a sample. It doesn't even see the count,
   because three owners is itself identifying."*
2. Open the released product beside it: a real wear chart, repeat-wear rate, what it gets worn with.
   *"Same code, same query — the only difference is that enough people opted in."*
3. One line on what a brand never receives: names, emails, photographs, raw wardrobes, owner IDs.

## 4:00–4:40 — How it was built

Open the repository on the podium laptop. This is 15% of the rubric and most presenters skip it.

> *"457 tests, and CI runs lint, type check, tests, a production build, a dependency audit, and
> CodeQL before anything merges. Forty-six phases of merged pull requests, each one naming the defect
> it fixed. Writing the session tests turned up a real one: a signed token with an extra segment was
> being accepted. Found it, fixed it in the same change, wrote it down."*

Then the honest boundary: *"Every number on screen today is synthetic demonstration data, labelled
in the interface. I don't claim recognition accuracy, sales lift, or purchase intent."*

## 4:40–5:00 — Close

> *"Consumers stay free, because the wardrobe has to earn its place on its own. Brands pay, because
> post-purchase wear is what they cannot get anywhere else. Pricing is published and nothing is
> billed today."*

Close on the loop: **consumer utility → confirmed wear → privacy-safe brand intelligence.**

---

## Prepared answers for the 3-minute Q&A

Judges score here. Answer in two sentences, then stop.

| Likely question | Answer |
| --- | --- |
| **"How do you solve cold start? An empty closet is useless and a brand sees nothing until 25 owners."** | The consumer side has to be worth using alone — organizing a closet, building outfits, cost per wear — and it is. Brand intelligence switches on later, per product, and until it does the dashboard says so plainly instead of showing invented numbers. |
| **"How much of this did you actually write?"** | I directed it and reviewed every change; the history is public, phase by phase. Open any file and I will walk you through it — the ranker, the session guard, or the registry match. |
| **"What stops someone claiming they own a product they don't?"** | Nothing stops them *claiming* it — that is why a claim and evidence are stored as different things. A pick shows them their own product details; only a GTIN or brand-plus-style-code match against the registry ever reaches a brand. |
| **"Is the AI doing real work, or writing text around a rule engine?"** | Both, deliberately. Bedrock does the vision — finding and describing garments in one photo — and a deterministic server-side ranker picks the outfit, so the model writes the explanation for a selection it cannot override. If the reply names a piece that isn't in the selection, it is rejected before it is shown. |
| **"What is your accuracy?"** | I don't claim one. I ran a reproducible crop benchmark at 86% mean IoU, and recognition accuracy needs an independent labelled benchmark I have not run — so I don't report a number I cannot defend. |
| **"What would you do differently?"** | I built background removal before I had evidence it worked on real phone photos, and it erased white garments against pale walls. The fix was to stop cutting pieces out and show an honest bounded crop. |
| **"Who pays, and how much?"** | Brands. $25 per SKU to enrol, $149 a month once a product crosses the privacy threshold, $29 before it does — priced low deliberately, because a brand under the threshold gets benchmarks, not customer data. |
| **"What breaks first at scale?"** | The per-instance rate limiter, which is a first layer and not a WAF, and the Bedrock cost curve on scan volume. Both are named in the README rather than left for someone to find. |

## Failure handling

| If this happens | Do this |
| --- | --- |
| The live scan is slow or fails | Cut to the backup clip, narrate it as the live path, continue. The fallback card is itself designed behaviour worth showing. |
| Bedrock is unavailable entirely | Show the **needs your label** card: no invented attributes, nothing lost, never a dead end. |
| A cohort is below 25 | That *is* the privacy demo. Show it and say so. |
| The podium laptop cannot sign in | Use the judge credentials from the submission email; they are seeded and verified before demo day. |
| You are at 4:00 with two segments left | Skip "how it was built" and close. Never let the red card interrupt the close. |

## Claims discipline

Say **observed**, not **caused**. Racked does not claim recognition accuracy, sales lift, conversion,
purchase intent, demographics, fit prediction, or production-scale validation. Every number on screen
during this demo is synthetic demonstration data and is labeled as such in the interface.
