import Link from "next/link";
import { Flywheel } from "@/components/flywheel";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">RACKED<span>.</span></Link>
        <div className="nav-links">
          <Link href="#how-it-works">How it works</Link>
          <Link href="/community">Community</Link>
          <Link href="/partners/clothing">Partners</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link className="button button-dark button-small" href="/login">Sign in</Link>
        </div>
      </nav>
      <section className="hero">
        <div className="eyebrow"><span className="pulse-dot" /> Wardrobe intelligence, not another trend feed</div>
        <h1>Brands know what you bought.<br /><em>Not what you wear.</em></h1>
        <p className="hero-copy">A sale is where most brands stop seeing. Racked uses AI wardrobe intelligence to understand what people own, what they actually wear, and what they style it with — then gives brands that picture as privacy-safe aggregates, never a customer&rsquo;s closet.</p>
        <div className="hero-actions">
          <Link className="button button-accent" href="/login">Create your wardrobe <span aria-hidden="true">→</span></Link>
          <span className="hero-note">Private photos · confirmed attributes · anonymous brand insights</span>
        </div>
        <div className="hero-board" aria-label="Racked wardrobe intelligence overview">
          <div className="hero-card hero-garment"><span className="garment-art coral">YOUR ITEM</span><small>Private wardrobe</small><strong>Photo analyzed and confirmed</strong></div>
          <div className="match-connector"><span>AI</span><small>EXPLAINED</small></div>
          <div className="hero-card hero-result"><div className="mini-label">REAL ACCOUNT OUTPUT</div><strong>Wear, pairing, and outfit intelligence</strong><p>Insights appear only after a person adds, confirms, and wears their own garments. Brands receive aggregates, never a closet.</p></div>
        </div>
      </section>
      <section className="proof-strip" aria-label="Product principles">
        <span>01 · Explainable matching</span><span>02 · Consent before insight</span><span>03 · Built for emerging brands</span><span>04 · Private account-owned data</span>
      </section>
      <section className="story-section" id="how-it-works">
        <div><div className="eyebrow">THE BLIND SPOT</div><h2>Purchase history says what sold.<br />A wardrobe says what stayed.</h2></div>
        <p>Transactions end at checkout. Whether a piece became a staple, sat unworn, or only works with one other thing someone owns — almost none of that reaches the brand that made it. Racked measures it from real use, and releases it only as aggregates from people who opted in.</p>
      </section>
      <section className="step-grid">
        <article><span>01</span><h3>Use what you own</h3><p>Photograph a piece, let AI identify it, build outfits, and record what you actually wear. See any public look and Racked tells you how much of it is already in your closet.</p></article>
        <article><span>02</span><h3>Give brands the missing half</h3><p>Confirmed wear, repeat use, and what a product gets styled with — released only above a 25-owner threshold, and only for products a brand enrolled and verified.</p></article>
        <article><span>03</span><h3>Discover only what is missing</h3><p>When someone publishes an outfit, its verified pieces become discoverable. Shopping is the last step, and only an exact brand-authorized product is ever linked.</p></article>
      </section>
      <Flywheel />
      <footer className="landing-footer"><Link className="wordmark inverse" href="/">RACKED<span>.</span></Link><p>CUA AI Vibe Coding Competition · Fall 2026 pilot</p><Link href="/privacy">Privacy & ethics</Link></footer>
    </main>
  );
}
