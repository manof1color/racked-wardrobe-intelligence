import type { BrandProductRegistration, OutfitPost } from "./platform-types.ts";
import { isDemoStorefrontProduct, storefrontPrice } from "./demo-storefront.ts";

/**
 * Stripe test checkout, for fictional demo products only.
 *
 * A judge can walk the whole purchase on Stripe's hosted page with a test card. Stripe's test mode
 * moves no money, so nothing here is a sale: no order is created, nothing ships, and Racked stores
 * nothing from it. Three locks keep it that way, each of which fails closed:
 *
 * - Only a Stripe test key is accepted. A live key, or anything else, leaves the feature switched off.
 * - Only a fictional product can be bought. A real or pilot brand's product is refused before Stripe
 *   is called, so its name never leaves Racked and it can never gather checkout activity.
 * - The price comes from the catalog on the server, never from the browser. A response that says
 *   it is live, or that points anywhere but Stripe's checkout, is refused.
 *
 * Card details are typed on Stripe's own page and never reach Racked. The email is a fixed
 * placeholder, so nobody hands over a real address to try the demo.
 */

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_CHECKOUT_ORIGIN = "https://checkout.stripe.com/";
const MARKER = "fictional-demo";
const PLACEHOLDER_EMAIL = "test-checkout@example.com";
const TIMEOUT_MS = 10_000;

export const TEST_CARD = "4242 4242 4242 4242";

/** The key, only when it is a Stripe test key (secret or restricted). Anything else is treated as absent. */
export function stripeTestKey(value: string | undefined): string | null {
  const key = (value ?? "").trim();
  return /^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key) ? key : null;
}

type CheckoutProduct = Pick<BrandProductRegistration, "id" | "sku" | "name" | "category" | "price" | "currency" | "availability" | "dataClassification" | "testCohort">;

export interface CheckoutRefusal { status: 403 | 409; error: string }

/** Why this product cannot go to test checkout, or null when it can. Checked before Stripe is called. */
export function testCheckoutRefusal(product: CheckoutProduct): CheckoutRefusal | null {
  const fictional = isDemoStorefrontProduct(product) && (product.dataClassification === undefined || product.dataClassification === "DEMO");
  if (!fictional) return { status: 403, error: "Test checkout exists only for fictional demonstration products." };
  if (product.availability === "unavailable" || product.availability === "discontinued") return { status: 409, error: "This fictional product is deliberately unavailable." };
  if ((product.currency ?? "USD").toUpperCase() !== "USD") return { status: 409, error: "Test checkout supports fictional products priced in US dollars." };
  return null;
}

/** The amount in cents: the catalog's price, or the same fictional price its storefront shows. */
export function testCheckoutAmount(product: Pick<BrandProductRegistration, "sku" | "category" | "price">) {
  const exact = typeof product.price === "number" && Number.isFinite(product.price) && product.price > 0;
  return Math.round((exact ? product.price! : storefrontPrice(product)) * 100);
}

/** What Stripe is asked to show. The return addresses come from configuration, never from the request. */
export function testCheckoutForm(product: CheckoutProduct, origin: string) {
  const name = product.name.slice(0, 200);
  return new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    customer_email: PLACEHOLDER_EMAIL,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(testCheckoutAmount(product)),
    "line_items[0][price_data][product_data][name]": `${name} (fictional demo)`,
    "line_items[0][price_data][product_data][description]": "A fictional product made to demonstrate Racked. Nothing is charged and nothing ships.",
    "custom_text[submit][message]": `Stripe test mode. Use card ${TEST_CARD}, any future date and any CVC. Do not enter a real card.`,
    success_url: `${origin}/test-checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/community`,
    "metadata[racked_test_checkout]": MARKER,
    "metadata[racked_product_name]": name,
  });
}

type Fetcher = typeof fetch;

/** Its messages are fixed wording plus Stripe's status code, so they are safe to log. */
export class TestCheckoutError extends Error {}

/** Starts a test checkout and returns the address of Stripe's page. Errors never carry Stripe's body or the key. */
export async function createTestCheckoutSession(product: CheckoutProduct, { key, origin, fetcher = fetch }: { key: string; origin: string; fetcher?: Fetcher }) {
  const response = await fetcher(STRIPE_API, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: testCheckoutForm(product, origin).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new TestCheckoutError(`Stripe answered ${response.status}.`);
  const session = await response.json() as { url?: unknown; livemode?: unknown };
  if (session.livemode !== false) throw new TestCheckoutError("Stripe did not confirm test mode.");
  if (typeof session.url !== "string" || !session.url.startsWith(STRIPE_CHECKOUT_ORIGIN)) throw new TestCheckoutError("Stripe returned an unexpected address.");
  return session.url;
}

export interface TestCheckoutReceipt { productName: string; amount: number; paid: boolean }

/** What the return page shows. Null for anything but a test session Racked started; no customer detail is read out. */
export async function readTestCheckoutSession(sessionId: string, { key, fetcher = fetch }: { key: string; fetcher?: Fetcher }): Promise<TestCheckoutReceipt | null> {
  if (!/^cs_test_[A-Za-z0-9]{1,200}$/.test(sessionId)) return null;
  const response = await fetcher(`${STRIPE_API}/${sessionId}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return null;
  const session = await response.json() as { livemode?: unknown; payment_status?: unknown; amount_total?: unknown; metadata?: Record<string, unknown> | null };
  if (session.livemode !== false || session.metadata?.racked_test_checkout !== MARKER) return null;
  return {
    productName: String(session.metadata?.racked_product_name ?? "Fictional product"),
    amount: typeof session.amount_total === "number" ? session.amount_total / 100 : 0,
    paid: session.payment_status === "paid",
  };
}

/** Whether a piece's sheet offers the test checkout: a priced exact product in a post marked as fictional. */
export function offersTestCheckout(enabled: boolean, post: Pick<OutfitPost, "fictional" | "dataClassification">, card: { registryProductId: string | null; price: string | null }) {
  return enabled && (post.fictional === true || post.dataClassification === "DEMO") && Boolean(card.registryProductId && card.price);
}
