# Fictional demo storefronts

> Every page under `/demo-store` is a **fictional shop for a fictional brand**. The in-page Demo Bag and $0.00 checkout are an interaction simulation only: no payment is processed, no order is created, and no personal detail is collected. Each page carries a persistent banner saying so.

## Why these exist

Racked's "Shop the Look" path needs a real, always-available HTTPS destination to demonstrate. Pointing demo products at a third-party site would be unreliable during a presentation and would attach Racked's demo to someone else's brand. These storefronts keep the whole journey inside Racked, under our control, and unmistakably fictional.

## Safety rules

- Storefronts render **only** for products classified `DEMO` (or legacy `testCohort: true`). A `PILOT` or `REGULAR` brand returns 404 — a real brand can never have a fake shop rendered on its behalf. Enforced by `isDemoStorefrontBrand()` and covered by a regression test.
- No real company, logo, wordmark, or domain is imitated. The three brands are Racked's own inventions.
- The working **Demo Bag** is client-only UI state. It can advance through add-to-bag and $0.00 completion, but it has no API, payment provider, order record, address field, email field, or persistent cart.
- Pages are marked `robots: { index: false, follow: false }`.

## Fictional product photography

Nine AI-generated, unbranded product photographs are committed under `public/demo-products/`: three apparel pieces, three footwear products, and three jewelry products. `demoProductImagePath()` allowlists only the fictional `RTA`, `SSL`, and `LTO` SKU formats; real and `PILOT` products never receive these images. The generated assets replace presentation-only placeholder drawings in DEMO Community posts, fictional storefronts, and fictional Brand dashboards. Repeated demo SKUs may intentionally reuse a representative category image, and `RTA-010` keeps its original fallback because no accurate belt asset was generated.

## URL contract

This is the contract the seed script builds against. It is deterministic from `brandSlug` and `sku`.

```text
Brand index:    /demo-store/<brandSlug>
Product detail: /demo-store/<brandSlug>/<sku>
```

Both segments are URL-encoded. Use the helpers rather than string concatenation:

```ts
import { demoStoreProductPath, demoStoreProductUrl } from "@/lib/demo-storefront";

demoStoreProductPath("racked-test-atelier", "RTA-001");
// "/demo-store/racked-test-atelier/RTA-001"

demoStoreProductUrl("https://main.d2iv0khybuuaeh.amplifyapp.com", "synthetic-stride-lab", "SSL-001");
// "https://main.d2iv0khybuuaeh.amplifyapp.com/demo-store/synthetic-stride-lab/SSL-001"
```

`demoStoreProductUrl` tolerates a trailing slash on the origin. The resulting absolute URL satisfies `normalizeCommerceUrl()` (public HTTPS, no credentials, no custom port, no private host), so it can be stored directly in a product's `productUrl`.

## Seeded brands and SKUs

Verified against the live API on 2026-08-14. **Re-verify before relying on this list** — do not copy brand names out of planning documents.

| Brand | Slug | SKUs |
| --- | --- | --- |
| Racked Test Atelier | `racked-test-atelier` | RTA-001 … RTA-006 |
| Synthetic Stride Lab | `synthetic-stride-lab` | SSL-001 … SSL-006 |
| Lumen Test Objects | `lumen-test-objects` | LTO-001 … LTO-006 |

## Pricing and copy

If a product was enrolled with a real `price`, the storefront shows it. Otherwise a **deterministic** fictional price is derived from the SKU within a per-category band, so the same product always shows the same price and screenshots stay stable. Product copy is generated per category and always states that the product is fictional and the checkout simulation never charges.

## Seeded commerce contract

Set on each demo product:

```text
productUrl   = demoStoreProductUrl(<production origin>, brandSlug, sku)
price        = <integer>
currency     = "USD"
availability = "available"   // LTO-010 is deliberately "unavailable"
```

`commerceDestination()` will then report `EXACT_AVAILABLE` and Shop the Look becomes visible on any Community look containing that product.
