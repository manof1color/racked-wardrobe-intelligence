import type { Metadata } from "next";
import Link from "next/link";

export const metadata:Metadata={title:"Terms of use"};

// Plain-language pilot terms. They say plainly that they are not a reviewed legal document,
// rather than borrowing boilerplate that would claim more than this pilot can stand behind.
export default function TermsPage(){return <main className="privacy-page"><Link className="wordmark" href="/">RACKED<span>.</span></Link><div className="eyebrow" style={{marginTop:70}}>TERMS OF USE · PILOT</div><h1>Plain terms<br/>for a pilot.</h1><p className="lead">Racked is a Fall 2026 competition pilot. These terms describe how it works today in plain language. They have not yet had legal review and will be replaced before any commercial launch.</p><section className="privacy-grid">
  <article><span>01</span><h2>Your wardrobe stays yours</h2><p>You own the photos and details you add. You allow Racked to store and process them only to run the service for you: recognising pieces, building outfits, and recording wears.</p></article>
  <article><span>02</span><h2>AI can be wrong</h2><p>Recognition, names, types, and Hanger suggestions are estimates. Check them before saving. Racked does not predict fit or size, and does not show how clothes look on a body.</p></article>
  <article><span>03</span><h2>Brand links need evidence</h2><p>A piece is linked to a brand product only when a barcode, or a brand together with its style code, matches an enrolled product. A brand name alone never verifies anything.</p></article>
  <article><span>04</span><h2>What you publish</h2><p>Only outfits you choose to publish appear in Community. Publish only photos you have the right to share, and nothing unlawful, hateful, or sexual.</p></article>
  <article><span>05</span><h2>Leaving</h2><p>Delete any piece from your Closet, or your whole account from Settings. Deleting your account removes your data as the privacy page describes.</p></article>
  <article><span>06</span><h2>A pilot, as is</h2><p>The service may change, pause, or contain errors while it is a pilot, and is provided as is. Demo storefronts and the $0.00 checkout are simulations, never sales.</p></article>
  </section><section className="deletion-box"><div className="eyebrow">RELATED</div><h2>How your data is handled.</h2><p>Consent, the 25-owner brand threshold, and deletion are explained on the privacy page.</p><Link className="button button-accent" href="/privacy">Read privacy &amp; ethics</Link></section></main>;}
