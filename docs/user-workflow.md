# User workflow

How a real person moves through Racked, end to end. Every step below maps to a route and
a component in this repository; nothing here is aspirational.

Two roles have separate workspaces and separate data boundaries. A Consumer never sees
another Consumer's wardrobe. A Brand never sees any Consumer's identity.

---

## Consumer

### 1. Create an account — `/login`

Role is chosen at sign-up. A Consumer account **cannot be created without ticking
image-processing consent** — the button stays disabled. This is a hard gate, not a
pre-ticked box.

Brand data sharing is a *separate* preference, off until deliberately enabled in
`/settings`. Consenting to have your own photos processed is not consenting to
contribute to brand analytics.

### 2. Land in the workspace — `/consumer`

Opens on **Home**: a live readout of the wardrobe — most worn, least worn, saved outfit
count, total recorded wears. With an empty wardrobe it shows a single call to action
rather than a grid of zeroes.

Four tabs: **Home · Closet · Looks · Outfits**, plus Community.

### 3. Add clothing — the `+` control

**One way in.** Intake used to open on a choice between "add from one photo" and "link a
brand product", which asked you to know — before photographing anything — whether the
garment was an enrolled brand product. Most people cannot answer that, and choosing wrong
was permanent: only the three-photo flow ever consulted the registry, so a genuine brand
product photographed the quick way could never be linked.

Now every garment arrives the same way, and brand linking is a per-piece upgrade.

**A. Add from one photo** — *fast, separates every visible piece*

1. Take or choose one photo — an outfit, a flat lay, a whole rail.
2. The photo is resized in the browser before upload; the original never leaves the device.
3. `POST /api/garments/detect` sends it to Amazon Bedrock, which returns up to 16 wardrobe
   units. Matching left and right shoes are returned as **one pair**, not two garments.
4. Each detection is cropped to its own piece — the box plus a margin, zoomed to the garment, photo left intact — and stored privately.
5. You get an editable card per piece — the whole piece is always visible — with **name, category, type, brand**. Nothing is
   saved until you tick the confirmation box.
6. **Type** is filled in when AI recognises the piece. When it isn't sure, the field is
   highlighted and a short note appears *under* it — the photo stays fully visible. Type
   what the piece is or pick a suggestion:
   - words Racked knows snap to a controlled type (`white high top sneakers` → High-Top Sneakers);
   - words it doesn't know are kept as you wrote them, beside the category's *Other* type
     (`Jordan 3 Retro`), and shown in your Closet.
7. If AI cannot classify a piece at all it arrives labelled **"needs your label"** with zero
   confidence and no invented attributes — you choose the category and type yourself rather
   than hitting a dead end. A piece can't be saved while its category is still unknown.

**B. Link a brand product** — *a label code on any piece*

Open **Is this a brand product?** on a piece and enter the barcode number, or the brand with its
style code. `POST /api/garments/verify` checks it against the brand registry and writes nothing.
**Only a GTIN match, or a brand-plus-SKU match, creates a verified product link.** AI-read text
and typed brand names are suggestions marked unverified, permanently — that boundary cannot be
crossed by any amount of confidence. When you save, the server checks the label again and stores the link
itself, so a matched piece arrives in your Closet as a brand product.

**No label?** The same section shows up to three enrolled products that look like the piece, and a
search box for the brand you bought from. **This is mine** links the product as *your pick*: the
Closet shows its details and, where the brand lists a price, its cost per wear ("$30.00 a wear, from
the brand's listed price"). A pick is yours alone — it is never verified, never makes a Community
piece shoppable, and never reaches a brand. Add the label code any time to verify it.

### 4. Closet

Every saved garment with its wear count and how long since it was last worn. Wear age is
derived from the stored timestamp on every read, so it never goes stale.

Any piece can be deleted from its card, with a second tap to confirm. Saved outfits lose it (an
outfit left empty is deleted), your Community posts stop showing it, and its photos are removed.

### 5. Looks — build an outfit

Tap garments to add them to a look. A flat-lay preview arranges the private cropped photos
by category on a clean white canvas. Saving stores the outfit **and records one wear for
every selected piece** — outfit building and wear tracking are the same action, which is
why the wear data stays honest.

### 6. Outfits — wear it again

Saved outfits with piece thumbnails. One tap records a repeat wear. You can remove a single
piece from an outfit or delete the whole outfit; both are two-step. Deleting an outfit
deliberately **keeps** its historical wear events, so past usage totals are never falsified.

### 7. Hanger — the conversational stylist

The floating **Ask Hanger** control, on every screen.

Hanger remembers. The conversation is stored under your account, so closing the drawer, refreshing,
or picking up your phone later continues it. Preferences you state — *"I never wear heels"* — are
kept and applied to later outfits, and only words the wardrobe and taxonomy already use can be
stored, so a sentence about anything personal leaves nothing behind. **Clear** in the panel forgets
the conversation and the preferences together.

Hanger is grounded in your actual wardrobe. It reads fresh account context on every
message, then a deterministic server-side ranking scores each garment on five signals —
occasion, weather, style, underuse, recency. **The model never picks the items.** It writes
the explanation for a selection that was already computed.

- Ask for an outfit → you get the exact owned pieces, with their real photos.
- **Save this outfit** or **Record as worn**, straight from the reply.
- **Why these pieces** folds open to show the score components.
- Ask for something different → the prior suggestion is set aside, so you get different
  pieces, not a reworded version of the same ones.

If the written reply names a garment that is not in the computed selection, the reply is
rejected before it can be saved. The words and the pictures cannot disagree.

### 8. Community

**Publishing:** you pick one saved outfit. Every published piece gets a brand-new public
ID. Your outfit IDs, wardrobe IDs, account ID and S3 keys are rebuilt out of the response
by an explicit allowlist — they cannot leak, even by accident.

**Browsing:** filter by inferred style (formal, workwear, streetwear, casual, athletic,
evening, minimal, outdoor), by garment category, or free-text search across public fields.
Style is *derived from the published pieces*, never a tag someone typed.

**Acting on a look:**

| Action | What happens |
| --- | --- |
| **Like** | Increments a public counter. Brands see the number, never who. |
| **Save as inspiration** | Stores bounded style/colour/category signals in *your* private partition. Hanger may use them only when your current request gives no direction. |
| **Recreate with my wardrobe** | Server-side, against your account only. Splits the look into what you own and what is missing, with the reason each match was chosen. |
| **Shop the Look** | An in-app inspection sheet. Only a registry-verified exact product with a validated destination is openable. Similar or unverified pieces are never presented as the exact item worn. |

For fictional demo brands, Shop the Look opens a clearly labelled **$0.00 checkout
simulation**. No payment backend exists. Completing it records an identity-free
demonstration event the fictional brand sees arrive live.

### 9. Settings

Brand data sharing on/off, account details, sign out. Turning sharing off removes you from
future brand aggregates.

**Delete account** is its own card: enter your current password and type DELETE. Your wardrobe
and photos, saved outfits, wear history, Community posts, saved inspiration, and consent
settings are removed, and you are signed out. Brand accounts cannot yet be deleted here.

---

## Brand

### 1. Create a Brand account — `/login`

Brand name required, and it is yours alone: a second account cannot register the same name, and
well-known brand names are reserved. A Brand account can only ever reach products enrolled under its own
authenticated account.

### 2. Enroll a product — `/brand`

**One product photo** plus **SKU/MPN**, with an optional GTIN and aliases. **Fill in from photo**
reads the photo and proposes the name, category, type, colour, pattern, and material, which you check
before enrolling; those details are how a customer's scan recognises your product without its care
label. Back and label photos are optional. This enrollment
is the *only* thing that can create verified product identity anywhere in Racked. A
consumer photographing your garment cannot produce it; neither can the AI.

### 3. Keep the catalog current

Any enrolled product can be corrected: name, category, type, colour, pattern, material, style, price,
availability, product and affiliate links, and brand aliases. **What identifies the product cannot be
edited** — the brand, its style code, and its barcode are what a consumer's label is matched against,
so changing them would move existing links to a different product. A record that is genuinely wrong
is retired and enrolled again.

**Retire** takes two taps and is the honest ending for a discontinued product: it stops answering
label checks, searches, and suggestions, and leaves your public page. Everyone who already owns it
keeps their piece, and its recorded wear stays exactly as it is. Retired products can be restored.

The catalog is searchable by name, style code, or category, and retired products are hidden until you
ask for them.

### 4. Read the product — the dashboard

Written as business questions, not metric names: *Are people actually wearing it? Do they
wear it more than once? What does it get worn with?*

- Actual wears over an eight-week chart
- Active owners, engagement rate, repeat-wear rate
- Average and median wears per owner, frequency distribution
- High-frequency owners, and the zero-wear opportunity
- Aggregate CSV export

The dashboard also says how many more distinct products you can open in the next few minutes, and
why that limit exists: comparing many products in quick succession is how a near-threshold group
could otherwise be reconstructed.

**Everything above is suppressed before it is calculated when fewer than 25 distinct
opted-in owners qualify.** Below the threshold you are told so plainly — you do not get
zeroes dressed up as data, and the owner count itself reads "fewer than 25" rather than an exact small number. The zero-wear readout explicitly states that you cannot
identify or contact those owners.

Brand-facing copy is tested to never claim sales, revenue, conversion, purchase intent, or
causation.

### 5. Community Intelligence

A **separate** public-activity dataset: appearances in public looks, likes, recreate
requests, outbound clicks, category pairings, and labelled demo purchase simulations
arriving live. Built only from things people deliberately published.

It never joins to, bypasses, or lowers the `k ≥ 25` threshold on private wear behaviour. To
resist enumeration, a brand may pull aggregates for at most six distinct products in any
five-minute window.

### 6. Brand Looks

Compose a look from your own enrolled products, grouped by garment slot with a live
preview. The server re-checks ownership independently of the browser. Published Brand Looks
sit in Community and remain visually distinct from consumer-authored looks — a tested
guarantee that neither provenance can be presented as the other.

### 7. Hanger — brand strategy

Product, retention, merchandising and campaign strategy, on **released aggregates only**.
Below the privacy threshold Hanger receives no cohort or wear values at all and is limited
to general strategy. Output that recommends individualised outreach inferred from anonymous
wear groups is rejected server-side.

### 8. Your public page — `/brands/[slug]`

Products, brand-authored Brand Looks, and consumer-authored Community Looks, kept in
separate sections with provenance intact.

---

## What crosses between them, and what never does

| | Reaches a Brand | Never reaches a Brand |
| --- | --- | --- |
| **Wear behaviour** | Anonymous aggregates, only at `k ≥ 25`, only for consented owners | Individual wear histories |
| **Identity** | Nothing | Names, emails, account IDs, owner IDs |
| **Images** | Only what a Consumer published publicly | Wardrobe photos, evidence photos, S3 keys |
| **Community** | Counts of public activity | Who liked, saved, or recreated anything |

Consumer inspiration records stay in that Consumer's private partition and are never joined
into a Brand response.
