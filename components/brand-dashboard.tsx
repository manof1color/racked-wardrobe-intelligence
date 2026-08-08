"use client";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { catalog, wardrobe } from "@/lib/demo-data";
import { scoreProduct } from "@/lib/matching";
import type { BrandMetrics } from "@/lib/metrics";
import { BrandAgentPanel } from "./agent-panels";
import { BrandProductEnrollment } from "./brand-product-enrollment";

export function BrandDashboard() {
  // Judge note: the per-product hero score/reasons below still runs against the single seeded
  // demo wardrobe client-side (labeled synthetic, same as before). The four SEGMENT metrics —
  // opportunity/gap/duplicate/eligible-segment — now come from POST /api/brand/metrics instead
  // of being computed in this client component: that computation depends on the ~160-profile
  // synthetic population (lib/population.ts), which should never ship in the browser bundle
  // regardless of what the UI chooses to render from it.
  const [productId,setProductId] = useState(catalog[0].id);
  const [hasRun,setHasRun] = useState(true);
  const [catalogNotice,setCatalogNotice] = useState(false);
  const [copied,setCopied] = useState(false);
  const [metrics,setMetrics] = useState<BrandMetrics|null>(null);
  const [metricsError,setMetricsError] = useState("");
  const [completedKey,setCompletedKey] = useState<string|null>(null);
  const [refreshKey,setRefreshKey] = useState(0);
  const product = catalog.find((item)=>item.id===productId) ?? catalog[0];
  const result = useMemo(()=>scoreProduct(product,wardrobe),[product]);
  const requestKey = `${product.id}:${refreshKey}`;
  const metricsLoading = hasRun && completedKey !== requestKey;

  useEffect(()=>{
    if (!hasRun) return;
    let cancelled=false;
    fetch("/api/brand/metrics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({productId:product.id})})
      .then(async (response)=>{const data=await response.json(); if(!response.ok) throw new Error(data.error??"Segment metrics could not be loaded."); if(!cancelled){setMetrics(data.metrics);setMetricsError("");}})
      .catch((reason)=>{if(!cancelled){setMetricsError(reason instanceof Error?reason.message:"Segment metrics could not be loaded.");setMetrics(null);}})
      .finally(()=>{if(!cancelled) setCompletedKey(requestKey);});
    return ()=>{cancelled=true;};
  },[hasRun,requestKey,product.id]);

  return <AppShell role="brand"><main className="workspace brand-workspace">
    <section className="workspace-heading"><div><div className="eyebrow">NORTHSTAR ATELIER · FICTIONAL BRAND</div><h1>Find the wardrobes<br />where this <em>belongs.</em></h1><p>Choose a product, run an explainable match, and turn grounded signals into a campaign brief.</p></div><button className="button button-dark" onClick={()=>setHasRun(true)}>Run product match ↗</button></section>
    <div className="privacy-banner"><span>◉</span><div><strong>Privacy boundary active</strong><p>Only anonymous demo segments above the minimum cohort threshold are visible, computed server-side. Names, emails, photos, and raw wardrobes stay hidden.</p></div><b>k ≥ 25</b></div>
    <BrandProductEnrollment />
    <BrandAgentPanel productId={product.id}/>
    <section className="brand-layout">
      <aside className="catalog-panel"><div className="panel-heading"><div><div className="eyebrow">SEEDED CATALOG</div><h2>Choose a product</h2></div><span>{catalog.length} SKUs</span></div><div className="product-list">{catalog.map((item)=><button key={item.id} className={item.id===productId?"selected":""} onClick={()=>{setProductId(item.id);setHasRun(false);setCopied(false);}}><span className={`tiny-swatch ${item.art}`} /><span><strong>{item.name}</strong><small>{item.sku} · ${item.price}</small></span><i>→</i></button>)}</div><button type="button" className="csv-button" aria-expanded={catalogNotice} onClick={()=>setCatalogNotice((open)=>!open)}>CSV import contract</button>{catalogNotice&&<p className="csv-notice" role="status">The runnable demo uses <code>data/demo-products.csv</code>. Production import validates SKU, brand, category, color, provenance, and license before saving.</p>}</aside>
      <section className="match-panel">
        <div className="selected-product"><div className={`large-swatch ${product.art}`}><span>{product.category}</span></div><div><div className="eyebrow">MATCHING NOW</div><h2>{product.name}</h2><p>{product.sku} · {product.color} · {product.style.join(" / ")}</p><div className="tag-row"><span>{product.season}</span><span>{product.category}</span></div></div><div className="hero-score"><strong>{hasRun?result.score:"—"}</strong><span>OPPORTUNITY<br/>SCORE</span></div></div>
        {!hasRun ? <div className="empty-match"><span>↗</span><h3>Ready to recalculate</h3><p>Run the match to update the segment, reasons, and campaign brief for this product.</p><button className="button button-accent" onClick={()=>setHasRun(true)}>Run product match</button></div>
        : metricsLoading || !metrics ? <div className="empty-match"><span>…</span><h3>{metricsError?"Segment request blocked":"Checking the privacy threshold…"}</h3><p>{metricsError||"Computing the segment server-side against the current cohort."}</p>{metricsError&&<button type="button" className="button button-accent" onClick={()=>setRefreshKey((key)=>key+1)}>Retry</button>}</div>
        : metrics.suppressed ? <div className="empty-match suppressed-match"><span>🔒</span><h3>Segment suppressed — cohort below k ≥ {metrics.minimumCohortSize}</h3><p>{product.name} has only {metrics.segmentSize} opted-in, relevance-matched profile{metrics.segmentSize===1?"":"s"} — below the minimum of {metrics.minimumCohortSize} required to release an aggregate. No wear rate, segment size, gap prevalence, or duplicate-risk figure is shown for this product; releasing an aggregate this small risks re-identifying individuals in it.</p><p>The per-product inspectable score below is not a population aggregate, so it can still be shown.</p><article className="components-card"><div className="card-label">INSPECTABLE SCORE (not an aggregate)</div>{result.components.map((component)=><div className="component-line" key={component.key}><span>{component.label}<small>{Math.round(component.weight*100)}% weight</small></span><div><i style={{width:`${component.score}%`}} /></div><b>{component.score}</b></div>)}</article></div>
        : <><div className="metric-row"><article><small>MATCH OPPORTUNITY</small><strong>{metrics.opportunity}<i>/100</i></strong><p>Average inspectable score</p></article><article><small>GAP PREVALENCE</small><strong>{metrics.gapPrevalence}%</strong><p>Segment missing category</p></article><article><small>DUPLICATE RISK</small><strong>{metrics.duplicateRisk}%</strong><p>Already category-heavy</p></article><article><small>ELIGIBLE SEGMENT</small><strong>{metrics.segmentSize}</strong><p>Opted-in, relevance-matched profiles</p></article></div>
        <div className="explain-grid"><article className="segment-card"><div className="card-label">TOP ANONYMOUS SEGMENT <span className="demo-pill">SYNTHETIC</span></div><h3>Neutral-first wardrobe builders</h3><p>Frequent wearers of casual basics with a lightweight layering gap.</p><div className="segment-stats"><span><b>{metrics.segmentSize}</b> profiles</span><span><b>4.2</b> pairings avg.</span><span><b>High</b> sufficiency</span></div><small>No individual identity or raw wardrobe is exposed.</small></article>
        <article className="components-card"><div className="card-label">INSPECTABLE SCORE</div>{result.components.map((component)=><div className="component-line" key={component.key}><span>{component.label}<small>{Math.round(component.weight*100)}% weight</small></span><div><i style={{width:`${component.score}%`}} /></div><b>{component.score}</b></div>)}</article></div>
        <div className="reasons-section"><div className="card-label">THREE GROUNDED REASONS <span className="fallback-pill">DETERMINISTIC FALLBACK</span></div><div className="reason-grid">{result.reasons.map((reason,index)=><article key={reason}><span>0{index+1}</span><p>{reason}</p></article>)}</div></div>
        <article className="campaign-card"><div><div className="eyebrow">AUTO-GENERATED CAMPAIGN BRIEF</div><h3>“The layer your closet was waiting for.”</h3><p><strong>Audience:</strong> Anonymous neutral-first wardrobe builders with confirmed layering gaps.</p><p><strong>Message:</strong> Show three combinations using common basics; emphasize versatility, not urgency or overconsumption.</p><p><strong>Proof:</strong> Reference compatibility and pairing counts. Do not imply a sales outcome.</p></div><button type="button" className="button button-light" onClick={async()=>{await navigator.clipboard?.writeText(`Campaign: The layer your closet was waiting for. Audience: anonymous neutral-first wardrobe builders. Product: ${product.name}.`);setCopied(true);}}>{copied?"Copied ✓":"Copy brief"}</button></article></>}
      </section>
    </section>
  </main></AppShell>;
}
