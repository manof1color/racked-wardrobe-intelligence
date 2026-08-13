/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_STORE_DISCLAIMER, demoStoreProductPath, formatPrice, isDemoStorefrontBrand, storefrontPrice } from "@/lib/demo-storefront";
import { listPublicBrandProducts } from "@/lib/server/production-store";

export async function generateMetadata({params}:{params:Promise<{brandSlug:string}>}):Promise<Metadata>{
  const {brandSlug}=await params;
  const products=await listPublicBrandProducts(brandSlug);
  return {title:products[0]?`${products[0].brand} — fictional demo storefront`:"Fictional demo storefront",robots:{index:false,follow:false}};
}

export default async function DemoStorefront({params}:{params:Promise<{brandSlug:string}>}){
  const {brandSlug}=await params;
  const products=await listPublicBrandProducts(brandSlug);
  // A storefront exists only for demonstration brands; a real or pilot brand never
  // gets a fictional shop rendered on its behalf.
  if(!isDemoStorefrontBrand(products))notFound();
  const brand=products[0].brand;

  return <main className="demo-store">
    <div className="demo-store-banner" role="note"><strong>Fictional demo storefront</strong><span>{DEMO_STORE_DISCLAIMER}</span></div>
    <header className="community-nav">
      <span className="wordmark">{brand}</span>
      <nav><Link href="/community">Back to Racked Community</Link><Link href={`/brands/${brandSlug}`}>Racked brand page</Link></nav>
    </header>

    <section className="demo-store-hero">
      <div className="eyebrow">DEMONSTRATION CATALOG</div>
      <h1>{brand}</h1>
      <p>This is a fictional shop built inside Racked so the &ldquo;Shop the Look&rdquo; journey can be demonstrated end to end. {brand} is not a real company, these products do not exist, and nothing here can be bought.</p>
    </section>

    <section className="demo-store-grid">
      {products.map(product=>{
        const price=storefrontPrice(product);
        return <article className="demo-store-card" key={product.id}>
          <Link href={demoStoreProductPath(brandSlug,product.sku)}>
            <div className="demo-store-image">{product.imageUrls?.front?<img src={product.imageUrls.front} alt={product.name}/>:<span aria-hidden="true">◻</span>}</div>
            <div className="demo-store-card-copy">
              <strong>{product.name}</strong>
              <small>{product.category} · {product.sku}</small>
              <b>{formatPrice(price,product.currency)}</b>
            </div>
          </Link>
        </article>;
      })}
    </section>

    <footer className="demo-store-footer"><p>{DEMO_STORE_DISCLAIMER}</p><Link href="/community">Return to Racked →</Link></footer>
  </main>;
}
