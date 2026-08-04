"use client";

import { useEffect, useState } from "react";
import type { BrandProductRegistration, GarmentView } from "@/lib/platform-types";

const views:GarmentView[]=["front","back","label"];
const fixtures:Record<GarmentView,string>={front:"/test-uploads/northstar-overshirt-front.png",back:"/test-uploads/northstar-overshirt-back.png",label:"/test-uploads/northstar-overshirt-label.png"};

export function BrandProductEnrollment() {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [form,setForm]=useState({name:"Sienna Soft Overshirt",brand:"Northstar Atelier",aliases:"Northstar",sku:"NA-OW-1042",gtin:"",category:"outerwear",labelText:"NORTHSTAR ATELIER NA-OW-1042 100% COTTON"});

  useEffect(()=>{fetch("/api/brand/products").then((response)=>response.json()).then((data)=>setProducts(data.products??[])).catch(()=>setError("Registry could not be loaded."));},[]);
  async function loadFixture(){setBusy(true);setError("");try{const loaded=await Promise.all(views.map(async(view)=>{const response=await fetch(fixtures[view]);const blob=await response.blob();return [view,new File([blob],fixtures[view].split("/").pop()!,{type:blob.type})] as const;}));setFiles(Object.fromEntries(loaded));setStatus("Sample front, back, and label images loaded.");}catch{setError("Sample registration images could not be loaded.");}finally{setBusy(false);}}
  async function submit(){setBusy(true);setError("");setStatus("");try{const body=new FormData();for(const view of views){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);body.append(view,file);}Object.entries(form).forEach(([key,value])=>body.append(key,value));const response=await fetch("/api/brand/products",{method:"POST",body});const data=await response.json();if(!response.ok)throw new Error(data.error??"Registration failed.");setProducts((current)=>[data.product,...current.filter((item)=>!(item.brandSlug===data.product.brandSlug&&item.sku===data.product.sku))]);setStatus(`${data.product.name} is enrolled. Future uploads can match its image hashes or label identity.`);}catch(reason){setError(reason instanceof Error?reason.message:"Registration failed.");}finally{setBusy(false);}}

  return <section className="registry-panel">
    <div className="registry-heading"><div><div className="eyebrow">BRAND-AUTHORITATIVE PRODUCT REGISTRY</div><h2>Enroll products before consumers scan them.</h2><p>The brand supplies front, back, label, SKU/MPN, optional GTIN, and approved aliases. Racked stores exact hashes for traceability.</p></div><button type="button" className="button button-accent" onClick={()=>setOpen((value)=>!value)}>{open?"Close enrollment":"+ Enroll three-view product"}</button></div>
    {open&&<div className="registry-form"><div className="registry-fields"><label>Product name<input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})}/></label><label>Verified brand<input value={form.brand} readOnly/><small>Bound to the signed-in brand account.</small></label><label>SKU / MPN<input value={form.sku} onChange={(event)=>setForm({...form,sku:event.target.value})}/></label><label>GTIN / UPC / EAN (optional)<input inputMode="numeric" value={form.gtin} onChange={(event)=>setForm({...form,gtin:event.target.value})}/></label><label>Category<input value={form.category} onChange={(event)=>setForm({...form,category:event.target.value})}/></label><label>Label aliases<input value={form.aliases} onChange={(event)=>setForm({...form,aliases:event.target.value})}/></label><label className="registry-wide">Approved label text<textarea value={form.labelText} onChange={(event)=>setForm({...form,labelText:event.target.value})}/></label></div><div className="registry-uploads">{views.map((view)=><label key={view}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const file=event.target.files?.[0];if(file)setFiles((current)=>({...current,[view]:file}));}}/><strong>{view}</strong><span>{files[view]?.name??"Choose image"}</span></label>)}</div><div className="registry-actions"><button type="button" className="fixture-button" onClick={loadFixture} disabled={busy}>Load sample set</button><button type="button" className="button button-dark" onClick={submit} disabled={busy||views.some((view)=>!files[view])}>{busy?"Hashing and registering…":"Register product identity"}</button></div></div>}
    {status&&<div className="agent-action-status" role="status">✓ {status}</div>}{error&&<div className="form-error" role="alert">{error}</div>}
    <div className="registry-list"><div><strong>{products.length}</strong><span>registered products</span></div>{products.slice(0,4).map((product)=><article key={product.id}><span className={product.source==="brand-enrolled"?"verified-registry":"seed-registry"}>{product.source==="brand-enrolled"?"HASH VERIFIED":"SEED"}</span><strong>{product.name}</strong><code>{product.brand} · {product.sku}</code><small>{product.gtin?`GTIN ${product.gtin}`:"SKU + brand identity"}</small></article>)}</div>
  </section>;
}
