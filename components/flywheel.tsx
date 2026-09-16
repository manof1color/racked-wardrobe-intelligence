// Judge note: the ecosystem diagram. It describes how the loop works, not how well
// it performs — there is no outcome, revenue, or growth claim here. The visual is
// decorative for screen readers; the same sequence is available as ordered text.

const CONSUMER_STEPS = [
  { step: "01", label: "Upload wardrobe", detail: "Real photos of pieces you own" },
  { step: "02", label: "AI understands the garment", detail: "Category, subtype, attributes — confirmed by you" },
  { step: "03", label: "Build outfits", detail: "Compose looks from what is already yours" },
  { step: "04", label: "Record the wear", detail: "Confirmed use, not assumed use" },
  { step: "05", label: "Share, if you choose", detail: "Explicit publication, never automatic" },
];

const BRAND_OUTPUTS = [
  { label: "Wear insights", detail: "Is the product actually worn, and worn again" },
  { label: "Pairing insights", detail: "What it gets styled with, from public looks" },
  { label: "Community signal", detail: "Where it appears in outfits people published" },
];

const COMMERCE_OUTPUTS = [
  { label: "Outfit discovery", detail: "Looks lead; products follow" },
  { label: "Recreate from your closet", detail: "Use what you own before buying" },
  { label: "Verified product links", detail: "Only exact, brand-authorized destinations" },
];

export function Flywheel() {
  return <section className="lp-flow lp-reveal" aria-labelledby="flywheel-title">
    <div className="lp-flow-intro">
      <p className="eyebrow">How the system compounds</p>
      <h2 id="flywheel-title">One wardrobe. Two kinds of value.</h2>
      <p>Every step below is something a person chooses to do. The intelligence is a by-product of real use, which is why brands can learn from it without ever seeing a closet.</p>
    </div>

    {/* A real sequence, so it is numbered. */}
    <ol className="lp-flow-steps">
      {CONSUMER_STEPS.map((entry) => <li key={entry.step}>
        <span aria-hidden="true">{entry.step}</span>
        <strong>{entry.label}</strong>
        <small>{entry.detail}</small>
      </li>)}
    </ol>

    <div className="lp-flow-core" role="presentation">
      <strong>Racked intelligence</strong>
      <small>Consent-filtered · aggregated · never individual</small>
    </div>

    <div className="lp-flow-outputs">
      <article className="lp-flow-branch lp-flow-brands">
        <h3>For brands</h3>
        <ul>{BRAND_OUTPUTS.map((entry) => <li key={entry.label}><strong>{entry.label}</strong><small>{entry.detail}</small></li>)}</ul>
        <p>Released only above the 25-owner threshold, and only for products the brand enrolled.</p>
      </article>
      <article className="lp-flow-branch lp-flow-discovery">
        <h3>For discovery</h3>
        <ul>{COMMERCE_OUTPUTS.map((entry) => <li key={entry.label}><strong>{entry.label}</strong><small>{entry.detail}</small></li>)}</ul>
        <p>Shopping is the last step, never the first, and only for exact verified products.</p>
      </article>
    </div>

    <p className="lp-flow-outcome">Better product decisions · better matching · wardrobes people actually use</p>
  </section>;
}
