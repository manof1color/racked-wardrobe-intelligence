/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { BrandProductEnrollment } from "./brand-product-enrollment";
import { BrandProductEditor } from "./brand-product-editor";
import { BrandLookBuilder } from "./brand-look-builder";
import { HangerDock } from "./hanger-dock";
import { WorkspaceMobileNav, type BrandWorkspaceView } from "./workspace-mobile-nav";
import { communityIsEmpty, communityReadouts, pairingSummary, wearHeadline, wearReadouts } from "@/lib/brand-insights";
import { catalogAttention } from "@/lib/brand-catalog-health";
import { brandOnboardingComplete, brandOnboardingProgress, brandOnboardingSteps } from "@/lib/brand-onboarding";
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

/** The state of one product at a glance, before any private data is involved. */
function productChips(product:BrandProductRegistration){
  return [
    product.archived?{label:"Retired",tone:"retired"}:{label:"Live",tone:"live"},
    ...(product.price===undefined?[{label:"No price",tone:"todo"}]:[]),
    ...(product.productUrl?[]:[{label:"No link",tone:"todo"}]),
    ...(product.dataClassification==="DEMO"||product.testCohort?[{label:"Demo data",tone:"demo"}]:[]),
    ...(product.dataClassification==="PILOT"?[{label:"Pilot",tone:"demo"}]:[]),
  ];
}

/**
 * The brand workspace, as three places rather than one scroll.
 *
 * Everything used to stack on one page: the enrollment form, the Look builder, and the dashboard,
 * in that order — so the daily job (what did this product do?) sat below two jobs a brand does
 * rarely. Overview, Catalog, and Looks are now real views, and a product's wear intelligence opens
 * from the catalog.
 *
 * Two rules shape what goes where. Private aggregates appear **only** on an opened product, never on
 * Overview: per-product release status is derived from cohort size, so a catalog-wide view of it
 * would be exactly the cross-product differencing the enumeration budget exists to prevent. And the
 * budget is spent only when a person opens a product — landing on the workspace no longer costs one.
 */
export function BrandDashboard({initialView="overview"}:{initialView?:BrandWorkspaceView}) {
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [productId,setProductId]=useState("");
  const [view,setView]=useState<BrandWorkspaceView>(initialView);
  const [metrics,setMetrics]=useState<BrandMetrics|null>(null);
  const [communityMetrics,setCommunityMetrics]=useState<BrandCommunityMetrics|null>(null);
  const [liveActivity,setLiveActivity]=useState(true);
  const [lastRefreshedAt,setLastRefreshedAt]=useState<Date|null>(null);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [showRetired,setShowRetired]=useState(false);
  const [editing,setEditing]=useState(false);
  const [copied,setCopied]=useState(false);
  const [publishedLookCount,setPublishedLookCount]=useState(0);
  const [sharedLink,setSharedLink]=useState(false);
  const [checklistHidden,setChecklistHidden]=useState(false);
  // A product enrolled in this session cannot have owners yet, so its aggregates are not worth a
  // slice of the enumeration budget. Its id is remembered only for this visit.
  const [justEnrolled,setJustEnrolled]=useState<string[]>([]);
  const [catalogLoaded,setCatalogLoaded]=useState(false);

  const live=products.filter(item=>!item.archived);
  const retiredCount=products.length-live.length;
  const visible=products.filter(item=>(showRetired||!item.archived)&&matchesQuery(item,query));
  const product=products.find(item=>item.id===productId)??null;
  const brandSlug=products[0]?.brandSlug??"";
  const attention=catalogAttention(products);

  // A newly enrolled product is what the brand wants to look at, so it is opened on arrival. The
  // ids seen so far live in a ref rather than in the state updater, which React may run twice.
  const knownProductIds=useRef<Set<string>>(new Set());
  const acceptProducts=useCallback((next:BrandProductRegistration[])=>{
    const arrivals=next.filter(item=>!knownProductIds.current.has(item.id));
    const hadProducts=knownProductIds.current.size>0;
    knownProductIds.current=new Set(next.map(item=>item.id));
    setProducts(next);
    if(!arrivals.length||!hadProducts)return;
    setJustEnrolled(ids=>[...ids,...arrivals.map(item=>item.id)]);
    // One new product is the one to look at. A batch of them is a catalog to look over, so the
    // catalog is where a bulk enrolment lands.
    if(arrivals.length===1){const arrived=arrivals[0];setProductId(arrived.id);setMetrics(null);setCommunityMetrics(null);setError("");setView("product");}
    else setView("catalog");
  },[]);

  // The workspace owns the catalog. It used to be fetched by the enrollment panel, which only the
  // Catalog view mounts — so Overview, the view a brand lands on, believed the catalog was empty
  // until they happened to visit Catalog.
  useEffect(()=>{
    let current=true;
    fetch("/api/brand/products").then(async response=>{
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Catalog could not be loaded.");
      if(!current)return;
      knownProductIds.current=new Set((data.products??[]).map((item:BrandProductRegistration)=>item.id));
      setProducts(data.products??[]);
      setCatalogLoaded(true);
    }).catch(reason=>{if(current){setError(reason instanceof Error?reason.message:"Catalog could not be loaded.");setCatalogLoaded(true);}});
    return()=>{current=false;};
  },[]);

  // Two things the checklist needs that the catalog does not: how many Looks are published, and
  // whether this device has copied the public link. Reading a Look count spends no privacy budget.
  useEffect(()=>{
    let current=true;
    // Both reads land in the same asynchronous step: the stored flags are per-device conveniences,
    // and reading them during render would disagree with the server's HTML.
    const storedFlag=(key:string)=>{try{return window.localStorage.getItem(key)==="1";}catch{return false;}};
    fetch("/api/brand/looks").then(response=>response.ok?response.json():{looks:[]}).catch(()=>({looks:[]}))
      .then((data:{looks?:Array<{published?:boolean}>})=>{
        if(!current)return;
        setPublishedLookCount((data.looks??[]).filter(look=>look.published).length);
        setSharedLink(storedFlag("racked.brand.sharedLink"));
        setChecklistHidden(storedFlag("racked.brand.checklistHidden"));
      });
    return()=>{current=false;};
  },[]);

  function remember(key:string){try{window.localStorage.setItem(key,"1");}catch{/* nothing to remember on this device */}}

  function openProduct(id:string){setProductId(id);setMetrics(null);setCommunityMetrics(null);setError("");setEditing(false);setView("product");}
  function productSaved(saved:BrandProductRegistration){setProducts(current=>current.map(item=>item.id===saved.id?{...item,...saved}:item));}
  async function copyBrandLink(url:string){try{await navigator.clipboard.writeText(url);setCopied(true);setSharedLink(true);remember("racked.brand.sharedLink");window.setTimeout(()=>setCopied(false),2_500);}catch{setCopied(false);}}

  // Opening a product is what spends a slice of the enumeration budget, so the request is tied to
  // the product view rather than to loading the workspace.
  useEffect(()=>{
    // Nothing can have been linked to a product enrolled moments ago, so asking would spend a slice
    // of the enumeration budget to be told so.
    if(view!=="product"||!productId||justEnrolled.includes(productId))return;
    let current=true;
    Promise.all([
      fetch("/api/brand/metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId})}),
      fetch("/api/brand/community-metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId})}),
    ]).then(async ([wearResponse,communityResponse])=>{const wear=await wearResponse.json();const community=await communityResponse.json();if(!wearResponse.ok)throw new Error(wear.error??"Wear metrics could not be loaded.");if(!communityResponse.ok)throw new Error(community.error??"Community metrics could not be loaded.");if(current){setMetrics(wear.metrics);setCommunityMetrics(community.metrics);}})
      .catch(reason=>{if(current)setError(reason instanceof Error?reason.message:"Wear metrics could not be loaded.");});
    return()=>{current=false;};
  },[view,productId,justEnrolled]);

  // Live public-activity refresh. Only the community measure polls: private wear
  // aggregates are consent-gated and enumeration-budgeted, so re-pulling them on a
  // timer would burn that budget for no benefit. The interval stays well inside the
  // brand-metrics rate limit, and polling pauses whenever the tab is hidden.
  useEffect(()=>{
    if(view!=="product"||!productId||!liveActivity)return;
    let current=true;
    const timer=setInterval(()=>{
      if(document.visibilityState!=="visible")return;
      fetch("/api/brand/community-metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId})})
        .then(async response=>{const data=await response.json();if(response.ok&&current){setCommunityMetrics(data.metrics);setLastRefreshedAt(new Date());}})
        .catch(()=>{/* a dropped poll is not an error worth showing mid-demo */});
    },20_000);
    return()=>{current=false;clearInterval(timer);};
  },[view,productId,liveActivity]);

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
  const tabs:Array<{id:BrandWorkspaceView;label:string}>=[{id:"overview",label:"Overview"},{id:"catalog",label:"Catalog"},{id:"looks",label:"Brand Looks"}];
  // The skeleton shows while an opened product has neither an answer nor an error yet.
  const calculating=view==="product"&&Boolean(productId)&&!justEnrolled.includes(productId)&&!metrics&&!error;
  const steps=brandOnboardingSteps({products,publishedLookCount,sharedLink});
  const progress=brandOnboardingProgress(steps);
  const showChecklist=!checklistHidden&&!brandOnboardingComplete(steps);

  const productCard=(item:BrandProductRegistration)=><button type="button" key={item.id} className={`product-card ${item.archived?"retired":""}`} onClick={()=>openProduct(item.id)}>
    {item.imageUrls?.front?<img src={item.imageUrls.front} alt=""/>:<span className="product-card-blank" aria-hidden="true">{item.category}</span>}
    <span className="product-card-copy">
      <strong>{item.name}</strong>
      <small>{item.sku} · {item.category}</small>
      <span className="chip-row">{productChips(item).map(chip=><i key={chip.label} className={`chip chip-${chip.tone}`}>{chip.label}</i>)}</span>
    </span>
  </button>;

  return <AppShell role="brand"><main className="workspace brand-workspace" id="brand-dashboard">
    <nav className="workspace-tabs brand-view-tabs" aria-label="Brand workspace views">
      {tabs.map(tab=><button key={tab.id} type="button" className={view===tab.id||(view==="product"&&tab.id==="catalog")?"active":""} aria-current={view===tab.id?"page":undefined} onClick={()=>{setView(tab.id);setError("");}}>{tab.label}</button>)}
    </nav>

    {view==="overview"&&<>
      <section className="workspace-heading"><div><div className="eyebrow">PRIVATE BRAND WORKSPACE</div><h1>Understand how products<br/>are <em>actually worn.</em></h1><p>Verified wear events become privacy-safe product intelligence: frequency, engagement, repeat use, and change over time. Open a product in your catalog to see its numbers.</p></div></section>

      {catalogLoaded&&products.length===0
        ? <section className="empty-wardrobe"><div className="eyebrow">START WITH YOUR CATALOG</div><h2>Enroll your first real product.</h2><p>Add one product photo and its SKU. Racked fills in the rest from the photo, and customers can link the product by its label, by search, or when their scan recognises it.</p><button type="button" className="button button-accent" onClick={()=>setView("catalog")}>Go to your catalog</button></section>
        : catalogLoaded?<>
          {showChecklist&&<section className="onboarding-card">
            <div className="onboarding-head">
              <div><div className="eyebrow">GETTING SET UP</div><h2>{progress.done} of {progress.total} done</h2></div>
              <button type="button" className="back-link" onClick={()=>{setChecklistHidden(true);remember("racked.brand.checklistHidden");}}>Hide</button>
            </div>
            <ol className="onboarding-steps">{steps.map(step=><li key={step.id} className={step.done?"done":""}>
              <span aria-hidden="true">{step.done?"✓":"○"}</span>
              <span><strong>{step.label}</strong><small>{step.detail}</small></span>
              {!step.done&&step.id!=="share"&&<button type="button" className="button button-light button-small" onClick={()=>setView(step.id==="look"?"looks":"catalog")}>{step.id==="look"?"Build a Look":"Open catalog"}</button>}
            </li>)}</ol>
          </section>}

          <div className="overview-grid">
            <article className="overview-card"><small>LIVE PRODUCTS</small><strong>{live.length}</strong><p>{retiredCount>0?`${retiredCount} retired, still owned by the people who linked them`:"Enrolled and answering label checks, search, and recognition"}</p></article>
            <article className="overview-card"><small>WEAR INTELLIGENCE</small><strong>25+</strong><p>Opens per product once 25 opted-in owners have linked it. Below that a product shows nothing — not even the count.</p></article>
            <article className="overview-card"><small>YOUR PUBLIC PAGE</small><strong>{live.length} listed</strong><p>Customers find your products by searching your brand name, or by the code on the label.</p></article>
          </div>

          {attention.length>0&&<section className="attention-list">
            <h2>Worth finishing</h2>
            <ul>{attention.map(item=><li key={item.productId}><span><strong>{item.name}</strong><small>{item.detail}</small></span><button type="button" className="button button-light button-small" onClick={()=>openProduct(item.productId)}>Open</button></li>)}</ul>
          </section>}

          <div className="brand-share">
            <div><strong>Tell customers where to link</strong><p>Anyone can search your brand name when adding a piece, or use the code from its label. Your public page lists every live product.</p></div>
            <div className="brand-share-link"><code>/brands/{brandSlug}</code><button type="button" className="button button-light button-small" onClick={()=>void copyBrandLink(`${window.location.origin}/brands/${brandSlug}`)}>{copied?"Copied":"Copy link"}</button></div>
          </div>
        </>:<div className="metric-skeleton" role="status" aria-live="polite"><strong>Loading your catalog</strong><span/><span/></div>}
    </>}

    {view==="catalog"&&<>
      <BrandProductEnrollment products={products} onProducts={acceptProducts}/>
      <section className="catalog-view">
        <div className="panel-heading"><div><div className="eyebrow">YOUR CATALOG</div><h2>Open a product</h2></div><span>{live.length} live SKU{live.length===1?"":"s"}</span></div>
        <div className="catalog-filter">
          <label className="sr-only" htmlFor="brand-catalog-search">Search your catalog</label>
          <input id="brand-catalog-search" type="search" value={query} placeholder="Search by name, style code, or category" onChange={event=>setQuery(event.target.value)}/>
          {retiredCount>0&&<label className="catalog-retired-toggle"><input type="checkbox" checked={showRetired} onChange={event=>setShowRetired(event.target.checked)}/><span>Show {retiredCount} retired</span></label>}
        </div>
        {catalogLoaded&&products.length===0&&<p className="catalog-note">Nothing enrolled yet. Add your first product above — one photo and a style code is enough.</p>}
        {products.length>0&&visible.length===0&&<p className="catalog-note">No product matches “{query.trim()}”.</p>}
        <div className="product-grid">{visible.map(productCard)}</div>
      </section>
    </>}

    {view==="looks"&&<BrandLookBuilder products={live}/>}

    {view==="product"&&product&&<section className="product-view">
      <div className="product-view-head">
        <button type="button" className="back-link" onClick={()=>setView("catalog")}>← Catalog</button>
        {metrics&&!metrics.suppressed&&<button className="button button-dark button-small" onClick={downloadAggregate}>Download aggregate CSV ↗</button>}
      </div>
      <div className="selected-product">{product.imageUrls?.front?<div className="large-product-photo"><img src={product.imageUrls.front} alt={product.name}/></div>:<div className="large-swatch cloud"><span>{product.category}</span></div>}<div><div className="eyebrow">TRACKING NOW</div><h2>{product.name}</h2><p>{product.brand} · {product.sku}</p><div className="chip-row">{productChips(product).map(chip=><i key={chip.label} className={`chip chip-${chip.tone}`}>{chip.label}</i>)}</div>
        <button type="button" className="button button-light button-small" aria-expanded={editing} onClick={()=>setEditing(value=>!value)}>{editing?"Close editing":"Edit or retire"}</button></div></div>
      {editing&&<BrandProductEditor product={product} onSaved={productSaved} onClose={()=>setEditing(false)}/>}

      {justEnrolled.includes(product.id)?<div className="empty-match"><h3>Nothing has been linked to this yet.</h3><p>You enrolled it a moment ago. Wear intelligence opens once 25 opted-in owners have linked it, and Racked will not spend one of your aggregate requests asking about a product that cannot have owners yet.</p></div>:calculating?<div className="metric-skeleton" role="status" aria-live="polite"><strong>Calculating the privacy-safe wear cohort</strong><span/><span/><span/></div>:metrics?.suppressed?<div className="empty-match suppressed-match"><span>🔒</span><h3>{wearHeadline(metrics).statement}</h3><p>{wearHeadline(metrics).support}</p><p><b>Fewer than {metrics.minimumCohortSize} qualifying owners</b> are connected so far. Below the threshold Racked withholds even the count, because a small number can single people out. Suppression here is the control working, not a missing feature.</p></div>:metrics&&<>
        <section className="wear-hero">
          <div><span className="card-label">CONFIRMED WEARS</span><strong>{metrics.actualWears}</strong><p>{wearHeadline(metrics).statement}</p><small>{wearHeadline(metrics).support}</small></div>
        </section>
        <div className="metric-row metric-row-secondary"><article><small>ACTIVE OWNERS</small><strong>{metrics.activeOwners}<i> / {metrics.segmentSize}</i></strong><p>{metrics.engagementRate}% recorded a wear</p></article><article><small>REPEAT WEAR RATE</small><strong>{metrics.repeatWearRate}%</strong><p>Owners with two or more wears</p></article><article><small>AVERAGE FREQUENCY</small><strong>{metrics.averageWearsPerOwner}</strong><p>Wears per eligible owner</p></article><article><small>MEDIAN FREQUENCY</small><strong>{metrics.medianWearsPerOwner}</strong><p>Middle owner wear count</p></article><article><small>HIGH FREQUENCY</small><strong>{metrics.highFrequencyOwners}</strong><p>Owners with six or more wears</p></article></div>
        <div className="wear-chart-grid"><section className="wear-chart-card"><header><div><span className="card-label">ACTUAL DATAPOINTS</span><h3>Eight-week wear activity</h3></div><small>Last event<br/><b>{readableDate(metrics.lastWearAt)}</b></small></header><div className="weekly-bars" role="img" aria-label="Confirmed wears by week">{metrics.weeklyTrend?.map(point=><div key={point.weekStart}><span style={{height:`${Math.max(5,point.wears/maxTrend*100)}%`}}><b>{point.wears}</b></span><small>{point.label}</small></div>)}</div><figcaption>Confirmed wears per week, opted-in owners only.</figcaption></section>
          <section className="wear-chart-card"><header><div><span className="card-label">OWNER FREQUENCY</span><h3>Wear distribution</h3></div><small>Anonymous aggregate<br/><b>{metrics.segmentSize} eligible owners</b></small></header><div className="distribution-bars">{metrics.wearDistribution?.map(point=><div key={point.label}><label><span>{point.label}</span><b>{point.owners} · {point.percentage}%</b></label><i><span style={{width:`${point.owners/maxDistribution*100}%`}}/></i></div>)}</div><figcaption>How many owners wore it how often. No individual rows, ever.</figcaption></section></div>
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
    </section>}
  </main><HangerDock role="brand" productId={view==="product"?product?.id:undefined} brandHasProducts={products.length>0} onOpenCatalog={()=>setView("catalog")}/><WorkspaceMobileNav role="brand" active={view==="product"?"catalog":view} onBrandView={next=>{setView(next);setError("");}}/></AppShell>;
}
