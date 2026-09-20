/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { BrandProductEnrollment } from "./brand-product-enrollment";
import { BrandLookBuilder } from "./brand-look-builder";
import { BrandProductEditor } from "./brand-product-editor";
import { HangerDock } from "./hanger-dock";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";
import { communityIsEmpty, communityReadouts, pairingSummary, wearHeadline, wearReadouts } from "@/lib/brand-insights";
import type { BrandCommunityMetrics, BrandProductRegistration } from "@/lib/platform-types";
import type { BrandMetrics } from "@/lib/metrics";

function readableDate(value?:string|null){return value?new Date(value).toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"No recorded event";}

/** Finds a product the way a person looks for one: by name, style code, or category. */
function matchesQuery(product:BrandProductRegistration,query:string){
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const haystack=[product.name,product.sku,product.category,product.subtype,product.color].filter(Boolean).join(" ").toLowerCase();
  return terms.every(term=>haystack.includes(term));
}

/** Says what is left of the enumeration budget, so a refusal is never a surprise. */
function budgetNote(budget?:{remaining:number;limit:number;resetsInSeconds:number}){
  if(!budget)return null;
  const minutes=Math.ceil(budget.resetsInSeconds/60);
  if(budget.remaining>0)return `You can open ${budget.remaining} more product${budget.remaining===1?"":"s"} in the next few minutes. Products you have already opened stay free to revisit.`;
  return `You have opened ${budget.limit} products in the last few minutes, the most Racked releases at once. Revisit one of those now, or open a new one in about ${minutes} minute${minutes===1?"":"s"}. This limit protects owners from being identified by comparison across products.`;
}

export function BrandDashboard() {
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [productId,setProductId]=useState("");
  const [metrics,setMetrics]=useState<BrandMetrics|null>(null);
  const [communityMetrics,setCommunityMetrics]=useState<BrandCommunityMetrics|null>(null);
  const [liveActivity,setLiveActivity]=useState(true);
  const [lastRefreshedAt,setLastRefreshedAt]=useState<Date|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [showRetired,setShowRetired]=useState(false);
  const [editing,setEditing]=useState(false);
  const [copied,setCopied]=useState(false);
  const retiredCount=products.filter(item=>item.archived).length;
  const visible=products.filter(item=>(showRetired||!item.archived)&&matchesQuery(item,query));
  const product=products.find(item=>item.id===productId)??visible[0]??products.find(item=>!item.archived)??products[0];

  // A newly enrolled product is what the brand wants to look at, so it is selected on arrival.
  const acceptProducts=useCallback((next:BrandProductRegistration[])=>{
    setProducts(current=>{const known=new Set(current.map(item=>item.id));const arrived=next.find(item=>!known.has(item.id));if(arrived&&current.length)setProductId(arrived.id);return next;});
    if(next.length){setLoading(true);setMetrics(null);setCommunityMetrics(null);}
  },[]);
  function chooseProduct(id:string){setProductId(id);setMetrics(null);setCommunityMetrics(null);setError("");setLoading(true);setEditing(false);}
  function productSaved(saved:BrandProductRegistration){setProducts(current=>current.map(item=>item.id===saved.id?{...item,...saved}:item));}
  async function copyBrandLink(url:string){try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),2_500);}catch{setCopied(false);}}

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

  // Live public-activity refresh. Only the community measure polls: private wear
  // aggregates are consent-gated and enumeration-budgeted, so re-pulling them on a
  // timer would burn that budget for no benefit. The interval stays well inside the
  // brand-metrics rate limit, and polling pauses whenever the tab is hidden.
  useEffect(()=>{
    if(!product?.id||!liveActivity)return;
    let current=true;
    const timer=setInterval(()=>{
      if(document.visibilityState!=="visible")return;
      fetch("/api/brand/community-metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:product.id})})
        .then(async response=>{const data=await response.json();if(response.ok&&current){setCommunityMetrics(data.metrics);setLastRefreshedAt(new Date());}})
        .catch(()=>{/* a dropped poll is not an error worth showing mid-demo */});
    },20_000);
    return()=>{current=false;clearInterval(timer);};
  },[product?.id,liveActivity]);

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

  return <AppShell role="brand"><main className="workspace brand-workspace" id="brand-dashboard">
    <section className="workspace-heading"><div><div className="eyebrow">PRIVATE BRAND WORKSPACE</div><h1>Understand how products<br/>are <em>actually worn.</em></h1><p>Verified wear events become privacy-safe product intelligence: frequency, engagement, repeat use, and change over time.</p></div>{metrics&&!metrics.suppressed&&<button className="button button-dark" onClick={downloadAggregate}>Download aggregate CSV ↗</button>}</section>
    <div className="privacy-banner"><span>◉</span><div><strong>Wear data appears after 25 eligible owners</strong><p>Until 25 opted-in owners connect to the selected product, Racked hides its private wear statistics. Names, emails, photos, wardrobes, and individual rows are never shown.</p></div><b>25+ owners</b></div>
    <BrandProductEnrollment onProducts={acceptProducts}/>
    <BrandLookBuilder products={products}/>
    {!product?<section className="empty-wardrobe"><div className="eyebrow">START WITH YOUR CATALOG</div><h2>Enroll your first real product.</h2><p>Add one product photo and its SKU. Racked fills in the rest from the photo, and customers can link the product by its label, by search, or when their scan recognises it.</p></section>:<section className="brand-layout"><aside className="catalog-panel"><div className="panel-heading"><div><div className="eyebrow">YOUR CATALOG</div><h2>Choose a product</h2></div><span>{products.filter(item=>!item.archived).length} live SKU{products.filter(item=>!item.archived).length===1?"":"s"}</span></div>
      <div className="catalog-filter">
        <label className="sr-only" htmlFor="brand-catalog-search">Search your catalog</label>
        <input id="brand-catalog-search" type="search" value={query} placeholder="Search by name, style code, or category" onChange={event=>setQuery(event.target.value)}/>
        {retiredCount>0&&<label className="catalog-retired-toggle"><input type="checkbox" checked={showRetired} onChange={event=>setShowRetired(event.target.checked)}/><span>Show {retiredCount} retired</span></label>}
      </div>
      {visible.length===0&&<p className="catalog-note">No product matches “{query.trim()}”.</p>}
      <div className="product-list">{visible.map(item=><button key={item.id} className={item.id===product.id?"selected":""} onClick={()=>chooseProduct(item.id)}>{item.imageUrls?.front?<img className="tiny-product-photo" src={item.imageUrls.front} alt=""/>:<span className="tiny-swatch cloud"/>}<span><strong>{item.name}</strong><small>{item.sku} · {item.category}{item.archived?" · retired":""}</small></span><i>→</i></button>)}</div></aside><section className="match-panel">
      <div className="selected-product">{product.imageUrls?.front?<div className="large-product-photo"><img src={product.imageUrls.front} alt={product.name}/></div>:<div className="large-swatch cloud"><span>{product.category}</span></div>}<div><div className="eyebrow">TRACKING NOW</div><h2>{product.name}</h2><p>{product.brand} · {product.sku}</p><div className="tag-row"><span>{product.category}</span><span>registry enrolled</span>{product.archived?<span>retired</span>:null}{product.dataClassification==="DEMO"||product.testCohort?<span>synthetic demo data</span>:product.dataClassification==="PILOT"?<span>pilot brand</span>:null}</div>
        <button type="button" className="button button-light button-small" aria-expanded={editing} onClick={()=>setEditing(value=>!value)}>{editing?"Close editing":"Edit or retire"}</button></div></div>
      {editing&&<BrandProductEditor product={product} onSaved={productSaved} onClose={()=>setEditing(false)}/>}
      <div className="brand-share">
        <div><strong>Tell customers where to link</strong><p>Anyone can search your brand name when adding a piece, or use the code from its label. Your public page lists every live product.</p></div>
        <div className="brand-share-link"><code>/brands/{product.brandSlug}</code><button type="button" className="button button-light button-small" onClick={()=>void copyBrandLink(`${window.location.origin}/brands/${product.brandSlug}`)}>{copied?"Copied":"Copy link"}</button></div>
      </div>
      {loading?<div className="analytics-loading" role="status"><span/><strong>Calculating the privacy-safe wear cohort</strong></div>:metrics?.suppressed?<div className="empty-match suppressed-match"><span>🔒</span><h3>{wearHeadline(metrics).statement}</h3><p>{wearHeadline(metrics).support}</p><p><b>Fewer than {metrics.minimumCohortSize} qualifying owners</b> are connected so far. Below the threshold Racked withholds even the count, because a small number can single people out. Suppression here is the control working, not a missing feature.</p></div>:metrics&&<>
        <section className="wear-headline"><strong>{wearHeadline(metrics).statement}</strong><p>{wearHeadline(metrics).support}</p></section>
        <div className="metric-row metric-row-expanded"><article><small>CONFIRMED WEARS</small><strong>{metrics.actualWears}</strong><p>Timestamped wear events</p></article><article><small>ACTIVE OWNERS</small><strong>{metrics.activeOwners}<i> / {metrics.segmentSize}</i></strong><p>{metrics.engagementRate}% recorded a wear</p></article><article><small>REPEAT WEAR RATE</small><strong>{metrics.repeatWearRate}%</strong><p>Owners with two or more wears</p></article><article><small>AVERAGE FREQUENCY</small><strong>{metrics.averageWearsPerOwner}</strong><p>Wears per eligible owner</p></article><article><small>MEDIAN FREQUENCY</small><strong>{metrics.medianWearsPerOwner}</strong><p>Middle owner wear count</p></article><article><small>HIGH FREQUENCY</small><strong>{metrics.highFrequencyOwners}</strong><p>Owners with six or more wears</p></article></div>
        <div className="wear-chart-grid"><section className="wear-chart-card"><header><div><span className="card-label">ACTUAL DATAPOINTS</span><h3>Eight-week wear activity</h3></div><small>Last event<br/><b>{readableDate(metrics.lastWearAt)}</b></small></header><div className="weekly-bars" role="img" aria-label="Confirmed wears by week">{metrics.weeklyTrend?.map(point=><div key={point.weekStart}><span style={{height:`${Math.max(5,point.wears/maxTrend*100)}%`}}><b>{point.wears}</b></span><small>{point.label}</small></div>)}</div></section>
          <section className="wear-chart-card"><header><div><span className="card-label">OWNER FREQUENCY</span><h3>Wear distribution</h3></div><small>Anonymous aggregate<br/><b>{metrics.segmentSize} eligible owners</b></small></header><div className="distribution-bars">{metrics.wearDistribution?.map(point=><div key={point.label}><label><span>{point.label}</span><b>{point.owners} · {point.percentage}%</b></label><i><span style={{width:`${point.owners/maxDistribution*100}%`}}/></i></div>)}</div></section></div>
        <section className="business-read"><div className="section-title"><div><span className="card-label">WHAT THIS MEANS</span><h3>Your questions, answered from confirmed wear</h3></div></div><div className="readout-grid">{wearReadouts(metrics).map(readout=><article key={readout.question} className={`readout tone-${readout.tone}`}><h4>{readout.question}</h4><strong>{readout.value}</strong><p>{readout.detail}</p></article>)}</div><p className="readout-footnote">Every figure is observed usage from opted-in owners after the {metrics.minimumCohortSize}-owner threshold. Racked reports what was worn — never sales, revenue, or why someone bought.</p></section>
      </>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      {budgetNote(metrics?.budget)&&<p className="budget-note">{budgetNote(metrics?.budget)}</p>}
      {communityMetrics&&<section className="business-read"><div className="section-title"><div><span className="card-label">PUBLIC COMMUNITY ACTIVITY</span><h3>How this product shows up in shared Looks</h3><p>A separate measure built only from posts people chose to publish and identity-free interactions. No private wardrobe or individual wear data is used here.</p></div>
        <div className="live-activity"><button type="button" className={liveActivity?"live-toggle on":"live-toggle"} aria-pressed={liveActivity} onClick={()=>setLiveActivity(value=>!value)}><i aria-hidden="true"/>{liveActivity?"Live":"Paused"}</button><small>{liveActivity?`Refreshes every 20s${lastRefreshedAt?` · updated ${lastRefreshedAt.toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"})}`:""}`:"Auto-refresh paused"}</small></div></div>
        {communityIsEmpty(communityMetrics)
          ? <div className="empty-match"><h3>No public activity yet.</h3><p>Nothing has been published featuring this product, so there is nothing to report. Racked shows this honestly rather than filling the space.</p></div>
          : <><div className="readout-grid">{communityReadouts(communityMetrics).map(readout=><article key={readout.question} className={`readout tone-${readout.tone}`}><h4>{readout.question}</h4><strong>{readout.value}</strong><p>{readout.detail}</p></article>)}</div>
            {pairingSummary(communityMetrics).hasAny&&<div className="pairing-block"><h4>What it gets worn with</h4>
              {pairingSummary(communityMetrics).categories.length>0&&<div className="tag-row" aria-label="Frequently paired categories">{pairingSummary(communityMetrics).categories.map(pair=><span key={pair.category}>{pair.category} · {pair.appearances} look{pair.appearances===1?"":"s"}</span>)}</div>}
              {pairingSummary(communityMetrics).products.length>0&&<ul className="pairing-products">{pairingSummary(communityMetrics).products.map(pair=><li key={pair.productId}><strong>{pair.name}</strong><small>{pair.brand} · {pair.appearances} shared look{pair.appearances===1?"":"s"}</small></li>)}</ul>}
              <small>Counted from public Looks only.</small></div>}</>}
      </section>}
    </section></section>}
  </main><HangerDock role="brand" productId={product?.id}/><WorkspaceMobileNav role="brand" active="brand"/></AppShell>;
}
