/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { brandProfileSummary, splitBrandProfileLooks } from "@/lib/brand-profile";
import { dataLabel, shoppableLanguage } from "@/lib/look-language";
import { listCommunityPosts, listPublicBrandProducts } from "@/lib/server/production-store";
import type { OutfitPost } from "@/lib/platform-types";

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  const products=await listPublicBrandProducts(slug);
  return {title:products[0]?.brand??"Brand"};
}

function LookTile({post,kind}:{post:OutfitPost;kind:"brand"|"consumer"}){
  const synthetic=dataLabel(post);
  const images=post.garments.filter(garment=>garment.image).slice(0,4);
  return <article className="brand-look-tile">
    <div className="brand-look-images">{images.length
      ? images.map(garment=><img key={garment.publicGarmentId} src={garment.image} alt={garment.name}/>)
      : <span className="brand-look-empty">Outfit image unavailable</span>}</div>
    <div className="brand-look-copy">
      <div className="look-meta">
        <span className={`look-source ${kind}`}>{kind==="brand"?"Brand Look":"Community Look"}</span>
        {kind==="consumer"&&<span className="look-handle">{post.handle}</span>}
        {synthetic&&<span className="look-demo" title={synthetic.detail}>{synthetic.label}</span>}
      </div>
      <h3>{post.outfitTitle}</h3>
      <p>{post.caption}</p>
      <small>{post.garments.length} piece{post.garments.length===1?"":"s"} · ♡ {post.likes}</small>
    </div>
  </article>;
}

export default async function BrandProfile({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const [products,posts]=await Promise.all([listPublicBrandProducts(slug),listCommunityPosts()]);
  const first=products[0];
  if(!first)notFound();
  const looks=splitBrandProfileLooks(posts,slug);
  const summary=brandProfileSummary(looks);

  return <main className="brand-profile">
    <header className="community-nav">
      <Link className="wordmark" href="/">RACKED<span>.</span></Link>
      <nav><Link href="/community">Community</Link><Link href="/pricing">Pricing</Link><Link href="/login">Brand sign in</Link></nav>
    </header>

    <section className="brand-profile-hero">
      <div>
        <div className="eyebrow">BRAND-VERIFIED PRODUCT PAGE</div>
        <h1>{first.brand}</h1>
        <p>Products here were enrolled by this brand with authorized product and label evidence. Below them are the outfits the brand styled itself, and the outfits real people published wearing its verified products.</p>
        <div className="brand-profile-tags">
          <span>{products.length} enrolled SKU{products.length===1?"":"s"}</span>
          <span>{summary.brandLookCount} Brand Look{summary.brandLookCount===1?"":"s"}</span>
          <span>{summary.communityLookCount} Community Look{summary.communityLookCount===1?"":"s"}</span>
        </div>
      </div>
    </section>

    <nav className="brand-profile-jump" aria-label="Brand profile sections">
      <a href="#products">Products</a>
      <a href="#brand-looks">Brand Looks</a>
      <a href="#community-looks">Community Looks</a>
    </nav>

    <section id="products" className="brand-profile-section">
      <div className="section-title"><div><div className="eyebrow">ENROLLED CATALOG</div><h2>Products</h2></div><p className="section-note">Verified through registry SKU or GTIN evidence, not appearance.</p></div>
      <div className="brand-public-grid">{products.map(product=>{
        const state=shoppableLanguage({resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:product.id,sku:product.sku,name:product.name,brand:product.brand,brandSlug:product.brandSlug,...(product.availability==="unavailable"||product.availability==="discontinued"?{commerceState:"EXACT_UNAVAILABLE" as const}:{})}});
        return <article className="brand-product-feature" key={product.id}>
          <div className="brand-product-image">{product.imageUrls?.front&&<img src={product.imageUrls.front} alt={product.name}/>}</div>
          <div>
            <div className="eyebrow">ENROLLED PRODUCT</div>
            <h3>{product.name}</h3>
            <code>{product.sku}</code>
            <span className={`shop-badge tone-${state.tone}`}>{state.label}</span>
            <p>Consumer items connect here only after label/SKU evidence matches this brand-authorized registry record.</p>
            <dl>
              <div><dt>Category</dt><dd>{product.category}</dd></div>
              <div><dt>GTIN</dt><dd>{product.gtin??"Not supplied"}</dd></div>
              <div><dt>Enrolled</dt><dd>{new Date(product.enrolledAt).toLocaleDateString()}</dd></div>
            </dl>
          </div>
        </article>;
      })}</div>
    </section>

    <section id="brand-looks" className="brand-profile-section">
      <div className="section-title"><div><div className="eyebrow">STYLED BY THE BRAND</div><h2>Brand Looks</h2></div><p className="section-note">Merchandising and styling the brand published from its own enrolled products.</p></div>
      {looks.brandLooks.length===0
        ? <div className="empty-match"><h3>No Brand Looks published yet.</h3><p>Brand accounts can style their enrolled products into a Look from the Brand workspace.</p></div>
        : <div className="brand-look-grid">{looks.brandLooks.map(post=><LookTile key={post.id} post={post} kind="brand"/>)}</div>}
    </section>

    <section id="community-looks" className="brand-profile-section">
      <div className="section-title"><div><div className="eyebrow">WORN BY REAL PEOPLE</div><h2>Community Looks</h2></div><p className="section-note">Outfits people chose to publish that contain a verified product from this brand. Not brand-created.</p></div>
      {looks.communityLooks.length===0
        ? <div className="empty-match"><h3>No public Community outfits feature this brand yet.</h3><p>Community Looks appear here only when someone publishes an outfit containing a verified product from this catalog.</p></div>
        : <div className="brand-look-grid">{looks.communityLooks.map(post=><LookTile key={post.id} post={post} kind="consumer"/>)}</div>}
      <p className="brand-profile-footnote">Community Looks are published by individual people, not by {first.brand}. Racked shows only what each person explicitly chose to publish and never their wider wardrobe.</p>
    </section>

    <div className="brand-profile-cta"><Link className="button button-accent" href="/community">Explore every public look →</Link></div>
  </main>;
}
