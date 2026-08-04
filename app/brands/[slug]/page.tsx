import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalog } from "@/lib/demo-data";

const brands={
  "northstar-atelier":{name:"Northstar Atelier",kind:"Independent apparel brand",description:"Fictional small-batch essentials designed for repeat combinations.",product:"Sienna Soft Overshirt",sku:"NA-OW-1042",image:"/test-uploads/northstar-overshirt-front.png",wearRate:"74%",pairings:"4.2"},
  "second-story-vintage":{name:"Second Story Vintage",kind:"Vintage reseller",description:"Fictional verified vintage workwear with repair and provenance notes.",product:"1978 Work Jacket",sku:"VR-JK-1978",image:"/test-uploads/northstar-overshirt-back.png",wearRate:"71%",pairings:"3.8"},
} as const;

export function generateStaticParams(){return Object.keys(brands).map((slug)=>({slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const brand=brands[slug as keyof typeof brands];return {title:brand?.name??"Brand"};}

export default async function BrandProfile({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params; const brand=brands[slug as keyof typeof brands]; if(!brand)notFound();
  const catalogProduct=catalog.find((item)=>item.sku===brand.sku);
  return <main className="brand-profile"><header className="community-nav"><Link className="wordmark" href="/">RACKED<span>.</span></Link><nav><Link href="/community">Community</Link><Link href="/partners/clothing">Partner dashboards</Link></nav></header><section className="brand-profile-hero"><div><div className="eyebrow">LABEL-VERIFIED BRAND PAGE · FICTIONAL</div><h1>{brand.name}</h1><p>{brand.description}</p><div className="brand-profile-tags"><span>{brand.kind}</span><span>SKU linked</span><span>Wear data opted-in</span></div></div><div className="brand-profile-score"><strong>{brand.wearRate}</strong><span>60-DAY ACTUAL-WEAR RATE</span></div></section><section className="brand-product-feature"><div className="brand-product-image"><Image src={brand.image} alt={`${brand.product} test product`} fill sizes="50vw"/></div><div><div className="eyebrow">FEATURED IN COMMUNITY OUTFITS</div><h2>{brand.product}</h2><code>{brand.sku}</code><p>The public product connection comes from the confirmed label view, not image similarity alone.</p><dl><div><dt>Average pairings</dt><dd>{brand.pairings}</dd></div><div><dt>Actual-wear rate</dt><dd>{brand.wearRate}</dd></div><div><dt>Catalog match</dt><dd>{catalogProduct?"Confirmed":"Archive"}</dd></div></dl><Link className="button button-accent" href="/community">Return to the public outfit →</Link><small>This is the brand destination for the competition demo; no external purchase is made.</small></div></section></main>;
}
