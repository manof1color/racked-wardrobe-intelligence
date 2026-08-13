/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { BrandProductEnrollment } from "./brand-product-enrollment";
import { BrandLookBuilder } from "./brand-look-builder";
import { HangerDock } from "./hanger-dock";
import type { BrandCommunityMetrics, BrandProductRegistration } from "@/lib/platform-types";
import type { BrandMetrics } from "@/lib/metrics";

function readableDate(value?:string|null){return value?new Date(value).toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"No recorded event";}

export function BrandDashboard() {
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [productId,setProductId]=useState("");
  const [metrics,setMetrics]=useState<BrandMetrics|null>(null);
  const [communityMetrics,setCommunityMetrics]=useState<BrandCommunityMetrics|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const product=products.find(item=>item.id===productId)??products[0];

  const acceptProducts=useCallback((next:BrandProductRegistration[])=>{setProducts(next);if(next.length){setLoading(true);setMetrics(null);setCommunityMetrics(null);}},[]);
  function chooseProduct(id:string){setProductId(id);setMetrics(null);setCommunityMetrics(null);setError("");setLoading(true);}

  useEffect(()=>{
    if(!product?.id)return;
    let current=true;
    Promise.all([
      fetch("/api/brand/metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:product.id})}),
      fetch("/api/brand/community-metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:product.id})}),
    ]).then(async ([wearResponse,communityResponse])=>{const wear=await wearResponse.json();const community=await communityResponse.json();if(!wearResponse.ok)throw new Error(wear.error??"Wear metrics could not be loaded.");if(!communityResponse.ok)throw new Error(community.error??"Community metrics could not be loaded.");if(current){setMetrics(wear.metrics);setCommunityMetrics(community.metrics);}})
      .catch(reason=>{if(current)setError(reason instanceof Error?reason.message:"Wear metrics could not be loaded.");})
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[product?.id]);

  function downloadAggregate(){
    if(!metrics||metrics.suppressed||!product)return;
    const rows=[
      ["Racked privacy-safe product wear export",product.name],
      ["Brand",product.brand],["SKU",product.sku],["Eligible opted-in owners",metrics.segmentSize],
      ["Confirmed wear events",metrics.actualWears??0],["Active owners",metrics.activeOwners??0],
      ["Engagement rate",`${metrics.engagementRate??0}%`],["Repeat-wear rate",`${metrics.repeatWearRate??0}%`],
      ["Average wears per owner",metrics.averageWearsPerOwner??0],["Median wears per owner",metrics.medianWearsPerOwner??0],
      ["Zero-wear owners",metrics.zeroWearOwners??0],["6+ wear owners",metrics.highFrequencyOwners??0],
      ["Last aggregate event",metrics.lastWearAt??"none"],[],["8-week trend","wears"],
      ...(metrics.weeklyTrend??[]).map(point=>[point.weekStart,point.wears]),[],["Wear frequency","owners","percentage"],
      ...(metrics.wearDistribution??[]).map(point=>[point.label,point.owners,`${point.percentage}%`]),
    ];
    const csv=rows.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`racked-${product.sku.toLowerCase()}-wear-aggregate.csv`;link.click();URL.revokeObjectURL(url);
  }

  const maxTrend=Math.max(1,...(metrics?.weeklyTrend??[]).map(point=>point.wears));
  const maxDistribution=Math.max(1,...(metrics?.wearDistribution??[]).map(point=>point.owners));

  return <AppShell role="brand"><main className="workspace brand-workspace">
    <section className="workspace-heading"><div><div className="eyebrow">PRIVATE BRAND WORKSPACE</div><h1>Understand how products<br/>are <em>actually worn.</em></h1><p>Verified wear events become privacy-safe product intelligence: frequency, engagement, repeat use, and change over time.</p></div>{metrics&&!metrics.suppressed&&<button className="button button-dark" onClick={downloadAggregate}>Download aggregate CSV ↗</button>}</section>
    <div className="privacy-banner"><span>◉</span><div><strong>Privacy boundary active</strong><p>Only anonymous aggregates from opted-in owners are released. Names, emails, consumer photos, raw wardrobes, and individual rows are never shown.</p></div><b>k ≥ 25</b></div>
    <BrandProductEnrollment onProducts={acceptProducts}/>
    <BrandLookBuilder products={products}/>
    {!product?<section className="empty-wardrobe"><div className="eyebrow">START WITH YOUR CATALOG</div><h2>Enroll your first real product.</h2><p>Add authorized product photography, label evidence, and a SKU. Racked can begin linking future verified consumer scans to it.</p></section>:<section className="brand-layout"><aside className="catalog-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR CATALOG</div><h2>Choose a product</h2></div><span>{products.length} SKUs</span></div><div className="product-list">{products.map(item=><button key={item.id} className={item.id===product.id?"selected":""} onClick={()=>chooseProduct(item.id)}>{item.imageUrls?.front?<img className="tiny-product-photo" src={item.imageUrls.front} alt=""/>:<span className="tiny-swatch cloud"/>}<span><strong>{item.name}</strong><small>{item.sku} · {item.category}</small></span><i>→</i></button>)}</div></aside><section className="match-panel">
      <div className="selected-product">{product.imageUrls?.front?<div className="large-product-photo"><img src={product.imageUrls.front} alt={product.name}/></div>:<div className="large-swatch cloud"><span>{product.category}</span></div>}<div><div className="eyebrow">TRACKING NOW</div><h2>{product.name}</h2><p>{product.brand} · {product.sku}</p><div className="tag-row"><span>{product.category}</span><span>brand verified</span>{product.dataClassification==="DEMO"||product.testCohort?<span>synthetic demo data</span>:product.dataClassification==="PILOT"?<span>pilot brand</span>:null}</div></div></div>
      {loading?<div className="analytics-loading" role="status"><span/><strong>Calculating the privacy-safe wear cohort</strong></div>:metrics?.suppressed?<div className="empty-match suppressed-match"><span>🔒</span><h3>Aggregate protected</h3><p>{metrics.segmentSize} qualifying owner{metrics.segmentSize===1?"":"s"} are currently connected. At least {metrics.minimumCohortSize} are required before any wear aggregate is released.</p></div>:metrics&&<>
        <div className="metric-row metric-row-expanded"><article><small>CONFIRMED WEARS</small><strong>{metrics.actualWears}</strong><p>Timestamped wear events</p></article><article><small>ACTIVE OWNERS</small><strong>{metrics.activeOwners}<i> / {metrics.segmentSize}</i></strong><p>{metrics.engagementRate}% recorded a wear</p></article><article><small>REPEAT WEAR RATE</small><strong>{metrics.repeatWearRate}%</strong><p>Owners with two or more wears</p></article><article><small>AVERAGE FREQUENCY</small><strong>{metrics.averageWearsPerOwner}</strong><p>Wears per eligible owner</p></article><article><small>MEDIAN FREQUENCY</small><strong>{metrics.medianWearsPerOwner}</strong><p>Middle owner wear count</p></article><article><small>HIGH FREQUENCY</small><strong>{metrics.highFrequencyOwners}</strong><p>Owners with six or more wears</p></article></div>
        <div className="wear-chart-grid"><section className="wear-chart-card"><header><div><span className="card-label">ACTUAL DATAPOINTS</span><h3>Eight-week wear activity</h3></div><small>Last event<br/><b>{readableDate(metrics.lastWearAt)}</b></small></header><div className="weekly-bars" role="img" aria-label="Confirmed wears by week">{metrics.weeklyTrend?.map(point=><div key={point.weekStart}><span style={{height:`${Math.max(5,point.wears/maxTrend*100)}%`}}><b>{point.wears}</b></span><small>{point.label}</small></div>)}</div></section>
          <section className="wear-chart-card"><header><div><span className="card-label">OWNER FREQUENCY</span><h3>Wear distribution</h3></div><small>Anonymous aggregate<br/><b>{metrics.segmentSize} eligible owners</b></small></header><div className="distribution-bars">{metrics.wearDistribution?.map(point=><div key={point.label}><label><span>{point.label}</span><b>{point.owners} · {point.percentage}%</b></label><i><span style={{width:`${point.owners/maxDistribution*100}%`}}/></i></div>)}</div></section></div>
        <section className="aggregate-table"><div><span className="card-label">MEASURE DEFINITIONS</span><h3>What the brand can safely use</h3><p>These are calculated from verified product links and confirmed wear events after consent and the 25-owner threshold are applied.</p></div><table><thead><tr><th>Datapoint</th><th>Value</th><th>Business interpretation</th></tr></thead><tbody><tr><td>Eligible cohort</td><td>{metrics.segmentSize}</td><td>Opted-in owners linked to this verified SKU</td></tr><tr><td>Engagement rate</td><td>{metrics.engagementRate}%</td><td>Share with at least one confirmed wear</td></tr><tr><td>Zero-wear owners</td><td>{metrics.zeroWearOwners}</td><td>Aggregate education or styling opportunity</td></tr><tr><td>Repeat wear</td><td>{metrics.repeatWearRate}%</td><td>Share demonstrating more than one use</td></tr><tr><td>Total events</td><td>{metrics.actualWears}</td><td>Observed usage, not predicted sales or intent</td></tr></tbody></table></section>
      </>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      {communityMetrics&&<section className="aggregate-table"><div><span className="card-label">PUBLIC COMMUNITY ACTIVITY</span><h3>How this product appears in shared Looks</h3><p>This separate aggregate uses only intentionally public posts and identity-free interaction events. It does not include private wardrobe or individual wear data.</p></div><div className="metric-row"><article><small>PUBLIC LOOKS</small><strong>{communityMetrics.publicOutfitAppearances}</strong><p>{communityMetrics.consumerOutfitAppearances} consumer · {communityMetrics.brandLookAppearances} brand</p></article><article><small>INSPIRATION</small><strong>{communityMetrics.inspirationCount}</strong><p>Likes on public Looks</p></article><article><small>RECREATE REQUESTS</small><strong>{communityMetrics.recreateLookRequests}</strong><p>Identity-free requests</p></article><article><small>OUTBOUND INTEREST</small><strong>{communityMetrics.outboundProductClicks}</strong><p>Controlled product clicks</p></article></div>{communityMetrics.pairedCategories.length>0&&<div className="tag-row" aria-label="Frequently paired categories">{communityMetrics.pairedCategories.map(pair=><span key={pair.category}>{pair.category} · {pair.appearances}</span>)}</div>}</section>}
    </section></section>}
  </main><HangerDock role="brand" productId={product?.id}/></AppShell>;
}
