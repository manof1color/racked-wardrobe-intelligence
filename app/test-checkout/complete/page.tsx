import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice } from "@/lib/demo-storefront";
import { readTestCheckoutSession, stripeTestKey, type TestCheckoutReceipt } from "@/lib/test-checkout";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false, follow: false } };

async function receiptFor(sessionId: unknown): Promise<TestCheckoutReceipt | null> {
  const key = stripeTestKey(process.env.STRIPE_SECRET_KEY);
  if (!key || typeof sessionId !== "string") return null;
  return readTestCheckoutSession(sessionId, { key }).catch(() => null);
}

/** Where Stripe returns after a test payment. It reads the session and stores nothing. */
export default async function TestCheckoutComplete({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  const { session_id: sessionId } = await searchParams;
  const receipt = await receiptFor(sessionId);
  return <main className="demo-store">
    <div className="demo-store-banner" role="note"><strong>Stripe test mode</strong><span>A fictional product and a test card. No money moved, no order exists, and nothing ships.</span></div>
    <section className="test-checkout-result" role="status">
      {receipt?.paid
        ? <>
          <h1>Test payment complete</h1>
          <p>Stripe accepted a test card for <strong>{receipt.productName}</strong>, {formatPrice(receipt.amount)}.</p>
        </>
        : <>
          <h1>{receipt ? "Test payment not finished" : "We could not confirm this test payment"}</h1>
          <p>Nothing was charged. You can try again from any fictional product in Community.</p>
        </>}
      <Link className="button button-accent" href="/community">Return to Racked</Link>
    </section>
  </main>;
}
