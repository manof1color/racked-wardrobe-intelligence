"use client";
import { useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { catalog, savedOutfits, wardrobe as seedWardrobe } from "@/lib/demo-data";
import { rankProducts } from "@/lib/matching";
import type { WardrobeItem } from "@/lib/types";

export function ConsumerDashboard() {
  const [items,setItems] = useState(seedWardrobe);
  const [showAdd,setShowAdd] = useState(false);
  const [aiReady,setAiReady] = useState(false);
  const [notice,setNotice] = useState("");
  const [filter,setFilter] = useState("all");
  const ranked = useMemo(() => rankProducts(catalog,items),[items]);
  const visible = filter === "all" ? items : items.filter((item) => item.category === filter);
  const mostWorn = [...items].sort((a,b) => b.wearCount-a.wearCount)[0];
  const leastWorn = [...items].sort((a,b) => a.wearCount-b.wearCount)[0];

  function recordWear(id:string) {
    setItems((current) => current.map((item) => item.id === id ? {...item,wearCount:item.wearCount+1,lastWornDays:0}:item));
    setNotice("Wear recorded. Your insights and matches were recalculated.");
  }
  function addConfirmedItem(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item: WardrobeItem = { id:`w${Date.now()}`, name:String(form.get("name") || "Rust cotton overshirt"), category:String(form.get("category") || "outerwear"), color:String(form.get("color") || "rust"), style:["casual","minimal"], season:"fall", wearCount:0,lastWornDays:999,source:"ai-confirmed",art:"rust" };
    setItems((current) => [item,...current]); setShowAdd(false); setAiReady(false); setNotice("Garment confirmed and added. No image is retained in this demo.");
  }
  return <AppShell role="consumer">
    <main className="workspace">
      <section className="workspace-heading"><div><div className="eyebrow">MONDAY, AUGUST 3 · FICTIONAL DATA</div><h1>Your wardrobe is<br /><em>working smarter.</em></h1><p>Good evening, Maya. Here’s what your confirmed wear history says.</p></div><button className="button button-accent" onClick={() => setShowAdd(true)}>+ Add a garment</button></section>
      {notice && <div className="success-banner" role="status"><span>✓</span>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      <section className="insight-grid">
        <article className="insight-card dark"><div className="card-label">AI WARDROBE READOUT <span className="fallback-pill">DETERMINISTIC</span></div><h2>You rely on versatile neutrals. A warm lightweight layer unlocks the most new combinations.</h2><p>Grounded in 12 confirmed garments, 136 wear events, and 3 saved outfits.</p><div className="confidence"><span>DATA SUFFICIENCY</span><div><i style={{width:"88%"}} /></div><strong>HIGH</strong></div></article>
        <article className="metric-card"><span className="metric-icon coral-bg">↗</span><small>MOST WORN</small><strong>{mostWorn.wearCount}</strong><p>{mostWorn.name}</p></article>
        <article className="metric-card"><span className="metric-icon lilac-bg">↘</span><small>LEAST WORN</small><strong>{leastWorn.wearCount}</strong><p>{leastWorn.name}</p></article>
        <article className="metric-card"><span className="metric-icon green-bg">◫</span><small>SAVED OUTFITS</small><strong>{savedOutfits.length}</strong><p>{savedOutfits.reduce((sum,outfit)=>sum+outfit.wears,0)} recorded wears</p></article>
      </section>
      <section className="section-block">
        <div className="section-title"><div><div className="eyebrow">YOUR DIGITAL RACK</div><h2>{items.length} confirmed pieces</h2></div><div className="filter-row" role="group" aria-label="Filter wardrobe">{["all","top","bottom","outerwear","shoe"].map((value)=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{value}</button>)}</div></div>
        <div className="garment-grid">{visible.map((item)=><article className="garment-card" key={item.id}><div className={`garment-visual ${item.art}`}><span>{item.category}</span><button aria-label={`Record a wear for ${item.name}`} onClick={()=>recordWear(item.id)}>+ WEAR</button></div><div className="garment-info"><div><h3>{item.name}</h3><p>{item.color} · {item.style[0]}</p></div><span className="wear-count">{item.wearCount}<small>wears</small></span></div><div className="source-line"><span className={item.source === "ai-confirmed" ? "confirmed" : ""}>{item.source === "ai-confirmed" ? "✓ AI attributes confirmed" : "Manual entry"}</span><small>{item.lastWornDays > 100 ? "Not worn yet" : `${item.lastWornDays}d ago`}</small></div></article>)}</div>
      </section>
      <section className="section-block recommendation-block"><div className="section-title"><div><div className="eyebrow">EXPLAINABLE RECOMMENDATIONS</div><h2>Products that earn a place</h2></div><p className="section-note">Scores update from confirmed wardrobe data—not inferred identity.</p></div><div className="recommend-grid">{ranked.slice(0,3).map(({product,result},index)=><article className="recommend-card" key={product.id}><div className={`product-swatch ${product.art}`}><span>0{index+1}</span><b>{product.name}</b></div><div className="recommend-copy"><div className="score-bubble">{result.score}<small>FIT</small></div><small>{product.brand} · ${product.price}</small><h3>{result.reasons[0]}</h3><p>{result.reasons[1]}</p><div className="tag-row"><span>{result.confidence} confidence</span><span>fallback-ready</span></div></div></article>)}</div></section>
    </main>
    {showAdd && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" aria-label="Close" onClick={()=>{setShowAdd(false);setAiReady(false);}}>×</button><div className="eyebrow">GARMENT INTAKE</div><h2 id="add-title">Add one useful piece.</h2><p>Upload an image or enter details manually. In this demo the image is analyzed in-browser and immediately discarded.</p>{!aiReady ? <div className="upload-zone"><input id="garment-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const file=event.target.files?.[0];if(file && file.size<=5_000_000)setAiReady(true);else if(file)setNotice("Upload must be a JPG, PNG, or WebP under 5 MB.");}}/><label htmlFor="garment-image"><strong>Choose a garment image</strong><span>JPG, PNG, or WebP · 5 MB maximum</span></label><button className="text-button" onClick={()=>setAiReady(true)}>Use simulated extraction instead</button></div> : <form onSubmit={addConfirmedItem} className="attribute-form"><div className="ai-notice"><span>AI SUGGESTION</span> Confirm or correct every field before saving.</div><label>Garment name<input name="name" defaultValue="Rust cotton overshirt" required /></label><div className="form-grid"><label>Category<select name="category" defaultValue="outerwear"><option>outerwear</option><option>top</option><option>bottom</option><option>dress</option><option>shoe</option></select></label><label>Color<input name="color" defaultValue="rust" required /></label></div><label className="consent-row compact"><input type="checkbox" required /><span><strong>I confirm these attributes are accurate.</strong><small>Inferred fields are never saved without this confirmation.</small></span></label><button className="button button-accent button-full" type="submit">Confirm & add garment</button></form>}</section></div>}
  </AppShell>;
}
