/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoPurchasePanel } from "@/components/demo-purchase-panel";
import { DEMO_STORE_DISCLAIMER, demoProductImagePath, demoStoreBrandPath, formatPrice, isDemoStorefrontBrand, storefrontDescription, storefrontPrice } from "@/lib/demo-storefront";
import { listPublicBrandProducts } from "@/lib/server/production-store";

export async function generateMetadata({params}:{params:Promise<{brandSlug:string;sku:string}>}):Promise<Metadata>{
  const {brandSlug,sku}=await params;
  const products=await listPublicBrandProducts(brandSlug);
  const product=products.find(item=>item.sku.toLowerCase()===decodeURIComponent(sku).toLowerCase());
  return {title:product?`${product.name} — fictional demo product`:"Fictional demo storefront",robots:{index:false,follow:false}};
}

export default async function DemoStoreProduct({params}:{params:Promise<{brandSlug:string;sku:string}>}){
  const {brandSlug,sku}=await params;
  const products=await listPublicBrandProducts(brandSlug);
  if(!isDemoStorefrontBrand(products))notFound();
  const product=products.find(item=>item.sku.toLowerCase()===decodeURIComponent(sku).toLowerCase());
  if(!product)notFound();
  const price=storefrontPrice(product);
  const unavailable=product.availability==="unavailable"||product.availability==="discontinued";

  return <main className="demo-store">
    <div className="demo-store-banner" role="note"><strong>Demonstration only</strong><span>{DEMO_STORE_DISCLAIMER}</span></div>
    <header className="community-nav">
      <Link className="wordmark" href={demoStoreBrandPath(brandSlug)}>{product.brand}</Link>
      <nav><Link href={demoStoreBrandPath(brandSlug)}>All products</Link><Link href="/community">Back to Racked Community</Link></nav>
    </header>

    <section className="demo-product">
      <div className="demo-product-image">{demoProductImagePath(product.sku)||product.imageUrls?.front?<img src={demoProductImagePath(product.sku)??product.imageUrls?.front} alt={product.name}/>:<span aria-hidden="true">◻</span>}</div>
      <div className="demo-product-copy">
        <div className="eyebrow">{product.brand}</div>
        <h1>{product.name}</h1>
        <p className="demo-product-price">{formatPrice(price,product.currency)}</p>
        <p className="demo-product-description">{storefrontDescription(product)}</p>

        <dl className="demo-product-facts">
          <div><dt>SKU</dt><dd>{product.sku}</dd></div>
          <div><dt>Category</dt><dd>{product.category}</dd></div>
          <div><dt>GTIN</dt><dd>{product.gtin??"Not supplied"}</dd></div>
          <div><dt>Availability</dt><dd>{unavailable?"Not available":"Demonstration only"}</dd></div>
        </dl>

        <DemoPurchasePanel productId={product.id} productName={product.name} unavailable={unavailable}/>

        <Link className="text-link" href={`/brands/${brandSlug}`}>See how this product is measured on Racked →</Link>
      </div>
    </section>

    <footer className="demo-store-footer"><p>{DEMO_STORE_DISCLAIMER}</p><Link className="button button-accent demo-return-button" href="/community">Return to Racked →</Link></footer>
  </main>;
}
