# Racked — Privacy-First Wardrobe Intelligence for Consumers and Brands

[![Validate Racked](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml)
[![CodeQL](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml/badge.svg)](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/codeql.yml)

**Live application:** https://main.d2iv0khybuuaeh.amplifyapp.com
**Planned pricing:** https://main.d2iv0khybuuaeh.amplifyapp.com/pricing
**GitHub:** https://github.com/manof1color/racked-wardrobe-intelligence
**Stack:** Next.js 15 · React 19 · TypeScript · AWS Amplify (SSR) · DynamoDB · private S3 · Amazon Bedrock Nova Pro + Nova Lite · GitHub Actions · CodeQL

---

## Start Here

**New to this repository?** Pick the row that matches how much time you have.

| If you have… | Go to | What you get |
| --- | --- | --- |
| **5 minutes** | [Five-Minute Judge Path](#five-minute-judge-path) | Four clicks through the live app, no sign-in needed for most of it |
| **Credentials** | [Demo Access](#demo-access) | Judge Consumer and Judge Brand accounts, and why passwords are not in this repo |
| **The headline numbers** | [Competition Proof Point](#competition-proof-point) | 76 wears / 25 owners / 88% engagement per hero SKU, clearly labeled synthetic |
| **A rubric to score** | [Rubric Alignment](#rubric-alignment) | Each weighted category mapped to what is actually built |
| **To judge the AI** | [Why the AI Is Substantive](#why-the-ai-is-substantive) | Six concrete AI capabilities and the boundaries around each |
| **To see how a scan works** | [Adding a piece from one photo](#adding-a-piece-from-one-photo) | Five steps, what happens when AI isn't sure, and an honest note on training |
| **A measured result** | [Garment Isolation](#measured-garment-isolation) | 86% mean IoU on a reproducible crop benchmark — and why live intake still uses the plain crop |
| **To judge the engineering** | [Architecture](#architecture-overview) · [Key Files](#key-files) · [CI](#ci--github-actions) | Trust boundaries, the module map, and the green gate |
| **To judge the ethics** | [Privacy Boundaries](#security-and-privacy-boundaries) · [Ethical Stance](#ethical-stance-and-claims) | `k ≥ 25`, consent, and an explicit list of what is *not* claimed |
| **To see how it was built** | [PROGRESS.md](PROGRESS.md) | Real merged-PR history, phase by phase |
| **To use the product** | [User workflow](docs/user-workflow.md) | The Consumer and Brand journeys, step by step |

---

## What This Is

**Brands know what consumers buy. Racked helps them understand what consumers actually wear.**

Racked is a privacy-first wardrobe-intelligence platform with two connected products: a mobile wardrobe and outfit assistant for consumers, and an aggregate actual-wear dashboard for enrolled brands.

The consumer side has to earn its place on its own — organizing a closet, building outfits, recording what actually gets worn, and answering *"how much of this look can I already make?"* — all before any brand relationship exists. Only then do brands receive consented, minimum-cohort intelligence about their own verified products. Never identities, raw wardrobes, or private photos.

The core question: **what happens to a garment after checkout, and how can a brand learn from that without ever seeing someone's closet?**

The answer this system demonstrates: confirmed wear, repeat use, and styling pairings released only above a 25-owner consent threshold — and, when someone explicitly publishes an outfit, that real-world wear becoming product discovery without the private wardrobe behind it ever becoming public.

---

## Five-Minute Judge Path

1. Open [Community](https://main.d2iv0khybuuaeh.amplifyapp.com/community) to see complete Consumer and Brand Looks with explicit product-resolution states.
2. Use the synthetic Recreate Consumer from the [demo checklist](docs/demo-checklist.md) on **Synthetic Consumer Look 01**. The live deterministic result is **62% coverage**: one exact owned product, one strong owned substitute, and one genuinely missing category.
3. Sign in with a privately supplied synthetic Brand account to inspect the 25-owner privacy threshold, eight-week wear chart, frequency distribution, CSV export, public-look activity, and Brand Hanger.
4. Open a fictional demo product destination, add it to the **Demo Bag**, and complete the clearly labeled **$0.00 purchase simulation**. This proves the commerce journey without collecting payment, shipping, contact, or order data.

---

## Demo Access

| Account | Address | What it shows |
| --- | --- | --- |
| Judge Consumer | `judge.consumer@racked.local` | Ten varied wardrobe pieces, a realistic wear spread, two saved outfits, consent already on |
| Judge Brand | `judge.brand@racked.local` | One product above the 25-owner threshold showing released metrics, one deliberately below it showing suppression |
| Synthetic cohort | 25 `DEMO` consumers, 3 fictional brands | Community feed, Recreate This Look, public-activity metrics |

**Passwords are deliberately not in this repository.** All demonstration accounts authenticate against a runtime-only secret supplied when the seed is run, and credentials are handed to judges in the competition submission packet. This repository is public: a committed password would let anyone alter the demonstration data before it is reviewed. See [docs/test-cohort.md](docs/test-cohort.md).

The public pages — landing, Community, brand profiles, fictional storefronts, and pricing — need no sign-in at all, so most of the judge path is reachable immediately.

---

## Competition Proof Point

The deterministic, clearly labeled synthetic cohort gives **each of three hero products 76 confirmed wears across 25 opted-in owners**. This is not claimed customer traction; it demonstrates the exact post-purchase intelligence Racked can calculate and the privacy gate required before a brand may see it.

| Demonstration signal | Verified synthetic result | Business question it answers |
| --- | ---: | --- |
| Eligible cohort | 25 opted-in owners per hero SKU | Is the group large enough to release safely? |
| Actual use | **76 confirmed wears per hero SKU** | Is the purchased product entering real rotation? |
| Engagement | **22 of 25 active owners (88%)** | How many owners have worn it at least once? |
| Repeat use | **19 of 25 repeat wearers (76%)** | Is the product earning repeated use? |
| Zero-wear opportunity | **3 of 25 owners** | Where might education or styling support help? |
| Public activity for the apparel hero SKU | **11 outfit appearances · 37 inspirations · 15 Recreate requests** | How does actual styling translate into discovery? |

> **Judge note:** Real accounts begin empty and persist to account-owned AWS records. The [three-brand, 25-person synthetic demo cohort](docs/test-cohort.md) exercises apparel, footwear, jewelry, private wear analytics, and public Community activity; every seeded record is classified `DEMO` and never represented as commercial evidence.

---

## Why This Matters

Purchase history stops at the transaction. It cannot show whether a product was worn once, became a repeat favorite, stayed untouched, or anchors outfits with other categories. Racked closes that gap while giving the consumer — not the brand — control of the underlying wardrobe data.

The result is a defensible two-sided loop:

1. **Private consumer utility:** organize a wardrobe, build outfits, record wears, and get grounded styling help.
2. **Consent-based brand intelligence:** release actual-wear aggregates only for verified products and cohorts of at least 25 opted-in owners.
3. **Optional public discovery:** turn only deliberately shared outfits into explainable Recreate results and controlled product destinations.

---

## Why the AI Is Substantive

- **Multi-piece garment vision:** Amazon Bedrock instance-detects each visible wardrobe piece in a general photo, returns bounded coordinates and controlled attributes, and lets the server create a separate private item image for every selected detection. Each piece is shown as its bounded crop — the recognised box plus a margin, with the photograph intact — and no further remote call is made per piece, so one crowded-rack scan cannot turn into sixteen additional provider waits. Background removal was taken off this path after it erased correctly recognised white garments on real phone photos. It never infers personal traits or grants verified product identity.
- **Garment attributes:** every detected piece arrives with a controlled category and subtype plus colour, pattern, material, style, confidence, and visible evidence, which the person confirms or corrects before saving. A separate three-view analyzer (front, back, and label) is kept as the independent evaluation benchmark path, not as a live intake step.
- **Consumer Hanger:** a multi-turn agent reloads only the signed-in consumer's wardrobe, wear history, saved outfits, and private clothing signals from Community Looks that person intentionally saved as inspiration, then returns grounded styling guidance and validated save/wear actions. The conversation itself is stored on the account, so reopening Hanger continues it rather than starting over. Standing preferences stated in it — "I never wear heels" — are remembered in a controlled vocabulary and applied to later outfits, and both the conversation and those preferences can be cleared from the panel. Context is budgeted rather than assumed: the newest turns that fit a character budget are sent, and older ones are counted and declared instead of invented. Current instructions always outrank historical inspiration. Explicitly requested owned garments are locked before scoring—even when recently worn or previously suggested—and the remaining pieces are selected around them. One canonical server selection drives the written list, private photo cards, action IDs, saved title, and flat-lay order; generated prose that names a different owned garment is rejected.
- **Brand Hanger:** a separate agent receives only that brand's enrolled product plus privacy-released aggregate wear and public-community metrics; suppressed cohorts remain suppressed in the prompt.
- **Server-side outfit ranking:** explicit natural-language inclusion requests resolve only to unambiguous, account-owned garments and act as hard constraints. The server then scores the remaining pieces on occasion, weather, requested style, underuse, and time since last worn—never allowing low-wear scoring or the model to override a named piece. Selection is deterministic, exclusions are respected, and unknown or ambiguous descriptions cannot invent an item.
- **Explainable decisions:** Recreate This Look and Similar Products use inspectable weighted attributes rather than an opaque score. Similarity can suggest a substitute, but only authorized registry GTIN or brand-plus-SKU evidence can verify exact identity.


### Which engine runs where

A reviewer asked whether the scoring engine is tested as rigorously as the auth layer, and named
`lib/matching.ts`. That module is *not* on a live request path, so this table says plainly which
code answers a real request.

| Decision a person sees | Engine | Runs in |
| --- | --- | --- |
| Which pieces Hanger puts in an outfit | `lib/outfit-ranking.ts` | `POST /api/agents/consumer` |
| "Recreate with my wardrobe" coverage and per-piece evidence | `lib/recreate-look.ts` | `POST /api/community/[postId]/recreate` |
| Similar product suggestions | `lib/similar-products.ts` | `GET /api/products/similar` |
| Which garments a photo contains | `lib/look-garment-detection.ts` | `POST /api/garments/detect` |
| Which enrolled products look like a scanned piece, and catalog search | `lib/catalog-match.ts` | `GET`/`POST /api/catalog` |
| A brand product's details, read from its photo | `lib/product-description.ts` | `POST /api/brand/products/describe` |
| Whether a brand may see an aggregate at all | `lib/privacy.ts`, `lib/metrics.ts` | `POST /api/brand/metrics` |

`lib/matching.ts`, `lib/segments.ts`, `lib/retention.ts`, `lib/agents.ts` and
`lib/brand-wear-insight.ts` are a **reference implementation of the analytics layer**. No route
imports them. They are kept because the privacy tests drive the `k >= 25` suppression boundary
through them, and they are not counted as shipped product behaviour.

### Coverage, measured

`node --test --experimental-test-coverage` over the whole suite: **96% of lines, 85% of branches,
95% of functions**. The decision engines, by branch coverage: `privacy.ts` 100%,
`similar-products.ts` 97%, `matching.ts` 98%, `outfit-ranking.ts` 94%, `recreate-look.ts`
99%. Coverage shows what the tests execute, not that the scoring is *right*; the
per-band, tie-break, and uncertainty numbers in `tests/recreate-look-scoring.test.ts` are the part
that argues for correctness.

---

## Architecture Overview

```text
                 Phone / desktop browser (PWA installable)
                     │  HTTPS · signed HTTP-only session cookie
                     ▼
      ┌──────────────────────────────────────────────────────┐
      │  AWS Amplify Hosting — Next.js 15 SSR + API routes   │
      │  auth (scrypt) · role checks · rate limits · HMAC    │
      │  garment-save confirmation · aggregate-only review   │
      └──────┬───────────────────┬──────────────────┬────────┘
             │                   │                  │
             ▼                   ▼                  ▼
   Amazon Bedrock          DynamoDB (on-demand)   Private S3 (encrypted,
   Nova Pro: whole-look    single table:          public access blocked):
   instance detection      USER#/GARMENT#/OUTFIT#/ evidence photo +
   Nova Lite: garment      PRODUCT#/WEAR#/         auto-cropped display
   analysis + Hanger       COMMUNITY/AGGQ#          image, 1-hour links
             │                   │
             └──── consent filter → k ≥ 25 threshold → enumeration budget
                   (brands receive released aggregates only — never
                    names, emails, photos, raw wardrobes, or owner IDs)
```

**Infrastructure:** AWS Amplify Hosting (SSR) · DynamoDB single-table, on-demand · private encrypted S3 with public access blocked · Amazon Bedrock from `us-east-2`. Whole-look instance detection uses the US Nova Pro geographic profile; routine garment analysis and both Hanger agents remain on Nova Lite. The synchronous scan stores a bounded crop per piece and makes no per-piece segmentation request. The deployed Amplify compute role has scoped DynamoDB, private S3-object, and Bedrock permissions. The committed template also describes narrowly scoped SES sending for password recovery, but that separate permission and SES sender readiness are not claimed as deployed. No AWS credentials or secrets are committed to GitHub.

---

## Working Product Flows

### Consumer

#### Adding a piece from one photo

**One photo is the only way in.** An outfit, a flat lay, a closet shelf, or a shoe rack becomes up to 16 separate wardrobe pieces, each on its own card for the person to check.

| Step | What the person sees | What happens underneath |
| --- | --- | --- |
| **1. Photograph** | **Take photo** or **Choose image** | JPEG, PNG, WebP, HEIC, HEIF, or AVIF up to 25 MB, compressed in the browser before private upload |
| **2. Recognise** | One card per piece, showing the **whole** piece | Amazon Bedrock Nova Pro finds every garment, shoe pair, bag, and accessory and names its **category** and **type** |
| **3. Check the type** | A filled-in **Type** field — or one that asks | Low confidence, an unknown category, or a type Racked has no name for highlights the field and shows a short note *beneath* it |
| **4. Link a brand** *(optional)* | "Is this a brand product?" | A barcode, or brand plus style code, is checked against the enrolled brand registry |
| **5. Save** | Tick the pieces to keep | Nothing reaches the wardrobe until the person confirms |

**When the AI isn't sure what something is, the person types it.** The Type field takes free text with suggestions, and the photograph stays fully visible while they decide: the note sits under the field, never over the image, and a regression test fails if any intake style positions something on top of the photo.

| Typed | Saved as | Why |
| --- | --- | --- |
| `Chelsea boot` | Chelsea Boots | Matches a controlled type exactly |
| `white high top sneakers` | High-Top Sneakers | The most specific known type inside the phrase beats plain "sneakers" |
| `hoodie` on an unclassified piece | Top · Hoodie | The words settle the category as well |
| `Jordan 3 Retro` | Other Shoes · "Jordan 3 Retro" | No controlled type fits, so the person's own words are kept beside the category's *Other* type and shown in Closet |

Mapping onto controlled types matters because outfit ranking and Community filters depend on them; keeping unmatched words means nothing a person types is thrown away. The form will not save a piece whose category is still unknown, and **typed words never verify a brand**.

**Previews show the whole piece.** Each crop keeps an 8% margin around the box the model drew, so a tight box cannot clip a hem or a chain, and scan and Closet previews show that crop *contained* on a plain ground — never zoomed to fill the tile, and never under the category label or wear button.

> **Is the AI trained on clothing photos? Not by Racked — and this README says so rather than implying it.** Racked uses Amazon Bedrock Nova models as supplied and does not fine-tune them. Fine-tuning would need a Bedrock model-customisation job, dedicated capacity to serve the result, and a labelled clothing dataset licensed for commercial use; this project has none of those. Recognition is *grounded* instead — prompts carry the controlled taxonomy and a 23-class generic footwear reference with visible construction cues — and the Type field covers what the model misses. The detection prompt was deliberately **not** lengthened further: whole-look recognition runs against an 18-second deadline and has already produced mobile 504s. Accuracy is to be measured on the [independent evaluation dataset](#independent-evaluation-dataset), not asserted.

<details>
<summary><strong>Recognition and cropping pipeline — technical detail</strong></summary>

- Nova Pro scans the full image top-to-bottom and left-to-right, inventories it row by row or shelf by shelf, then checks again for missed regions.
- A matching left and right shoe is **one wearable pair**, not two entries. A deterministic guard joins the sides if the provider returns separate boxes; adjacent different pairs stay separate.
- Footwear is grounded on a repository-owned reference of 23 generic shoe classes, their aliases, and visible cues. It improves consistency without pretending appearance proves a brand or exact product.
- Auto-filled names become grammatical labels — **White Sneakers** for a pair, **White Sneaker** for one unmatched shoe — and anything the person edits stays exactly as written.
- If the Pro profile is rejected immediately for configuration or permission, Racked retries once on Nova Lite. A timeout never triggers a second wait.
- Whole-look recognition has a shorter deadline than general vision, so cropping and private storage keep part of Amplify's request budget.
- The server cuts one private image per piece: the recognised box plus an 8% margin, zoomed to the garment with the photograph intact. Background removal is deliberately **off** in live intake — on real phone photos it erased white trousers and a white sneaker against pale surroundings, and a crop that keeps the whole garment beats a cut-out that may lose it. Recognition is the only remote vision call in this path.
- A recognition outage or malformed response becomes one zero-confidence, editable **needs your label** card rather than a rejected photo or invented attributes. Overlapping or hidden pieces may need a second photo.
- Intake used to open on a choice between "one photo" and "link a brand product", which asked people to know in advance whether a garment was enrolled — and choosing wrong was permanent. One flow with per-piece linking removed that trap.

</details>

**Linking a brand product** is offered on each piece rather than chosen upfront. Every card states which it is — **brand product**, an ordinary **your garment**, or one that **needs your label**. A match requires a GTIN, or a brand alias together with that brand's SKU; **a brand name alone verifies nothing**, typed or AI-read, and a piece that matches nothing is saved as an ordinary garment rather than blocked. Codes match only as whole codes: a barcode inside a longer number, or `EX-1001` against an enrolled `EX-100`, verifies nothing, and a UPC-A on the label matches the same product stored as EAN-13 or GTIN-14. When a piece is saved, the server checks the label text against the registry again and stores the link itself; the browser cannot name a product to link. This boundary is regression-tested at the intake entry point.

**No label? Find the product anyway.** Care labels get cut out and codes fade, so a piece can also be linked without one. Opening *Is this a brand product?* shows up to three enrolled products that **look like** the scanned piece — same category required, a contradicting type rules a product out, and a brand name read off the piece counts for 30% — each with its reason; or the person **searches** the brand they bought from by brand, product name, or style code. *This is mine* saves the product as the owner's **pick**: their Closet shows its details and, where the brand lists a price, its cost per wear. A pick is never verified identity: it never enters the brand's owner index, never makes a Community piece shoppable, and never counts toward brand aggregates. Adding the label code upgrades it to verified at any time. Why a small reward and not a bigger one is set out in [docs/brand-linking-incentives.md](docs/brand-linking-incentives.md). Linking a product is separate from sharing data with that brand, which remains an explicit Settings preference.

Signed-in navigation behaves like a mobile app: persistent bottom tabs are the single primary menu, the header control is a session-only account menu, and desktop keeps top navigation. On iPhone the tab bar stays on the visible bottom edge even when the browser's viewport drifts after the keyboard closes, and it steps aside while you type. Visiting `/` or `/login` with a valid session returns to the right workspace, and only a *successful* sign-out ends a session — a failed request leaves it active rather than pretending it worked.

> **Verified in production (2026-08-15):** an authenticated scan of the repository-owned synthetic fixture reached Bedrock and returned one editable candidate at 90% confidence, which was not saved. That confirms the deployed selection → preparation → upload → detection → review path end to end. A physical-iPhone HEIC capture remains the one device-specific test still outstanding.

The full enrollment-to-discovery path:

1. Create a Consumer account with explicit image-processing consent.
2. Photograph an outfit, a flat lay, or a rail. Bedrock detects each piece with a controlled category and subtype — see [Adding a piece from one photo](#adding-a-piece-from-one-photo).
3. Each piece is stored as its bounded crop beside the preserved private source photo, and arrives as an editable card.
4. The consumer confirms or corrects name, category, and type, and may add a label code to link an enrolled brand product. Only registry GTIN or brand-plus-SKU evidence verifies — AI text and typed brand names never do.
5. Nothing is saved until the consumer confirms. Unverified garments remain usable, and any piece can later be deleted from the Closet.
6. The Looks view builds outfits from saved garment photos in a category-arranged flat-lay preview, saves them, and records wear.
7. The Outfits tab lists every saved outfit with its pieces and wear total, records a repeat wear in one tap, and offers separate two-step controls to remove one piece or delete the entire outfit. Piece removal regenerates the private flat-lay but leaves the garment in the wardrobe; whole-outfit deletion removes the saved look and board while retaining historical wear events.
8. Hanger opens from the bottom of the dashboard as a multi-turn stylist. Every message reloads the account's current wardrobe, wear history, and saved outfits; grounded recommendations can be saved or recorded as worn, and a successful Hanger save appears in the Outfits tab immediately without a reload. Natural follow-ups including “adjust,” “redo,” “try again,” and “use my other pieces” use owner-validated prior recommendation IDs plus the latest saved outfit to maximize new pieces. Repeating the same outfit-creation prompt also rotates through unseen pieces, while non-outfit advice remains deterministic. Conversation memory is bounded at 100 owned IDs; repeats occur only after a category runs out of unseen options or that bound is reached. The conversation, the preferences learned from it, and the pieces already suggested live on the account, so closing the drawer or switching device continues the same conversation. Hanger shows the actual private garment images attached to the Save action. The written list, visual cards, action IDs, saved title, and generated board all come from the same ordered selection, and the client blocks persistence if those IDs ever diverge.
9. In Community, **Recreate with my wardrobe** compares a public outfit only against the signed-in consumer's wardrobe. The result leads with how much of the look they can already build, splits pieces into *use yours* and *you're missing* in plain language, and lets them open any matched piece to see which owned garment was chosen and why. **Shop the Look** then opens an in-app inspection sheet where only an exact registry-verified product with an authorized destination is openable — similar, AI-estimated, unverified, and unavailable pieces are labeled as such rather than sold, with affiliate disclosure where relevant. The rate-limited Similar Products API separately ranks only enrolled, available, same-category registry products with inspectable reasons; a suggestion never becomes an exact-match claim or exposes a consumer wardrobe.
10. The consumer may separately opt in to anonymous brand aggregates and may publish one explicitly selected saved outfit to Community. Every public garment gets a new public ID; private wardrobe IDs and S3 keys never enter the feed.

Saved Looks also generate a private, static flat-lay board from each garment's saved image on a clean white canvas. Category-aware placement keeps layers toward the top, bottoms lower, footwear at the base, and accessories toward the corners. Original evidence photos remain unchanged and private.

### Brand

1. Create a Brand account bound to the represented brand name. A brand name belongs to one account, and well-known names (Nike, Adidas, Levi's, and the rest of the major-brand list) are reserved, because signing up is not evidence of representing them.
2. Enroll a product from **one product photo** and its SKU/MPN, with an optional GTIN and aliases. **Fill in from photo** runs the same Bedrock recognition as a consumer scan and proposes the name, category, type, colour, pattern, and material; the brand checks every field, and the photo is read in memory and stored only if the product is enrolled. Those attributes are what let a consumer's scan recognise the product without its label. Back and label photos and label text are optional, since no match ever read them. A GTIN must pass its GS1 check digit; one GTIN, and one style code per brand, maps to exactly one product; and an alias may not name another brand. Every check runs before any photo is stored.
3. Consumer label evidence can connect a wardrobe item to the brand-authorized registry record, and a consumer can also find the product by search or recognition, which links it as their own pick.
4. Keep the catalog current: a product's name, category, type, colour, pattern, material, style, price, availability, destination links, and aliases are editable, and the catalog is searchable. **Identity is not editable** — the brand, style code, and barcode a label is matched against are fixed, because changing them would move every existing link to a different product; a wrong record is retired and enrolled again. **Retiring** stops a product answering labels, searches, suggestions, and its public page, while everyone who already owns it keeps their piece and its recorded wear.
5. The Brand dashboard reports actual wears, active owners, and repeat-wear rate only when at least 25 opted-in owners qualify.
6. Hanger on the Brand dashboard supports follow-up strategy conversations but is restricted to the brand's own products and the same consent-filtered, `k ≥ 25` aggregates.
7. A Consumer can save a public Look as **Hanger inspiration**. Racked privately retains only bounded garment/style signals under that Consumer account, counts one public inspiration, and never gives the creator or a Brand the liker identity. Hanger uses those signals only when the current request does not specify a conflicting style.
8. A brand can create a clearly labeled Brand Look using only its enrolled products. Optional product/affiliate destinations are validated public HTTPS links; Racked records aggregate outbound interest and redirects to external checkout.

### Account access

Signed-in Consumer and Brand accounts have a Settings screen for their own display name, email, and password. Every update requires the current password; changing it re-hashes with a new salt, invalidates other sessions through a session version, and renews only the current session. Forgot-password links are random, stored only as hashes, expire after 30 minutes, work once, and return the same request response for known and unknown emails.

Reset delivery uses Amazon SES. **Code completion does not guarantee public email delivery:** `RACKED_PASSWORD_RESET_FROM` must be a verified SES identity, and an account still in the SES sandbox can send only to verified recipients. That supports pre-verified judge accounts but is not a general public reset service until AWS grants production sending access.

---

## Routes

<details>
<summary><strong>Every route, its access level, and what it does — expand</strong></summary>

| Route | Access | What it does |
| --- | --- | --- |
| `/` · `/community` · `/brands/[slug]` · `/pricing` · `/privacy` · `/terms` | Public | Landing, outfit discovery feed, public brand pages, planned pricing, pilot terms |
| `/demo-store/[brandSlug]/[sku]` | Public | Fictional demo storefront — `DEMO` products only, never a real brand |
| `/login` · `/forgot-password` · `/reset-password` | Public | Authentication and single-use recovery |
| `/consumer` · `/settings` | Consumer | Today / Looks / Closet / Outfits workspace, own-account settings |
| `/brand` | Brand | Aggregate dashboard, product enrollment, Brand Looks, Brand Hanger |
| `POST /api/garments/detect` | Consumer | Multi-piece detection; each piece stored as its bounded crop |
| `POST /api/garments/verify` | Consumer | Checks one garment's label text against the brand registry. Writes nothing; a brand name alone never matches |
| `GET /api/catalog?q=` · `POST /api/catalog` | Consumer | Searches the brand catalog, or ranks it against one scanned piece. Returns only what brand pages already show; writes nothing; a result can be saved only as the owner's pick |
| `GET/POST/DELETE /api/consumer/wardrobe` · `GET/POST/PATCH/DELETE /api/consumer/outfits` · `GET/PATCH /api/consumer/consent` | Consumer | Always scoped to the signed-in account; outfit PATCH removes pieces and regenerates the private board; wardrobe DELETE keeps outfits and the owner's Community posts consistent |
| `POST /api/wears` | Consumer | Confirmed wear events plus saved-outfit wear totals |
| `GET/POST/DELETE /api/agents/consumer` · `POST /agents/brand` | Role-bound | Hanger conversations with fresh authoritative context per message; the consumer conversation is stored on the account, resumable, and clearable |
| `POST /api/brand/metrics` · `/community-metrics` | Brand | Consent-filtered `k ≥ 25` aggregates and public-activity metrics |
| `GET/POST /api/brand/products` · `/brand/looks` | Brand | Own registry products and brand-authored Looks |
| `POST /api/brand/products/describe` | Brand | Proposes a product's name, category, type, colour, pattern, and material from its photo. Stores nothing |
| `PATCH /api/brand/products/[productId]` | Brand | Corrects or retires one owned product. Ownership is the record's own key; brand, SKU, GTIN, and photos are immutable |
| `POST /api/products/[productId]/demo-purchase` | Public | Records a $0.00 demo checkout simulation — DEMO products only, never a sale |
| `GET/POST/PATCH /api/community` | Public / Consumer | Read the feed; publish one selected saved outfit; record inspiration |
| `POST /api/community/[postId]/recreate` | Consumer | Recreate This Look against only the signed-in wardrobe |
| `GET /api/community/images/[postId]/[garmentId]` | Public | Post-scoped image proxy; never exposes a private S3 key |
| `GET /api/products/similar` · `/[productId]/outbound` | Public | Registry-only suggestions; server-validated outbound redirect |
| `GET/PATCH/DELETE /api/account` · `/auth/password-reset/*` | Signed in / Public | Own-account updates and consumer account deletion, both requiring the current password; enumeration-safe recovery |

Full access levels and abuse controls: [docs/backend-api.md](docs/backend-api.md).

</details>

---
## Key Files

<details>
<summary><strong>Module map: where each responsibility lives — expand</strong></summary>

```text
app/api/auth/…                 Register/login/logout: scrypt hashes, signed sessions, rate limits
app/api/account/               Own-account settings + consumer account deletion (password + typed DELETE)
app/api/auth/password-reset/   Enumeration-safe request + single-use reset confirmation
app/api/garments/detect/       One-photo multi-piece detection + a private bounded crop per piece
app/api/consumer/…             Wardrobe, outfits, consent — always scoped to the signed-in account
app/api/wears/                 Confirmed wear events + saved-outfit wear totals
app/api/brand/…                Brand-owned products and consent-filtered k≥25 aggregates
app/api/agents/…               Hanger conversations; the consumer one is stored, resumable, and clearable
app/api/community/images/      Public post-scoped image proxy; never exposes private S3 keys
app/api/community/[postId]/    Signed-in Recreate This Look comparison
app/api/products/similar/      Rate-limited registry-only product suggestions
lib/server/production-store.ts Every DynamoDB/S3 operation, ownership checks, enumeration budget
lib/deletion-plan.ts           Owner-scoped deletion planning: outfits, posts, shared photos, profile last
lib/garment-analysis.ts        Vision prompts, registry matching, brand-autofill boundary
lib/look-garment-detection.ts  Bounded instance detection, coordinates, deduplication, trust boundary
lib/garment-taxonomy.ts        Controlled categories/subtypes, bounded uncertainty, typed-type resolver
lib/shoe-knowledge.ts          Generic footwear aliases/cues for AI grounding and name grammar
lib/outfit-ranking.ts          Deterministic, conversation-aware outfit scoring with evidence
lib/matching.ts                Product-fit reference scorer (analytics reference; no route imports it)
lib/evaluation-dataset.ts      External-dataset normalization, deterministic sampling, scoring
lib/outfit-contracts.ts        Exact/estimated/similar/generic/unavailable product states
lib/look-discovery.ts          Inferred look styles, category filters, public-field search
lib/recreate-look.ts           Deterministic owned/substitute/missing scoring with evidence
lib/similar-products.ts        Same-category suggestions using the same scoring weights
lib/commerce.ts                Public-HTTPS validation and controlled destination states
lib/brand-looks.ts             Brand-owned authorization for Brand Looks
lib/garment-crop.ts            Evidence-preserving auto-crop with tested fallbacks
lib/backdrop-model.ts          Clustered backdrop colours; perimeter-run surface test
lib/garment-segmenter.ts       Registration seam for a learned segmenter (MobileSAM-ready)
lib/ai-background-removal.ts   Optional asynchronous-ready segmentation helper; not an intake gate
lib/garment-evaluation-runner.ts  Production-result → privacy-safe benchmark contract
lib/garment-cutout.ts          Edge-connected transparency (research; not used by live intake)
lib/outfit-board.ts            Deterministic category-aware flat-lay placement
lib/account-security.ts        Password policy and reset-token lifetime/hash rules
lib/photo-plan.ts              Intake category list; retired photo-plan logic kept with its identity tests
lib/hanger-conversation.ts     Hanger prompts, history bounds, brand output privacy review
lib/hanger-memory.ts           Account-scoped chat memory: bounded turns, context budget, remembered preferences
lib/privacy.ts                 k ≥ 25 gate + product-enumeration budget
lib/rate-limit.ts              Sliding-window abuse limits for auth/AI/community endpoints
components/consumer-dashboard.tsx  Today / Looks / Closet / Outfits views
components/garment-intake.tsx      One-photo intake: per-piece cards, typeable Type field, brand linking
components/demo-purchase-panel.tsx $0 fictional bag and checkout simulation
components/brand-dashboard.tsx     Aggregate metrics, charts, CSV export, Hanger dock
tests/                         Privacy, recognition, evaluation, commerce, Brand Looks, Recreate suites
infra/template.yaml            DynamoDB, S3, least-privilege Amplify compute role
```

</details>

---
## Measured Garment Isolation

Cutting a garment out of a photograph is deterministic in Racked — no weights, no network,
no per-piece provider call. `scripts/crop-benchmark.ts` scores it by intersection-over-union
against known garment rectangles across 14 seeded scenes, and is reproducible on any machine:

```bash
node --experimental-strip-types scripts/crop-benchmark.ts
```

| Approach | Mean IoU | Usable (IoU ≥ 0.7) |
| --- | ---: | ---: |
| `trim` — sharp's border trim | 61% | 7/14 |
| `flood` — earlier single-colour cutout | 78% | 10/14 |
| **`isolate` — best local pass** | **86%** | **12/14** |

> **Not used in live intake.** Synthetic backdrops are not a phone camera. On real photos these passes erased correctly recognised white garments — trousers held in a hand, a sneaker against a pale wall — so intake shows the bounded crop instead. The passes stay in the repository, measured, as the baseline a learned segmenter must beat.

The backdrop is modelled as a small set of clustered colours rather than one median, which
is what lets a striped rug or floorboards be recognised as a surface at all. The garment is
then the largest connected region left standing, so a pillow beside it or the neighbours on
a crowded rail cannot widen the crop. When the result is not believable the pass declines
and the caller falls back — a confident wrong crop is worse than an honest one.

Two of fourteen scenes still fail, both because colour similarity is the only signal
available: a strongly patterned backdrop, and a garment whose colour nearly matches the
surface under it. Shape is the missing signal.

**Open-source segmenters were evaluated for exactly that gap.** `lib/garment-segmenter.ts`
is a registration seam so a learned backend can replace the deterministic pass without
touching the intake route. [MobileSAM](https://github.com/ChaoningZhang/MobileSAM) is the
strongest candidate — Apache 2.0, class-agnostic, ~9.66M parameters, ONNX-exportable, and
box-promptable, which suits a pipeline that already produces a box. It is deliberately
**not** wired in yet: its weights ship as a PyTorch checkpoint, and shipping a model into
the deployed bundle before measuring a win would be the wrong order. Contract, export
recipe, and the three discriminators that failed before one worked are in
[docs/segmentation-backends.md](docs/segmentation-backends.md).

Clothing *detectors* were evaluated and rejected on three counts — most are Ultralytics
YOLO (AGPL-3.0), the large fashion datasets are non-commercial, and every one of them is
trained on **people wearing clothes** while Racked photographs flat lays. That analysis is
recorded in [the recognition work order](docs/work-order-recognition.md).

These are synthetic backdrops chosen to mimic real conditions: a reproducible regression
signal, **not** a measured accuracy claim about real photographs.

---

## Security and Privacy Boundaries

- Passwords are salted with a random value and hashed with scrypt.
- Sessions are signed, expiring, secure, HTTP-only cookies.
- Session guards are behavior-tested across valid round-trips, tampered and malformed tokens, exact expiry boundaries, live role and session-version checks, deleted accounts, and Consumer/Brand route separation. A password change or account deletion therefore invalidates an otherwise correctly signed cookie on its next use.
- Account updates are scoped only to the signed-in subject and require the current password. Password changes increment a server-side session version; reset tokens are hashed, single-use, and valid for 30 minutes.
- **Deletion is owner-scoped and retry-safe.** Deleting a garment updates saved outfits (an emptied one is deleted), removes its photo from the owner's own Community posts, deletes the wear events it added to brand totals, and deletes its photos — the scan's evidence photo only with the last piece cut from it. Deleting a consumer account requires the current password and the typed word DELETE; it removes posts, wear events, every referenced photo, and every record with the profile last, then clears the session. Storage outside the account's own prefix is never touched. Brand accounts cannot yet be deleted from Settings.
- Garment saves require a server-signed confirmation token tied to the account and both private image keys.
- S3 public access is blocked; URLs expire after one hour.
- Consumer photos and raw wardrobe records are never returned to brands. Community publishes only a selected saved outfit, replaces wardrobe IDs with public garment IDs, and serves its presentation through a post-scoped image proxy. The public allowlist cannot serialize owner IDs, saved-outfit IDs, private S3 keys, or database keys.
- Brand metrics count only opted-in owners and fail closed below `k ≥ 25`. Below the threshold even the owner count is withheld ("fewer than 25"), because a small count is itself a small cell. Registry and per-product queries read every DynamoDB page, so a large catalog or cohort is never silently cut short. A DynamoDB-backed enumeration budget additionally caps how many distinct products one brand account can pull aggregates for in a rolling window, defeating differencing attacks across SKUs. The dashboard now states what is left of that budget and why the limit exists, so a refusal is never a surprise; the note says what remains, never which products were opened.
- **Brand identity is never AI-granted.** A brand name read from a photo, typed by a consumer, or matched against the major-brand allowlist only prefills an editable, clearly unverified label — even when a brand account already exists under that name. Verified identity requires registry GTIN or brand-plus-SKU evidence, and that rule is locked by regression tests. Identical image files and file names used to count as evidence too; they no longer do.
- Sliding-window rate limits protect registration, sign-in (per client and per email), garment classification and analysis, both Hanger agents, brand metrics, and Community writes. Counters are per compute instance — a documented first layer, not a WAF replacement.
- If image analysis fails, Racked keeps the submitted front photo as private evidence and opens an explicitly unverified manual-review form; it never invents fallback attributes. Back and label photos are processed in request memory and are not persisted for consumers.
- Protected demographic attributes are excluded from image prompts, matching, and analytics.

---

## Independent Evaluation Dataset

Racked has selected the corrected CC BY 4.0 [Clothing Dataset for Second-Hand Fashion, version 3](https://zenodo.org/records/13788681) as its external recognition benchmark. It contains **31,638 real garments** plus a separately identified 100-garment annotator-agreement set, with human annotations and front, back, and brand-label photographs where available — the closest public match to Racked's three-view intake. Dataset photographs stay outside GitHub and the production application; only attribution, evaluation code, and aggregate results belong in this repository.

**Accuracy is not claimed yet, and this is not training data.** Racked uses Amazon Nova Lite for the documented three-view benchmark path and the US Nova Pro profile for the harder whole-look instance-detection path; neither model is fine-tuned on these garments. The benchmark will measure category, subtype, label-text, provider-failure, and AI-only-verification violations without allowing dataset brand text to create verified identity. The exact protocol and honest reporting rules are in [docs/evaluation.md](docs/evaluation.md).

The first reproducible label-coverage audit sampled 1,000 evenly spaced records: **93.9%** map to Racked's broad categories, **62.6%** have source labels specific enough for exact-subtype scoring, and **94.0%** contain usable brand annotations. These percentages measure benchmark compatibility — not model accuracy. The aggregate, image-free report is committed at [`data/evaluation-label-coverage.json`](data/evaluation-label-coverage.json).

---

## CI — GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request:

1. **Production dependency audit** — `pnpm audit --prod --audit-level high`
2. **Lint** — `eslint`
3. **Type check** — `tsc --noEmit`
4. **Tests** — `node --test` across `tests/`
5. **Production build** — `next build`

`.github/workflows/codeql.yml` runs CodeQL security analysis on pushes, pull requests, and a weekly schedule. Merges happen only after both are green.

The suite currently has **448 passing tests** (verified 2026-09-19), covering editable-but-not-identity brand products, retirement that leaves owners untouched, the enumeration budget stated in plain words, brand-catalog recognition and search, owner picks that never become verified identity, one-photo brand enrollment, cost per wear from a listed price, verified links that persist through save, whole-code GTIN and style-code matching, brand-name reservation and alias protection, one product per barcode, session-token tampering, malformed input, exact expiry, password-change invalidation, deleted-account invalidation, and role-route separation alongside unified per-piece brand linking, the landing page's no-overlap, readability, and motion guarantees, owner-scoped garment and account deletion, bounded-crop-only intake, the typeable Type field and its no-overlay guarantee, whole-piece previews, the iPhone tab-bar viewport correction, provider-exception/manual-review recovery, one-call synchronous recognition, grammatical AI autofill, controlled footwear knowledge and aliases, the dedicated Pro-to-Lite model policy, whole-look request-budget reservation, over-erased-cutout rejection, stage-accurate timeout messaging, resumable evaluation output, request-budget-safe image-isolation fallbacks, transparent-output validation, one-tap installation wherever the browser allows it, iOS 26 and in-app-browser Home Screen paths, private inspiration signals and request-overrides, footwear-pair grouping and full-image scan instructions, privacy suppression and the enumeration budget, the registry-only verification boundary, deterministic Recreate and outfit-ranking scoring, explicit Hanger piece constraints, four-turn conversation memory, canonical name/image/save alignment, owner-scoped saved-outfit and piece management, commerce URL validation, demo purchase simulation boundaries, Community style discovery, Brand Look ownership, account recovery, and public-field sanitization.

---

## Rubric Alignment

| Category | Weight | How this repo addresses it |
| --- | ---: | --- |
| Problem & relevance | 20% | Purchase data shows what sold, not what is worn. Each hero SKU demonstrates **76 wears / 25 owners / 88% engagement / 76% repeat use** (synthetic, labeled) — the post-purchase signal brands lack |
| Functionality | 25% | Live AWS PWA, real registration/login/recovery, one-photo multi-piece intake, Saved Outfits with repeat wear, Community publishing, Recreate This Look, Brand Looks, controlled outbound destinations, and a `k ≥ 25` dashboard with charts and CSV export |
| **AI integration & innovation** | **20%** | **Bedrock multi-view garment vision · distinct context-grounded Consumer and Brand Hanger agents · server-side deterministic outfit ranking the model cannot override · explainable Recreate/Similar scoring that never turns similarity into exact ownership** |
| Code, docs & GitHub | 15% | Typed modules, **448 passing tests**, CI running audit + lint + typecheck + tests + build, CodeQL, and incremental reviewed PRs ([PROGRESS.md](PROGRESS.md)) |
| UX & polish | 10% | Refreshed landing page with progressive, reduced-motion-safe transitions, mobile-first bottom tabs, account settings/recovery, explicit camera/library choice, whole-piece garment crops on clean white outfit boards, fictional catalog assets, $0 purchase simulation, honest first-time and suppressed states, installable PWA |
| Business impact | 10% | Per hero SKU: **76 wears, 22 active owners, 19 repeat wearers**; for the apparel hero: **11 public outfit appearances, 37 inspirations, 15 Recreate requests** (all synthetic demonstration data), plus a proposed [pricing model](#business-model--pricing-proposed--not-currently-billed) |
| Bonus | — | Explicit consent, private encrypted object storage, k-anonymity plus enumeration budget, rate limiting, accessibility-minded semantics, cross-disciplinary analytics |

---

## Business Model & Pricing (proposed — not currently billed)

Consumers stay free to solve the cold-start problem; the brand side carries revenue because actual-wear intelligence is what brands cannot get elsewhere; and the Starter tier exists because an emerging brand often cannot reach the `k ≥ 25` threshold immediately — it prices that waiting period honestly with benchmarks and progress visibility only. No tier weakens consent or the privacy threshold. See the labeled in-app [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing) page.

| Tier | Price | Includes |
| --- | --- | --- |
| Consumer Free | $0 | Wardrobe logging, wear tracking, limited Hanger queries |
| Consumer Pro | $6.99/mo or $59/yr | Unlimited Hanger, advanced analytics, outfit export |
| Brand SKU Enrollment | $25 one-time + $10/yr/SKU | Verification, registry matching |
| Brand Starter (below k≥25) | $29/mo | Category benchmarks, progress-to-threshold visibility only |
| Brand Standard (post-threshold) | $149/mo | Full aggregate dashboard, CSV export |
| Brand Growth | $299/mo | Standard + multi-product comparison + Hanger strategy artifacts |
| A la carte strategy artifact | $15/artifact | For non-subscribers |

---

## Local Development

<details>
<summary><strong>Clone, configure, run the gate, install on a phone — expand</strong></summary>

Requirements: Node.js 22+ and pnpm.

```bash
# Clone and install
pnpm install --frozen-lockfile

# Configure environment
copy .env.example .env.local

# Run the full verification gate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:prod

# Start the dev server
pnpm dev
```

Local account and upload mutations require a DynamoDB table, private S3 bucket, and AWS credentials with the same narrow permissions as `infra/template.yaml`. Never commit `.env.local`.

**Install on a phone:** open the [HTTPS application](https://main.d2iv0khybuuaeh.amplifyapp.com) and tap **Add Racked**. Android and other compatible browsers open their native install prompt directly. Because iPhone browsers do not expose that prompt to websites, the same button opens a focused guide for **Safari → Share → Add to Home Screen → Add** instead of becoming a dead button.

</details>

---
## Ethical Stance and Claims

Racked augments a person's judgment about their own wardrobe and never replaces their consent.

- Every AI attribute is a proposal a person confirms, corrects, or rejects. Detection alone never writes a wardrobe record.
- Brand identity comes only from authorized registry evidence. No amount of AI confidence can create it.
- Brands receive aggregates, never people. Consent is per-account and revocable, `k ≥ 25` fails closed, and an enumeration budget prevents reconstructing small cohorts across SKUs.
- Nothing is published without an explicit action by its owner.

Racked does **not** claim garment recognition accuracy, sales lift, purchase intent, demographic inference, photorealistic virtual try-on, body-fit prediction, or production-scale validation. Multi-piece detection is functional but visibility-dependent: overlapping, occluded, tiny, or blurred items may require a second photo. The Looks flat-lay is a visual outfit composition tool, not virtual try-on. Private wear metrics are server-computed aggregates over opted-in owners above `k ≥ 25`; separately labeled Community metrics use only intentionally public posts and identity-free interaction events. The three-brand, 25-account cohort is synthetic and classified `DEMO` throughout. Pricing is a proposal; nothing is billed and no payment method is ever collected.

---

## Documentation Index

Everything above is self-contained; these go deeper.

- [PROGRESS.md](PROGRESS.md) — real merged-PR history of how this was built
- [User workflow](docs/user-workflow.md) — the Consumer and Brand journeys end to end
- [Streamline plan](docs/streamline-plan.md) — measured cut list, surface simplification, and the gaps that block a store submission
- [App Store and Google Play launch](docs/app-store-launch.md) — two tracks, policy blockers, and realistic timelines
- [TikTok campaign](docs/tiktok-campaign.md) — positioning, content pillars, creators, and the eight-week plan
- [Launch work orders](docs/work-orders/claude-launch-blockers.md) — blockers executed by Claude, and [follow-ups for ChatGPT](docs/work-orders/chatgpt-launch-follow-ups.md) with the rules its code is reviewed against
- [Recognition work order](docs/work-order-recognition.md) — open tasks for measuring and improving garment recognition
- [Segmentation backends](docs/segmentation-backends.md) — how cropping works, what it scores, and how to add a learned segmenter
- [Competition checklist](docs/competition-checklist.md) — per-criterion evidence checklist
- [Demo checklist and fallbacks](docs/demo-checklist.md) — pre-flight, accounts, and what to do when something fails live
- [Presentation script](docs/demo-script.md) — the eight-minute run
- [Architecture and trust boundaries](docs/architecture.md)
- [Backend API](docs/backend-api.md) — every route, access level, and abuse control
- [AI use and limitations](docs/ai-use-log.md) — models, prompts, boundaries, failure policy
- [Independent recognition evaluation](docs/evaluation.md) — 31,638-item source, license, protocol, claim rules
- [Dataset provenance](docs/dataset-provenance.md) — production, synthetic, and external-data boundaries
- [Clearly labeled test cohort](docs/test-cohort.md) — including judge accounts
- [Fictional demo storefronts](docs/demo-storefronts.md) — safety rules and URL contract
- [Small/medium Brand UX review](docs/brand-ux-review.md)
- [Privacy and ethics](docs/privacy-and-ethics.md) — consent, `k ≥ 25`, brand identity boundary
- [AWS deployment](docs/aws-deployment.md)
- [One-page summary](docs/one-page-summary.md) — includes the proposed business model

---

**Last updated:** September 2026 — active competition build
**Repository:** https://github.com/manof1color/racked-wardrobe-intelligence
**Competition:** CUA AI Vibe Coding Competition
