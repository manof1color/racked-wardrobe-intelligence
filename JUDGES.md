# Racked — for judges

**Racked is a private wardrobe and AI stylist for people, and post-purchase wear intelligence for
brands. Brands learn how their products are actually worn, from people who opted in, in groups of at
least 25, and never see a name, a photo or a wardrobe.**

Live app: https://main.d2iv0khybuuaeh.amplifyapp.com — works on a phone, and can be installed.

## Sign in

| Account | Address | Use it for |
| --- | --- | --- |
| Consumer | `judge.consumer@racked.local` | Flow 1: a lived-in wardrobe |
| Brand | `judge.brand@racked.local` | Flow 2: one released product, one suppressed |
| New consumer | `judge.newconsumer@racked.local` | A first run from an empty wardrobe |
| New brand | `judge.newbrand@racked.local` | Enrolling a product from one photo |

Passwords are sent privately with the submission and are never in this repository. If one doesn't
work, the [judge accounts guide](docs/judge-accounts.md) explains how they are seeded and checked.

## Flow 1 — a person: scan, confirm, recommendation (2½ minutes)

1. Tap **+** and photograph a garment. Amazon Bedrock (Nova Pro) proposes each visible piece.
2. Check the cards and save. Nothing reaches the wardrobe until you confirm it.
3. Open **Hanger** and ask *"What should I wear with this today?"* It builds the outfit only from
   pieces the account owns.

## Flow 2 — a brand: anonymous cohort, wear evidence, campaign brief (2½ minutes)

1. Open **Judge Limited Overshirt**: 4 opted-in owners, below 25, so the brand sees nothing — not
   even the count.
2. Open **Judge Signature Tee**: 50 opted-in owners, so wear, repeat use and pairings are released.
3. Ask **Brand Hanger** *"Write me a campaign brief for this product."* It uses only the released
   totals.

## Where to check what you just saw

| Question | Where |
| --- | --- |
| How is each scoring category met? | [Judge scorecard](README.md#judge-scorecard) |
| How do the parts fit together? | [Architecture diagram](README.md#architecture-overview) |
| Which steps call an AI model, and which are plain code? | [What calls a model](README.md#what-calls-a-model-and-what-does-not) |
| How is privacy enforced? | [Privacy and security](README.md#privacy-and-security) · [SECURITY.md](SECURITY.md) |
| What is measured, and what is not claimed? | [Evidence](README.md#evidence-and-what-is-not-claimed) |
| Do the tests pass? | [CI runs](https://github.com/manof1color/racked-wardrobe-intelligence/actions/workflows/ci.yml) · [Testing](README.md#testing-and-ci) |
| How was it built, and with which AI tools? | [PROGRESS.md](PROGRESS.md) · [AI use log](docs/ai-use-log.md) |

Everything in the judge accounts is synthetic and labelled `DEMO`.
