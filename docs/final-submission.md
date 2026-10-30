# Final submission package

Prepared 2026-10-30 for the CUA Busch School AI Vibe Coding Contest, Fall 2026. Documents only: nothing here changes the app.

| # | What | Status |
| --- | --- | --- |
| 1 | [README checked against the five things the judges asked for](#1-readme-check) | Done. Three small gaps fixed in the README |
| 2 | [Three two-sentence summaries](#2-three-two-sentence-summaries) | Drafts, pick one |
| 3 | [Two-minute answer: "What happens when your AI gets it wrong?"](#3-what-happens-when-your-ai-gets-it-wrong) | Draft, about 2 minutes spoken |
| 4 | [Demo video shot list](#4-demo-video-shot-list) | Draft, 4:30 planned, written against the merged **Try the demo** |
| 5 | [Submission email](#5-the-email) | Draft with placeholders |

**To fill in before sending:** `[LIVE LINK]`, `[VIDEO LINK]` and `[Recipient name]`. Only if you also want judges to use the full demo accounts, the passwords go in from your private notes; never commit them to this public repository. **Try the demo** itself needs no password.

---

## 1. README check

The judges asked for five things. Each is checked against [README.md](../README.md) as it stands on `main`.

| # | The judges asked for | Where the README answers it | Verdict |
| --- | --- | --- | --- |
| 1 | **What the app does** | The bold opening line and the paragraph under it; [What This Is](../README.md#what-this-is) (three products in three lines); [Five-Minute Judge Path](../README.md#five-minute-judge-path) (the two flows, step by step) | Met |
| 2 | **Who it is for** | Implied by the list in *What This Is* ("a wardrobe and stylist for people", "intelligence for brands") but **never stated** | **Gap, fixed.** Added a *Who it is for* paragraph under that list |
| 3 | **Which AI service, and what the AI does** | The Stack row at the top (Amazon Bedrock, Nova Pro and Nova Lite); [How AI Is Used](../README.md#how-ai-is-used): a model table, what Hanger's tools do, what the AI is never allowed to do, a row per action saying whether it calls a model, and that Racked does not fine-tune the models | Met |
| 4 | **How to run it** | [Run It Locally](../README.md#run-it-locally), collapsed by default | **Gaps, fixed.** The copy step used the Windows-only `copy`, so it failed on macOS and Linux; `SESSION_SECRET`, which sign-in needs, was not mentioned; and nothing told a non-technical judge that no setup is needed to try the live app |
| 5 | **Safety design and disclaimer** | Safety design: [Privacy and Security](../README.md#privacy-and-security) (consent, `k ≥ 25`, private photos, AI never decides identity, hardened accounts, deletion). Disclaimer: the pieces were there but scattered, in the Evidence section and the pricing section | **Gap, fixed.** Added one *Disclaimer* paragraph at the end of Privacy and Security that gathers them |

### The README edits

All small, and all using facts the README already states elsewhere:

1. **Who it is for** (under *What This Is*): people who own more clothes than they can keep track of and want a private place to sort them out and get outfits from what they already have; and apparel brands that want to know how their products are really worn after the sale, without asking anyone to hand over a closet.
2. **Run It Locally**: `cp .env.example .env.local` with the Windows `copy` form beside it; one sentence saying nothing needs installing to try the live app with the demo accounts; and `SESSION_SECRET` (32 or more characters) named as the one required value, with `.env.example` listing the rest.
3. **Disclaimer** (end of *Privacy and Security*): the AI can be wrong and its measured accuracy is high but not perfect, which is why nothing is saved until a person confirms it; the demo accounts and cohort are synthetic and labelled `DEMO`; pricing is a proposal and nothing is billed; the claims Racked does not make; and that this is a contest entry, source-available for evaluation, not a finished commercial service.
4. **Documentation index**: a link to this page under *For judges*.

### Left alone on purpose

The test counts, file counts, verification dates and the build-log phase line, which [`tests/readme-numbers.test.ts`](../tests/readme-numbers.test.ts) pins; and the generated pilot and real-use blocks, which tests keep in step with their data files.

---

## 2. Three two-sentence summaries

For a general reader: who the user is, and what problem Racked solves. Each is exactly two sentences.

**A. Starts with the person**

> Racked is for anyone with a closet full of clothes and no good way to keep track of what they actually wear: you photograph what you own, and an AI stylist builds outfits from those clothes only. For the brands that make them, Racked answers a question they cannot answer today, how their products are really worn after the sale, without ever showing them a name, a photo or a wardrobe.

**B. Starts with the problem**

> Clothing brands know what people buy but not what they wear, and shoppers have no simple way to see what is sitting unused in their own closets. Racked gives shoppers a private wardrobe and an AI stylist that only uses clothes they own, and gives brands anonymous wear totals for their own products, released only when at least 25 people who chose to share are behind them.

**C. Starts with trust**

> Racked is a private wardrobe app for people who want to get dressed from what they already own, with an AI stylist that suggests outfits and never invents a piece you do not have. When people choose to share, brands see only anonymous group totals about how their products are worn, never who you are, what your photos show, or what else is in your closet.

**Which to use.** **A** if the reader is a shopper first. **B** if the reader is a brand or a business reader: it names both problems before the product. **C** if the reader's first worry will be privacy.

Every claim in them is already in the README: the stylist uses only owned clothes (*What This Is*); brands get aggregates for their own products only when at least 25 opted-in owners qualify; brands never receive names, photos or wardrobes (the opening paragraph). None uses a number that could go out of date.

---

## 3. What happens when your AI gets it wrong?

A two-minute spoken answer: 295 words, which is a little under two minutes at a normal pace of 150 words a minute, leaving room to read the numbers slowly. It uses only four sources: the round 2 results in [evaluation-results-r2.md](evaluation-results-r2.md), the confirm-before-save flow, `k ≥ 25` suppression, and Hanger's selection check.

> **[0:00]** It gets things wrong sometimes. We measured how often, and we built the app so a wrong answer is caught before it costs anyone anything.
>
> **[0:10]** We ran the exact scan the app uses on 300 photos from an independent public dataset, with the answers locked before the first model call. It put 272 of 293 garments in the right category: 92.8 percent, with a 95 percent interval of 89.3 to 95.3. So 21 were wrong, most often a dress called a top. Exact type, like chinos versus jeans, is lower, 74.6 percent. And nothing was marked as a verified brand product without registry evidence.
>
> **[0:42]** Now, what happens to a wrong guess? Nothing, until a person says so. The scan only proposes. Each piece is a card the person checks, the type field asks when the AI is unsure instead of guessing, and nothing joins the wardrobe until they tick the confirmation box and press Add. A wrong guess becomes a correction, not a wrong record.
>
> **[1:06]** The stylist is the second place AI can go wrong. Outfits come only from code that builds them from clothes you own. A check then compares every garment Hanger's reply names with that outfit. If the reply names anything else, it is replaced by one built from the real selection, and the screen says the stylist model did not write it.
>
> **[1:30]** The third place is the brand side. A brand sees nothing about a product until at least 25 opted-in owners are behind it, not even a count. Below that, Brand Hanger makes no AI call at all. It says why.
>
> **[1:46]** None of this makes the AI right. It makes a wrong answer visible and easy to fix. These are results on 300 photos, not a guarantee for every photo.

### Where each statement comes from (the answer, and the follow-ups below it)

| Statement | Source |
| --- | --- |
| 300 photos, independent public dataset, answers locked before any model call | [evaluation-results-r2.md](evaluation-results-r2.md): "Answers were locked in `data/evaluation-lock-r2.json` before any model call"; the section title names the dataset (CC BY 4.0) |
| The exact scan the app uses | Same page: it runs `detectLookOrManualReview` and `detectGarmentsInLook`, "the functions `POST /api/garments/detect` runs" |
| 272 of 293, 92.8%, interval 89.3%–95.3% | Same page, *Category correct* |
| 21 wrong, most often a dress called a top | 293 − 272 = 21; *Most common misses*: dress → top, 11 photos (top → dress, 6; four others, 1 each) |
| Exact type 74.6% | Same page, *Exact type correct*: 138 of 185 |
| Seven photos got no answer | Same page, *Service did not answer*: 7 of 300 |
| The person is offered manual entry | [README](../README.md#evidence-and-what-is-not-claimed) evidence table: timeouts "where the person is offered manual entry" |
| Nothing marked verified without registry evidence | Same page: "Products marked verified without registry evidence: 0 (must be 0)" |
| "Not a guarantee for every photo" | Same page, last line |
| Scan only proposes; cards; the type field asks when unsure | [`garment-intake.tsx`](../components/garment-intake.tsx): `typeNeedsInput`, and `save()` refuses with "Confirm the pieces before saving" until the box is ticked |
| Outfits come only from code that builds them from owned clothes | [`hanger-agent.ts`](../lib/hanger-agent.ts): outfits come only from the `build_outfits` tool, which runs the ranker over the account's own wardrobe; a reply that lists outfits the builder never made is corrected once, then abandoned |
| The selection check | [`hanger-conversation.ts`](../lib/hanger-conversation.ts): `consumerReplyPassesSelectionReview` rejects a reply that names an owned garment outside the selection shown; on rejection a reply built from the real selection replaces it |
| The screen says the stylist model did not write it | [`/api/agents/consumer`](../app/api/agents/consumer/route.ts): "The stylist model did not answer this turn, so this reply is composed from your wardrobe alone" |
| Nothing below 25, not even a count; no AI call below it | README (*Five-Minute Judge Path*, step 4); `generateBrandHangerReply` returns before any provider call when metrics are suppressed, and [`tests/brand-hanger-context.test.ts`](../tests/brand-hanger-context.test.ts) asserts zero provider calls |

### If they push

- **"Is 92.8% good enough?"** That is the reason for the confirm step: the 21 misses meet a person before anything is saved. The measured number is for category on these 300 photos, and exact type is lower at 74.6%.
- **"What about the seven with no answer?"** The service did not answer, 7 of 300, and the person is offered manual entry. Nothing is invented to fill the gap.
- **"Can the AI make a brand look good by guessing?"** No. It cannot verify a brand, and none of the 293 answered photos was marked as a verified product without registry evidence.

---

## 4. Demo video shot list

**Target 4:30. Hard maximum 4:59.** Two flows, the same two as the five-minute judge path ([JUDGES.md](../JUDGES.md)), entered through the **Try the demo** button.

> **How Try the demo works** (from the code merged in #196, checked against the sign-in screen's source). It is on the **sign-in screen**, not the home page: from the home page press **Sign in**. **Try the demo →** gives you a fresh private copy of the Judge Consumer wardrobe with no email or password; it expires after a day, and each click makes a new one. **Or see the brand side: try the demo brand**, a link under it, opens the shared Judge Brand **read-only**: opening products, the numbers and Brand Hanger all work, and adding products or Looks is refused. Each demo wardrobe has its own allowance of 12 scans and 30 Hanger messages, so there is room for retakes, and a fresh click starts again.

| Shot | Time | On screen | Action | Narration |
| ---: | --- | --- | --- | --- |
| 1 | 0:00–0:20 | The home page | Hold on it | "Brands know what people buy. They have no idea what people actually wear. And most of us have a closet full of clothes and no good way to use it. Racked fixes both, without anyone's closet ever being exposed." |
| 2 | 0:20–0:35 | Home page, then the sign-in screen | Press **Sign in**, then **Try the demo →** | "It's live on AWS. One click on the sign-in screen, no password, and every judge starts with the same wardrobe." |
| 3 | 0:35–1:20 | Consumer wardrobe | Tap **+**. Choose the photo you staged beforehand. Wait for the cards. Point to a card, then to a **Type** field that is asking. Tick the confirmation. Press **Add** | "I photograph a garment. Amazon Bedrock's Nova Pro model finds the visible pieces and proposes a category and type for each. They're proposals. Where the AI is unsure, the Type field asks instead of guessing. Nothing is saved until I confirm." |
| 4 | 1:20–2:00 | Hanger | Open **Hanger**. Ask: *What should I wear with this today?* Let the outfit cards load. Hover **Save** and **Record** | "Now I ask Hanger what to wear with it. Hanger is an AI stylist that chooses its own tools, but the outfit comes from a rules-based builder using only clothes this account owns, including the piece I just added. Save keeps it. Record logs the wear." |
| 5 | 2:00–2:10 | The sign-in screen, then the brand view | **Jump cut.** Sign out, then on the sign-in screen press **Or see the brand side: try the demo brand**. Cut the navigation; show only the arrival | "Now the brand side." |
| 6 | 2:10–2:40 | **Judge Limited Overshirt** | Open the product. Hold on the message | "This product has only four opted-in owners. Below twenty-five, the brand sees nothing. Not zeroes, not even the count. The page says why." |
| 7 | 2:40–3:20 | **Judge Signature Tee** | Open the product. Show the eight-week chart, repeat wear, then what it's worn with | "This one has fifty consenting owners, so the aggregate is released: wears over eight weeks, repeat wear, and what it's worn with. No names, photos, wardrobes or owner IDs. This is synthetic demo data, and it's labelled that way." |
| 8 | 3:20–3:50 | Brand Hanger | Ask: *Write me a campaign brief for this product.* Show the brief. Optional, if time allows: go back to the Overshirt and ask the same thing so the decline shows | "Brand Hanger writes the brief from the released totals only. On the four-owner product it declines, and it makes no AI call." |
| 9 | 3:50–4:15 | The README's **Evidence** table | Scroll to the 92.8% row and hold | "When the AI is wrong: category accuracy is 92.8 percent on 300 independent photos, with the answers locked first. Every miss meets a person's confirmation before anything is saved, Hanger's replies are checked against the real outfit, and brands see nothing under twenty-five." |
| 10 | 4:15–4:30 | Home page, live link and repository name as a caption | Hold | "Racked: a private wardrobe for people, wear intelligence for brands. The live link and the code are below." |

Ten shots, 270 seconds. The shot times run back to back with no gap.

### Before recording

- **Stage the scan photo.** Put one clear garment photo on the device, ideally a plain flat lay. A fresh scan can be slow; if it stalls, cut to a second take rather than narrating over a spinner.
- **Use only the demo accounts.** Everything in them is synthetic and labelled `DEMO`. Do not create accounts, and do not scan photos of real people.
- **No clean-up needed.** The scan adds a piece to your own private copy of the demo wardrobe, which expires by itself. If a take goes wrong, sign out and press **Try the demo →** again for a fresh one.
- **Do the brand side in a second, private browser window** already open on the sign-in screen, so you can cut straight to it. Two sessions in one window replace each other.
- **No password appears**, because **Try the demo** needs none. Do not sign in to any real account on camera.
- **Check the live site first, read-only.** `pnpm verify:live` checks the deployed site without signing in, `/api/version` should show a commit that includes #196, and **Try the demo →** should be on the live sign-in screen.
- **Record at 1920×1080**, browser at 100% zoom, notifications off. Add captions: judges may watch muted.
- **Check the length of the export**, not the plan: it must be under 5:00.

### Do not say

Anything about sales lift, purchase intent, demographics, fit, virtual try-on or production-scale results; Racked does not claim them (README, *Evidence, and what is not claimed*). Say "synthetic demo data" whenever a brand number is on screen.

---

## 5. The email

Subject: **Final Submission: James Harris, Racked**

"The five items" are the five things the judges asked for, the same ones checked in section 1. If you meant five different deliverables, only the numbered list in the middle changes.

```text
Subject: Final Submission: James Harris, Racked

Hello [Recipient name],

Here is my final submission for the CUA Busch School AI Vibe Coding Contest,
Fall 2026: Racked, a private wardrobe and AI stylist for people, and
post-purchase wear intelligence for brands.

Links
- Live app:         [LIVE LINK]
- Demo video:       [VIDEO LINK] (under 5 minutes)
- Code and docs:    https://github.com/manof1color/racked-wardrobe-intelligence
- One screen for judges: https://github.com/manof1color/racked-wardrobe-intelligence/blob/main/JUDGES.md

Fastest way in: open the live app, press Sign in, then "Try the demo". No
email and no password; you get a fresh private copy of the demo wardrobe.
"Try the demo brand" on the same screen opens the brand side, read-only.

The five things you asked for (each is also answered in the README):

1. What the app does. A person photographs their clothes, confirms what the
   AI found, and gets outfits built only from what they own. A brand learns
   how its products are actually worn, from people who opted in, in groups
   of at least 25, without ever seeing a name, a photo or a wardrobe.

2. Who it is for. People who own more clothes than they can keep track of
   and want a private place to sort them out and get outfits from what they
   already have; and apparel brands that want to know how their products
   are really worn after the sale.

3. Which AI service, and what it does. Amazon Bedrock: Nova Pro (Nova Lite
   as a fallback). It finds the garments in a photo and proposes a category
   and type for a person to confirm, and it powers Hanger, an AI stylist
   that decides which tools to use. The outfit itself comes from a
   rules-based builder over the clothes the person owns. Measured on 300
   independent photos with the answers locked first, the scan placed 92.8%
   of garments in the right category (95% interval 89.3%-95.3%). Racked
   does not fine-tune the models.

4. How to run it. The quickest way is the live app: "Try the demo" on the
   sign-in screen, no password. To run it locally you need Node.js 22.13 or newer and pnpm 11.9.0:
   pnpm install --frozen-lockfile, copy .env.example to .env.local and set
   SESSION_SECRET, then pnpm dev. Account and upload features also need an
   AWS DynamoDB table and a private S3 bucket. The README's "Run It
   Locally" section has the details.

5. Safety design and disclaimer. Sharing with brands is off until a person
   turns it on. Nothing is released below 25 opted-in owners, and brands
   never receive names, emails, photos or wardrobes. Photos are kept in
   private encrypted storage, and nothing the AI proposes is saved until a
   person confirms it. The AI can be wrong; the demo accounts and data are
   synthetic and labelled DEMO; pricing is a proposal and nothing is billed;
   and I make no claim of sales lift, purchase intent or production-scale
   validation.

Full demo accounts, if you want to enrol a product or start from an empty
wardrobe (synthetic data):
- Consumer: judge.consumer@racked.local
- Brand:    judge.brand@racked.local
- Passwords: [DEMO PASSWORDS - paste from your private notes, or delete this
  block if Try the demo is enough. Do not commit them to the repository.]

Thank you for your time.

James Harris
```

### Before you send

- [ ] Replace `[Recipient name]`, `[LIVE LINK]` and `[VIDEO LINK]`.
- [ ] Either paste the demo-account passwords from your private notes or delete that block from the email. They must never go into this file or the repository.
- [ ] Open `/api/version` on the live site and confirm it reports the commit you meant to submit, and that **Try the demo →** is on the sign-in screen.
- [ ] Watch the exported video once: under 5:00, audible, and no password visible.
- [ ] Click every link in the email from a signed-out browser.
