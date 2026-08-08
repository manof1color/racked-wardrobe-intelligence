/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { AppShell } from "./app-shell";
import { BrandProductEnrollment } from "./brand-product-enrollment";
import { BrandAgentPanel } from "./agent-panels";
import type { BrandProductRegistration } from "@/lib/platform-types";
import type { BrandMetrics } from "@/lib/metrics";

export function BrandDashboard() {
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [productId,setProductId]=useState("");
  const [metrics,setMetrics]=useState<BrandMetrics|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const product=products.find(item=>item.id===productId)??products[0];
  async function run(){if(!product)return;setLoading(true);setError("");setMetrics(null);try{const response=await fetch("/api/brand/metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:product.id})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Wear metrics could not be loaded.");setMetrics(data.metrics);}catch(reason){setError(reason instanceof Error?reason.message:"Wear metrics could not be loaded.");}finally{setLoading(false);}}
  return <AppShell role="brand"><main className="workspace brand-workspace">
    <section className="workspace-heading"><div><div className="eyebrow">PRIVATE BRAND WORKSPACE</div><h1>Understand how products<br/>are <em>actually worn.</em></h1><p>Enroll your catalog, connect verified consumer scans, and view privacy-safe aggregate use.</p></div>{product&&<button className="button button-dark" onClick={run} disabled={loading}>{loading?"Calculating…":"Refresh actual wear ↗"}</button>}</section>
    <div className="privacy-banner"><span>◉</span><div><strong>Privacy boundary active</strong><p>Only anonymous aggregates from opted-in owners are released. Names, emails, consumer photos, and raw wardrobes are never shown.</p></div><b>k ≥ 25</b></div>
    <BrandProductEnrollment onProducts={setProducts}/>
    {!product?<section className="empty-wardrobe"><div className="eyebrow">START WITH YOUR CATALOG</div><h2>Enroll your first real product.</h2><p>Add authorized product photography, label evidence, and a SKU. Racked can begin linking future verified consumer scans to it.</p></section>:<><section className="brand-layout"><aside className="catalog-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR CATALOG</div><h2>Choose a product</h2></div><span>{products.length} SKUs</span></div><div className="product-list">{products.map(item=><button key={item.id} className={item.id===product.id?"selected":""} onClick={()=>{setProductId(item.id);setMetrics(null);}}>{item.imageUrls?.front?<img className="tiny-product-photo" src={item.imageUrls.front} alt=""/>:<span className="tiny-swatch cloud"/>}<span><strong>{item.name}</strong><small>{item.sku} · {item.category}</small></span><i>→</i></button>)}</div></aside><section className="match-panel"><div className="selected-product">{product.imageUrls?.front?<div className="large-product-photo"><img src={product.imageUrls.front} alt={product.name}/></div>:<div className="large-swatch cloud"><span>{product.category}</span></div>}<div><div className="eyebrow">TRACKING NOW</div><h2>{product.name}</h2><p>{product.brand} · {product.sku}</p><div className="tag-row"><span>{product.category}</span><span>brand verified</span></div></div></div>
      {!metrics&&!loading?<div className="empty-match"><span>↗</span><h3>Ready to calculate actual wear</h3><p>Racked will count only verified, opted-in product owners and will suppress the result below the privacy threshold.</p><button className="button button-accent" onClick={run}>Calculate actual wear</button></div>:loading?<div className="empty-match"><span>…</span><h3>Computing the privacy-safe cohort</h3></div>:metrics?.suppressed?<div className="empty-match suppressed-match"><span>🔒</span><h3>Aggregate protected</h3><p>{metrics.segmentSize} qualifying owner{metrics.segmentSize===1?"":"s"} are currently connected. At least {metrics.minimumCohortSize} are required before any wear aggregate is released.</p></div>:metrics&&<div className="metric-row"><article><small>ACTUAL WEARS</small><strong>{metrics.actualWears}</strong><p>Confirmed wear events</p></article><article><small>REPEAT WEAR RATE</small><strong>{metrics.repeatWearRate}%</strong><p>Owners with 2+ wears</p></article><article><small>ACTIVE OWNERS</small><strong>{metrics.activeOwners}</strong><p>Owners with a wear</p></article><article><small>ELIGIBLE COHORT</small><strong>{metrics.segmentSize}</strong><p>Opted-in verified owners</p></article></div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
    </section></section><BrandAgentPanel productId={product.id}/></>}
  </main></AppShell>;
}
