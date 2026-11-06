import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { guardRequest } from "../lib/request-guard.ts";
import { createTestCheckoutSession, offersTestCheckout, readTestCheckoutSession, stripeTestKey, testCheckoutAmount, testCheckoutForm, testCheckoutRefusal } from "../lib/test-checkout.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const KEY = "sk_test_fakefakefake";
const ORIGIN = "https://racked.test";
const product = { id: "p1", sku: "JDA-001", name: "Transit Bomber", category: "outerwear", price: 189, currency: "USD", availability: "available", dataClassification: "DEMO", testCohort: true } as Parameters<typeof testCheckoutRefusal>[0];

function answering(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

test("only a Stripe test key switches the feature on; a live key is treated as absent", () => {
  assert.equal(stripeTestKey(KEY), KEY);
  assert.equal(stripeTestKey("rk_test_restricted"), "rk_test_restricted");
  assert.equal(stripeTestKey(`  ${KEY}\n`), KEY);
  for (const refused of ["sk_live_abc", "rk_live_abc", "pk_test_abc", "sk_test_", "", undefined]) assert.equal(stripeTestKey(refused), null, String(refused));
});

test("a real or pilot brand's product is refused, even when it is marked as a test record", () => {
  assert.equal(testCheckoutRefusal(product), null);
  assert.equal(testCheckoutRefusal({ ...product, dataClassification: undefined, testCohort: true }), null);
  for (const dataClassification of ["PILOT", "REGULAR"] as const) {
    assert.equal(testCheckoutRefusal({ ...product, dataClassification, testCohort: false })?.status, 403);
    assert.equal(testCheckoutRefusal({ ...product, dataClassification, testCohort: true })?.status, 403);
  }
  assert.equal(testCheckoutRefusal({ ...product, dataClassification: undefined, testCohort: false })?.status, 403, "no classification is not fictional");
});

test("an unavailable product or another currency is refused", () => {
  assert.equal(testCheckoutRefusal({ ...product, availability: "unavailable" })?.status, 409);
  assert.equal(testCheckoutRefusal({ ...product, availability: "discontinued" })?.status, 409);
  assert.equal(testCheckoutRefusal({ ...product, currency: "EUR" })?.status, 409);
  assert.equal(testCheckoutRefusal({ ...product, currency: undefined }), null, "the catalog's default is dollars");
});

test("the amount is the catalog's price in cents, or the storefront's own fictional price", () => {
  assert.equal(testCheckoutAmount({ sku: "A", category: "top", price: 48.5 }), 4850);
  assert.equal(testCheckoutAmount({ sku: "A", category: "top", price: 19.99 }), 1999);
  const fictional = testCheckoutAmount({ sku: "A", category: "top" });
  assert.ok(fictional >= 2800 && fictional < 7400 && fictional % 100 === 0);
  assert.equal(testCheckoutAmount({ sku: "A", category: "top", price: 0 }), fictional, "zero is not a price");
});

test("Stripe is asked for one labelled card payment, with a placeholder email and configured return addresses", () => {
  const form = testCheckoutForm(product, ORIGIN);
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "18900");
  assert.equal(form.get("line_items[0][price_data][product_data][name]"), "Transit Bomber (fictional demo)");
  assert.equal(form.get("customer_email"), "test-checkout@example.com");
  assert.match(form.get("custom_text[submit][message]") ?? "", /test mode.*4242 4242 4242 4242.*Do not enter a real card/i);
  assert.equal(form.get("success_url"), `${ORIGIN}/test-checkout/complete?session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(form.get("cancel_url"), `${ORIGIN}/community`);
});

test("starting a checkout sends the key only to Stripe and returns Stripe's page", async () => {
  const { calls, fetcher } = answering(200, { url: "https://checkout.stripe.com/c/pay/cs_test_a1", livemode: false });
  assert.equal(await createTestCheckoutSession(product, { key: KEY, origin: ORIGIN, fetcher }), "https://checkout.stripe.com/c/pay/cs_test_a1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal((calls[0].init.headers as Record<string, string>).authorization, `Bearer ${KEY}`);
  assert.ok(!String(calls[0].init.body).includes(KEY), "the key is never in the form");
});

test("a live response or a foreign address is refused, and errors carry neither the key nor Stripe's body", async () => {
  for (const body of [
    { url: "https://checkout.stripe.com/c/pay/cs_live_a1", livemode: true },
    { url: "https://checkout.stripe.com/c/pay/cs_test_a1" },
    { url: "https://evil.example/c/pay", livemode: false },
    { url: "https://checkout.stripe.com.evil.example/", livemode: false },
    { livemode: false },
  ]) await assert.rejects(createTestCheckoutSession(product, { key: KEY, origin: ORIGIN, fetcher: answering(200, body).fetcher }), JSON.stringify(body));
  await assert.rejects(createTestCheckoutSession(product, { key: KEY, origin: ORIGIN, fetcher: answering(401, { error: { message: `bad key ${KEY}` } }).fetcher }), (error: Error) => {
    assert.equal(error.message, "Stripe answered 401.");
    return true;
  });
});

test("the return page trusts only a Racked test session, and reads no customer detail", async () => {
  const session = { livemode: false, payment_status: "paid", amount_total: 18900, metadata: { racked_test_checkout: "fictional-demo", racked_product_name: "Transit Bomber" }, customer_details: { email: "someone@example.com", name: "Someone" } };
  const paid = await readTestCheckoutSession("cs_test_a1", { key: KEY, fetcher: answering(200, session).fetcher });
  assert.deepEqual(paid, { productName: "Transit Bomber", amount: 189, paid: true }, "nothing else is read out");
  assert.equal((await readTestCheckoutSession("cs_test_a1", { key: KEY, fetcher: answering(200, { ...session, payment_status: "unpaid" }).fetcher }))?.paid, false);
  assert.equal(await readTestCheckoutSession("cs_test_a1", { key: KEY, fetcher: answering(200, { ...session, livemode: true }).fetcher }), null);
  assert.equal(await readTestCheckoutSession("cs_test_a1", { key: KEY, fetcher: answering(200, { ...session, metadata: {} }).fetcher }), null, "another use of the Stripe account");
  assert.equal(await readTestCheckoutSession("cs_test_a1", { key: KEY, fetcher: answering(404, {}).fetcher }), null);
});

test("a malformed session id never reaches Stripe", async () => {
  for (const id of ["cs_live_a1", "../customers/cus_1", "cs_test_a1/line_items", "cs_test_a1?expand=customer", "cs_test_", ""]) {
    const { calls, fetcher } = answering(200, {});
    assert.equal(await readTestCheckoutSession(id, { key: KEY, fetcher }), null, id);
    assert.equal(calls.length, 0, id);
  }
});

test("the sheet offers it only when switched on, for a priced exact product in a fictional post", () => {
  const card = { registryProductId: "p1", price: "$189.00" };
  assert.equal(offersTestCheckout(true, { fictional: true }, card), true);
  assert.equal(offersTestCheckout(true, { dataClassification: "DEMO" }, card), true);
  assert.equal(offersTestCheckout(false, { fictional: true }, card), false, "no key, no button");
  assert.equal(offersTestCheckout(true, { dataClassification: "PILOT" }, card), false);
  assert.equal(offersTestCheckout(true, {}, card), false);
  assert.equal(offersTestCheckout(true, { fictional: true }, { registryProductId: null, price: null }), false, "a closet piece");
  assert.equal(offersTestCheckout(true, { fictional: true }, { registryProductId: "p1", price: null }), false, "no listed price");
});

test("the route checks the key, the limit and the product before it calls Stripe", () => {
  const route = read("app/api/products/[productId]/test-checkout/route.ts");
  const order = ["stripeTestKey(process.env.STRIPE_SECRET_KEY)", "consumeRateLimit(", "getRegistryProductById(productId)", "testCheckoutRefusal(product)", "createTestCheckoutSession("].map((step) => route.indexOf(step));
  assert.ok(order.every((at) => at > 0), "every step is there");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "and in this order");
  assert.match(route, /origin:publicOrigin\(\)/, "return addresses never come from the request");
  assert.doesNotMatch(route, /request\.json|request\.headers\.get\("(host|origin)"\)/, "and neither does the price");
  assert.doesNotMatch(route, /production-store";[\s\S]*\bdb\.send|recordDemoPurchase|PutCommand/, "it records nothing");
});

test("another site cannot start a checkout from a visitor's browser", () => {
  const environment = { NODE_ENV: "production" };
  const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });
  const pathname = "/api/products/p1/test-checkout";
  assert.equal(guardRequest({ method: "POST", pathname, environment, headers: headers({ origin: "https://evil.example" }) }).allowed, false);
  assert.equal(guardRequest({ method: "POST", pathname, environment, headers: headers({ origin: "https://main.d2iv0khybuuaeh.amplifyapp.com" }) }).allowed, true);
});

test("the key reaches the running app, and is not sent to the browser", () => {
  assert.match(read("scripts/write-amplify-env.mjs"), /"STRIPE_SECRET_KEY"/);
  assert.doesNotMatch(read("components/test-checkout-button.tsx"), /STRIPE|process\.env/);
  assert.doesNotMatch(read("components/community-piece-sheet.tsx"), /STRIPE|process\.env/);
  assert.match(read("app/community/page.tsx"), /stripeTestKey\(process\.env\.STRIPE_SECRET_KEY\)/);
});

test("the words shown never call this a sale, and say plainly that no real money moves", () => {
  const button = read("components/test-checkout-button.tsx");
  assert.match(button, /No real money moves and nothing ships\. Do not enter a real card\./);
  const page = read("app/test-checkout/complete/page.tsx");
  assert.match(page, /No money moved, no order exists, and nothing ships\./);
  assert.match(page, /robots: \{ index: false/);
  assert.doesNotMatch(button + page, /\border confirmed\b|\bpurchased\b|\bsale\b/i);
});
