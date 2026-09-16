import Link from "next/link";
import { redirect } from "next/navigation";
import { Flywheel } from "@/components/flywheel";
import { getSession } from "@/lib/auth";
import { workspaceHome } from "@/lib/workspace-navigation";

// Every figure on this page is either a product rule (the 25-owner threshold) or visibly marked
// as an example. Nothing here is a performance claim.
const EXAMPLE_WEEKLY_WEARS = [38, 52, 47, 61, 58, 72, 69, 80];

export default async function Home() {
  const session=await getSession();
  if(session)redirect(workspaceHome(session.role));
  return (
    <main className="lp">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link className="wordmark" href="/">RACKED<span>.</span></Link>
          <nav aria-label="Primary navigation">
            <Link className="lp-link" href="#how-it-works">How it works</Link>
            <Link className="lp-link" href="/community">Community</Link>
            <Link className="lp-link" href="/pricing">Pricing</Link>
            <Link className="button button-dark button-small" href="/login">Sign in</Link>
          </nav>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="eyebrow lp-rise"><span className="lp-dot" aria-hidden="true" /> Wardrobe intelligence, not another trend feed</p>
          <h1 className="lp-rise">Brands know what you bought. <em>Not what you wear.</em></h1>
          <p className="lp-lead lp-rise">Racked helps you get more from the clothes you already own — and gives brands the one thing a sale can&rsquo;t: how their pieces are actually worn, shared only as anonymous totals from people who opted in.</p>
          <div className="lp-actions lp-rise">
            <Link className="button button-accent lp-cta" href="/login">Create your wardrobe <span aria-hidden="true">→</span></Link>
            <Link className="lp-link" href="#how-it-works">See how it works</Link>
          </div>
          <p className="lp-trust lp-rise">Private photos · you confirm every detail · brands never see your closet</p>
        </div>

        <div className="lp-visual" role="img" aria-label="Example: a wardrobe card for a piece worn 14 times, and the anonymous weekly wear totals a brand sees only above 25 opted-in owners.">
          <article className="lp-card lp-card-closet" aria-hidden="true">
            <div className="lp-card-top"><span>YOUR CLOSET</span><span className="lp-tag">Example</span></div>
            <div className="lp-garment"><i /></div>
            <div className="lp-card-body">
              <strong>Linen overshirt</strong>
              <small>Top · sand · confirmed by you</small>
              <div className="lp-stats"><span><b>14</b> wears</span><span>Last worn 3 days ago</span></div>
            </div>
          </article>
          <article className="lp-card lp-card-brand" aria-hidden="true">
            <div className="lp-card-top"><span>WHAT A BRAND SEES</span><span className="lp-tag">Example</span></div>
            <div className="lp-bars">{EXAMPLE_WEEKLY_WEARS.map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div>
            <small>Weekly wears · 25+ opted-in owners · never a name, photo, or closet</small>
          </article>
        </div>
      </section>

      <section className="lp-principles" aria-label="Product principles">
        <ul>
          <li>Explainable matching</li>
          <li>Consent before insight</li>
          <li>Built for emerging brands</li>
          <li>Private by default</li>
        </ul>
      </section>

      <section className="lp-story lp-reveal" id="how-it-works">
        <div>
          <p className="eyebrow">The blind spot</p>
          <h2>Purchase history says what sold. A wardrobe says what stayed.</h2>
        </div>
        <p>Transactions end at checkout. Whether a piece became a staple, sat unworn, or only works with one other thing someone owns — almost none of that reaches the brand that made it. Racked measures it from real use, and releases it only as aggregates from people who opted in.</p>
      </section>

      <section className="lp-audiences lp-reveal" aria-label="Who Racked is for">
        <article className="lp-audience">
          <p className="lp-audience-label">For you</p>
          <h3>Use what you own</h3>
          <p>Photograph a piece, let AI identify it, build outfits, and record what you actually wear. See any public look and Racked shows how much of it is already in your closet.</p>
        </article>
        <article className="lp-audience">
          <p className="lp-audience-label">For brands</p>
          <h3>See the missing half</h3>
          <p>Confirmed wear, repeat use, and what a product gets styled with — released only above a 25-owner threshold, and only for products a brand enrolled and verified.</p>
        </article>
        <article className="lp-audience">
          <p className="lp-audience-label">For discovery</p>
          <h3>Shop only what&rsquo;s missing</h3>
          <p>When someone publishes an outfit, its verified pieces become discoverable. Shopping is the last step, and only an exact brand-authorized product is ever linked.</p>
        </article>
      </section>

      <Flywheel />

      <section className="lp-closing lp-reveal">
        <h2>Start with what you already own.</h2>
        <p>Add a piece from one photo. Nothing is saved until you confirm it, and you can delete any piece, or your whole account, whenever you choose.</p>
        <div className="lp-actions">
          <Link className="button button-accent lp-cta" href="/login">Create your wardrobe <span aria-hidden="true">→</span></Link>
          <Link className="lp-link lp-link-light" href="/community">Browse Community</Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div>
            <Link className="wordmark lp-wordmark-light" href="/">RACKED<span>.</span></Link>
            <p>CUA AI Vibe Coding Competition · Fall 2026 pilot</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/community">Community</Link>
            <Link href="/partners/clothing">Partners</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy & ethics</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
