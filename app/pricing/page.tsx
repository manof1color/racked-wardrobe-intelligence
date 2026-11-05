import type { Metadata } from "next";
import Link from "next/link";
import { PRICING_TIERS } from "@/lib/pricing";
import { pricingPilotNote } from "@/lib/server/pilot-evidence";

export const metadata: Metadata = { title: "Planned pricing — Racked" };

export default function PricingPage() {
  const accepted=pricingPilotNote();
  return <main className="privacy-page pricing-page">
    <header className="community-nav">
      <Link className="wordmark" href="/">RACKED<span>.</span></Link>
      <nav><Link href="/community">Community</Link><Link href="/privacy">Privacy</Link><Link href="/login">Sign in</Link></nav>
    </header>
    <div className="eyebrow" style={{ marginTop: "60px" }}>BUSINESS MODEL</div>
    <h1>Planned pricing.</h1>
    <p className="lead">This is the proposed business model for Racked. <strong>Nothing on this page is currently billed</strong> — every account and feature in the competition build is free, and no payment method is ever collected.</p>
    <div className="pricing-disclaimer" role="note"><strong>Planned pricing — not yet billed.</strong> The tiers below are a forward-looking proposal, not an active offer.</div>
    {accepted&&<p className="pricing-pilot">{accepted}</p>}
    <div className="table-scroll" role="region" aria-label="Proposed tiers" tabIndex={0}>
      <table className="pricing-table">
        <caption className="eyebrow">Proposed tiers (not currently billed)</caption>
        <thead><tr><th scope="col">Tier</th><th scope="col">Price</th><th scope="col">Includes</th></tr></thead>
        <tbody>{PRICING_TIERS.map((row) => <tr key={row.tier}><th scope="row">{row.tier}</th><td>{row.price}</td><td>{row.includes}</td></tr>)}</tbody>
      </table>
    </div>
    <section className="privacy-grid pricing-logic">
      <article><span>01</span><h2>Consumers start free</h2><p>The consumer side stays free to solve the cold-start problem: wardrobe and wear data only become valuable once enough real closets exist, so nothing should stand between a consumer and logging their first garment.</p></article>
      <article><span>02</span><h2>Brands carry the revenue</h2><p>Actual-wear intelligence is the product brands cannot get anywhere else, so the three brand plans carry the business model rather than consumer subscriptions. They are priced like the apps a small brand already pays for, from $20 to $50 a month, with enrollment included.</p></article>
      <article><span>03</span><h2>Basic exists for emerging brands</h2><p>The target customer — an emerging brand — often cannot reach the k ≥ 25 privacy threshold immediately. The Basic plan prices that waiting period honestly: enrollment and verification, Community presence, Brand Looks, and whether a product has reached the threshold yet. It shows no private wear data and no fabricated aggregates.</p></article>
      <article><span>04</span><h2>Privacy is not a paid unlock</h2><p>No tier weakens the privacy model. Consent, the k ≥ 25 threshold, and aggregate-only release apply identically at every price point; paying more buys more analysis of released aggregates, never more access to people.</p></article>
    </section>
    <p className="auth-fineprint" style={{ textAlign: "left", fontSize: ".72rem", color: "var(--muted)" }}>No billing, checkout, or payment integration exists in this application. See the <Link href="/privacy" style={{ textDecoration: "underline" }}>privacy page</Link> for the data model that applies to every tier.</p>
  </main>;
}
