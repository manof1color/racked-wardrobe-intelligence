import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEMO_STORE_DISCLAIMER, storefrontDescription } from "../lib/demo-storefront.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the product page offers the test card only with a Stripe test key and only where the route would accept the product", () => {
  const page = read("app/demo-store/[brandSlug]/[sku]/page.tsx");
  assert.match(page, /Boolean\(stripeTestKey\(process\.env\.STRIPE_SECRET_KEY\)\)&&testCheckoutRefusal\(product\)===null/);
  assert.match(page, /isDemoStorefrontBrand\(products\)\)notFound\(\)/, "a real or pilot brand has no fictional product page at all");
  assert.match(page, /testCheckout=\{testCheckout\}/);
});

test("the panel reuses the existing button, and the $0.00 demo bag is the only path that records", () => {
  const panel = read("components/demo-purchase-panel.tsx");
  assert.match(panel, /import \{ TestCheckoutButton \} from "\.\/test-checkout-button"/);
  assert.match(panel, /if \(testCheckout\) return <TestCheckoutButton productId=\{productId\} fullWidth \/>;/, "with a test key the test card is the only button");
  assert.doesNotMatch(panel, /demo-bag-link|\$0\.00 simulation<\/button>/, "no second purchase action beside it");
  assert.equal(panel.split("/demo-purchase`").length - 1, 1, "one call records a demonstration event");
  assert.match(panel, /Complete demo purchase — \$0\.00/);
  assert.doesNotMatch(read("components/test-checkout-button.tsx"), /demo-purchase/, "a test card payment records nothing");
});

test("the button's default label is unchanged for the Community sheet", () => {
  assert.match(read("components/test-checkout-button.tsx"), /label = "Buy with a test card"/);
});

test("storefront wording no longer says nothing can be bought or that no payment is ever collected", () => {
  const words = [DEMO_STORE_DISCLAIMER, storefrontDescription({ name: "Transit Bomber", category: "outerwear" }), read("components/demo-purchase-panel.tsx"), read("app/demo-store/[brandSlug]/page.tsx")].join("\n");
  assert.doesNotMatch(words, /nothing here can be bought|no payment is ever collected|never asks for payment|No products are for sale/i);
  assert.match(DEMO_STORE_DISCLAIMER, /Stripe test mode/);
  assert.match(DEMO_STORE_DISCLAIMER, /nothing ships/i);
  assert.match(read("app/demo-store/[brandSlug]/page.tsx"), /no real money moves/);
});

test("REGRESSION: a catalog photo stays inside its card on phones", () => {
  const css = read("app/globals.css");
  const box = /\.demo-store-image\{[^}]*height:250px[^}]*overflow:hidden[^}]*\}/.exec(css);
  assert.ok(box, "the frame has a fixed height and clips");
  assert.match(css, /\.demo-store-image img\{width:100%;height:250px;/, "a percentage height inside a grid item does not resolve, so the photo is as tall as the frame");
});

test("every purchase screen shows one purchase button, with one label", () => {
  const sheet = read("components/community-piece-sheet.tsx");
  assert.match(sheet, /\{offersTestCheckout\(testCheckout, post, card\)\s*\? <TestCheckoutButton productId=\{card\.registryProductId!\} \/>\s*: card\.outboundUrl && <a /, "the test card or the brand site, never both");
  assert.doesNotMatch(read("components/demo-purchase-panel.tsx"), /label="Pay with a test card"/, "the same label as Community");
});

test("the demo bag's confirmation shows the referral commission split from the shared rate, and says nothing moves", () => {
  const panel = read("components/demo-purchase-panel.tsx");
  assert.match(panel, /import \{ REFERRAL_COMMISSION_RATE, referralSplit \} from "@\/lib\/pricing";/, "one source for the rate");
  assert.match(panel, /referralSplit\(price\)\.commission/);
  assert.match(panel, /referralSplit\(price\)\.brandReceives/);
  assert.match(panel, /In this simulation nothing is split or moved\./);
  assert.match(panel, /typeof price === "number" && price > 0 &&/, "no split is shown without a price");
  assert.match(read("app/demo-store/[brandSlug]/[sku]/page.tsx"), /<DemoPurchasePanel[^>]*price=\{price\} currency=\{product\.currency\}/, "the product page passes the storefront price");
});
