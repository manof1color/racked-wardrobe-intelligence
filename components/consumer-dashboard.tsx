"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { ConsumerAgentPanel } from "./agent-panels";
import { ThreeViewUploader } from "./three-view-uploader";
import { WardrobeAvatar } from "./wardrobe-avatar";
import { catalog, savedOutfits, wardrobe as seedWardrobe } from "@/lib/demo-data";
import { rankProducts } from "@/lib/matching";
import type { GarmentAnalysis } from "@/lib/platform-types";

type ConsumerView="home"|"avatar"|"closet";

export function ConsumerDashboard() {
  const [items,setItems]=useState(seedWardrobe);
  const [showAdd,setShowAdd]=useState(false);
  const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState("all");
  const [activeView,setActiveView]=useState<ConsumerView>("home");
  const [brandDataSharing,setBrandDataSharing]=useState(true);
  const ranked=useMemo(()=>rankProducts(catalog,items),[items]);
  const visible=filter==="all"?items:items.filter((item)=>item.category===filter);
  const mostWorn=[...items].sort((a,b)=>b.wearCount-a.wearCount)[0];
  const leastWorn=[...items].sort((a,b)=>a.wearCount-b.wearCount)[0];

  useEffect(()=>{fetch("/api/consumer/consent").then((response)=>response.json()).then((data)=>{if(typeof data.brandDataSharing==="boolean")setBrandDataSharing(data.brandDataSharing);}).catch(()=>{});},[]);
  async function toggleBrandDataSharing(){const next=!brandDataSharing;setBrandDataSharing(next);const response=await fetch("/api/consumer/consent",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({brandDataSharing:next})});if(!response.ok)setBrandDataSharing(!next);}

  async function recordWear(id:string){const response=await fetch("/api/wears",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemId:id})});const data=await response.json();if(!response.ok){setNotice(data.error??"Wear could not be recorded.");return;}setItems((current)=>current.map((item)=>item.id===id?{...item,wearCount:data.count,lastWornDays:0}:item));setNotice("Wear recorded by the backend. Insights and matches were recalculated.");}
  async function recordAvatarOutfit(itemIds:string[]){const response=await fetch("/api/wears",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemIds})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Outfit could not be recorded.");setItems((current)=>current.map((item)=>data.counts[item.id]!==undefined?{...item,wearCount:data.counts[item.id],lastWornDays:0}:item));setNotice(`Avatar look recorded across ${itemIds.length} owned pieces.`);}
  function confirmAnalysis(analysis:GarmentAnalysis){setItems((current)=>[{id:`w-${Date.now()}`,name:analysis.garment.name,category:analysis.garment.category,color:analysis.garment.color,style:analysis.garment.style,season:"fall",wearCount:0,lastWornDays:999,source:"ai-confirmed",art:"rust"},...current]);setShowAdd(false);setActiveView("closet");setNotice(analysis.label.matched?`${analysis.garment.name} connected to ${analysis.label.brand} (${analysis.label.sku}) and was added.`:`${analysis.garment.name} was added from a front-photo scan. Brand verification is still optional.`);}

  const tabs:Array<{id:ConsumerView;label:string;icon:string}>=[{id:"home",label:"Today",icon:"⌂"},{id:"avatar",label:"Avatar",icon:"◇"},{id:"closet",label:"Closet",icon:"▦"}];
  return <AppShell role="consumer"><main className="workspace consumer-workspace">
    <section className="workspace-heading"><div><div className="eyebrow">MONDAY, AUGUST 3 · FICTIONAL DATA</div><h1>Your wardrobe is<br/><em>working smarter.</em></h1><p>Good evening, Maya. Here is what your confirmed wear history says.</p></div><button className="button button-accent" onClick={()=>setShowAdd(true)}>+ Scan garment</button></section>
    <div className="privacy-banner"><span>◉</span><div><strong>Sharing wear data with brands</strong><p>When on, your (fictional) wear activity is one profile brands&rsquo; segment counts may include — still gated by the same k ≥ 25 threshold before any brand ever sees an aggregate. Turn off to exclude yourself from every product&rsquo;s cohort.</p></div><button type="button" className="button button-light" onClick={toggleBrandDataSharing}>{brandDataSharing?"ON — turn off":"OFF — turn on"}</button></div>
    <nav className="consumer-view-tabs" aria-label="Consumer app views">{tabs.map((tab)=><button key={tab.id} className={activeView===tab.id?"active":""} onClick={()=>setActiveView(tab.id)}><span>{tab.icon}</span>{tab.label}</button>)}</nav>
    {notice&&<div className="success-banner" role="status"><span>✓</span>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice("")}>×</button></div>}

    {activeView==="home"&&<><section className="insight-grid"><article className="insight-card dark"><div className="card-label">AI WARDROBE READOUT <span className="fallback-pill">DETERMINISTIC</span></div><h2>You rely on versatile neutrals. A warm lightweight layer unlocks the most new combinations.</h2><p>Grounded in {items.length} confirmed garments, 136 wear events, and 3 saved outfits.</p><div className="confidence"><span>DATA SUFFICIENCY</span><div><i style={{width:"88%"}}/></div><strong>HIGH</strong></div></article><article className="metric-card"><span className="metric-icon coral-bg">↗</span><small>MOST WORN</small><strong>{mostWorn.wearCount}</strong><p>{mostWorn.name}</p></article><article className="metric-card"><span className="metric-icon lilac-bg">↘</span><small>LEAST WORN</small><strong>{leastWorn.wearCount}</strong><p>{leastWorn.name}</p></article><article className="metric-card"><span className="metric-icon green-bg">◫</span><small>SAVED OUTFITS</small><strong>{savedOutfits.length}</strong><p>{savedOutfits.reduce((sum,outfit)=>sum+outfit.wears,0)} recorded wears</p></article></section>
      <ConsumerAgentPanel onWearRecorded={(counts)=>{setItems((current)=>current.map((item)=>counts[item.id]!==undefined?{...item,wearCount:counts[item.id],lastWornDays:0}:item));setNotice("Agent outfit recorded. Wardrobe counts and recommendations were recalculated.");}}/>
      <section className="section-block recommendation-block"><div className="section-title"><div><div className="eyebrow">EXPLAINABLE RECOMMENDATIONS</div><h2>Products that earn a place</h2></div><p className="section-note">Scores update from confirmed wardrobe data—not inferred identity.</p></div><div className="recommend-grid">{ranked.slice(0,3).map(({product,result},index)=><article className="recommend-card" key={product.id}><div className={`product-swatch ${product.art}`}><span>0{index+1}</span><b>{product.name}</b></div><div className="recommend-copy"><div className="score-bubble">{result.score}<small>FIT</small></div><small>{product.brand} · ${product.price}</small><h3>{result.reasons[0]}</h3><p>{result.reasons[1]}</p><div className="tag-row"><span>{result.confidence} confidence</span><span>fallback-ready</span></div></div></article>)}</div></section></>}

    {activeView==="avatar"&&<WardrobeAvatar items={items} onRecord={recordAvatarOutfit}/>}

    {activeView==="closet"&&<section className="section-block closet-view"><div className="section-title"><div><div className="eyebrow">YOUR DIGITAL RACK</div><h2>{items.length} confirmed pieces</h2></div><div className="filter-row" role="group" aria-label="Filter wardrobe">{["all","top","bottom","outerwear","shoe"].map((value)=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{value}</button>)}</div></div><div className="garment-grid">{visible.map((item)=><article className="garment-card" key={item.id}><div className={`garment-visual ${item.art}`}><span>{item.category}</span><button aria-label={`Record a wear for ${item.name}`} onClick={()=>recordWear(item.id)}>+ WEAR</button></div><div className="garment-info"><div><h3>{item.name}</h3><p>{item.color} · {item.style[0]}</p></div><span className="wear-count">{item.wearCount}<small>wears</small></span></div><div className="source-line"><span className={item.source==="ai-confirmed"?"confirmed":""}>{item.source==="ai-confirmed"?"✓ AI attributes confirmed":"Manual entry"}</span><small>{item.lastWornDays>100?"Not worn yet":`${item.lastWornDays}d ago`}</small></div></article>)}</div></section>}
  </main><nav className="mobile-tab-bar" aria-label="Mobile consumer navigation">{tabs.map((tab)=><button key={tab.id} className={activeView===tab.id?"active":""} onClick={()=>setActiveView(tab.id)}><span>{tab.icon}</span><small>{tab.label}</small></button>)}<button onClick={()=>setShowAdd(true)}><span>＋</span><small>Scan</small></button></nav>{showAdd&&<div className="modal-backdrop" role="presentation"><section className="modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" aria-label="Close" onClick={()=>setShowAdd(false)}>×</button><div className="eyebrow">FRONT-FIRST GARMENT INTAKE</div><h2 id="add-title">One photo to start.</h2><p>Use a front photo for fast wardrobe tracking. Add the label when you want a verified brand and SKU match; the back remains available for stronger construction evidence.</p><ThreeViewUploader onConfirmed={confirmAnalysis}/></section></div>}</AppShell>;
}
