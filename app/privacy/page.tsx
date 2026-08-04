import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title:"Privacy & ethics" };
export default function PrivacyPage() {
  return <main className="privacy-page">
    <Link className="wordmark" href="/">RACKED<span>.</span></Link>
    <div className="eyebrow" style={{marginTop:70}}>PRIVACY & ETHICS BY DESIGN</div>
    <h1>Your closet is<br />not the product.</h1>
    <p className="lead">Racked is designed to learn useful product-fit signals without turning a person’s wardrobe into an identity dossier. The competition demo uses only fictional identities and behavior.</p>
    <section className="privacy-grid">
      <article><span>01</span><h2>Explicit opt-in</h2><p>Wardrobe analysis starts only after consent. Inferred garment attributes require confirmation before saving, and consent can be withdrawn.</p></article>
      <article><span>02</span><h2>Strict brand boundary</h2><p>Brands never receive names, emails, photographs, or raw wardrobe histories. Real insights are aggregated only when a cohort contains at least 25 opted-in people.</p></article>
      <article><span>03</span><h2>Grounded explanations</h2><p>Natural-language reasons may use only stored score components and confirmed attributes. Racked does not invent preferences, identity traits, sales lift, or predicted outcomes.</p></article>
      <article><span>04</span><h2>Minimal retention</h2><p>The demo discards uploaded images after simulated analysis. A production AWS design stores uploads privately, validates type and size, and deletes source images after extraction.</p></article>
      <article><span>05</span><h2>Bias safeguards</h2><p>Protected demographic attributes are excluded from matching. Recommendations use garment compatibility, wear, season, pairing, gaps, and duplicate risk—not inferred age, gender, ethnicity, or income.</p></article>
      <article><span>06</span><h2>Human control</h2><p>Consumers can correct AI attributes and see confidence. Brands see score composition and warnings. The deterministic fallback is visibly labeled whenever an external model is unavailable.</p></article>
    </section>
    <section className="deletion-box"><div className="eyebrow">DELETE-MY-DATA WORKFLOW</div><h2>One request, one ownership boundary.</h2><p>In this fictional demo, resetting the seeded account removes all session changes immediately. In production, an authenticated deletion request queues removal of the user record, wardrobe items, wear events, outfits, consents, match results, and private images; aggregated statistics are recomputed and the request receives an auditable completion timestamp.</p><Link className="button button-accent" href="/login">Return to demo</Link></section>
  </main>;
}
