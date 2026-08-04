import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">RACKED<span>.</span></Link>
        <div className="nav-links">
          <Link href="#how-it-works">How it works</Link>
          <Link href="/privacy">Privacy</Link>
          <Link className="button button-dark button-small" href="/login">Open demo</Link>
        </div>
      </nav>
      <section className="hero">
        <div className="eyebrow"><span className="pulse-dot" /> Wardrobe intelligence, not another trend feed</div>
        <h1>Sell what fits<br />their <em>real life.</em></h1>
        <p className="hero-copy">Racked turns opted-in wardrobe and wear patterns into explainable product matches—helping people buy less randomly and helping emerging brands market more precisely.</p>
        <div className="hero-actions">
          <Link className="button button-accent" href="/login">Experience the judge demo <span aria-hidden="true">→</span></Link>
          <span className="hero-note">Fictional data · deterministic fallback · no PII</span>
        </div>
        <div className="hero-board" aria-label="Example Racked match result">
          <div className="hero-card hero-garment"><span className="garment-art coral">OVERSHIRT</span><small>Consumer wardrobe</small><strong>12 pieces understood</strong></div>
          <div className="match-connector"><span>92</span><small>FIT SCORE</small></div>
          <div className="hero-card hero-result"><div className="mini-label">WHY IT FITS</div><strong>Fills a lightweight layer gap</strong><p>Pairs with 4 frequently worn basics and adds a missing warm neutral.</p><div className="score-line"><i style={{width:"92%"}} /></div></div>
        </div>
      </section>
      <section className="proof-strip" aria-label="Product principles">
        <span>01 · Explainable matching</span><span>02 · Consent before insight</span><span>03 · Built for emerging brands</span><span>04 · Reliable without an AI call</span>
      </section>
      <section className="story-section" id="how-it-works">
        <div><div className="eyebrow">THE OPPORTUNITY</div><h2>Purchase history says what sold.<br />A wardrobe says what belongs.</h2></div>
        <p>Small apparel brands rarely know whether a product complements what a customer actually wears, duplicates an ignored category, or closes a useful wardrobe gap. Racked makes that context measurable without exposing a person’s closet.</p>
      </section>
      <section className="step-grid">
        <article><span>01</span><h3>Understand the closet</h3><p>Consumers confirm AI-suggested attributes, record wears, and see useful wardrobe patterns.</p></article>
        <article><span>02</span><h3>Score the fit</h3><p>Seven inspectable signals combine category, color, pairing, season, wear, gaps, and duplicate risk.</p></article>
        <article><span>03</span><h3>Activate responsibly</h3><p>Brands see anonymous segments, grounded reasons, and campaign ideas—not names, photos, or raw wardrobes.</p></article>
      </section>
      <footer className="landing-footer"><Link className="wordmark inverse" href="/">RACKED<span>.</span></Link><p>CUA AI Vibe Coding Competition · Fall 2026 pilot</p><Link href="/privacy">Privacy & ethics</Link></footer>
    </main>
  );
}
