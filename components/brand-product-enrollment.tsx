"use client";

import { useEffect, useState } from "react";
import type { BrandProductRegistration, GarmentView } from "@/lib/platform-types";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";

const views:GarmentView[]=["front","back","label"];

export function BrandProductEnrollment({onProducts}:{onProducts?:(products:BrandProductRegistration[])=>void}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [progress,setProgress]=useState("");
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [form,setForm]=useState({name:"",aliases:"",sku:"",gtin:"",category:"",labelText:"",productUrl:"",affiliateUrl:"",price:"",currency:"USD",availability:"unknown",affiliateProvider:"",affiliateTrackingId:""});

  useEffect(()=>{fetch("/api/brand/products").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setProducts(data.products??[]);onProducts?.(data.products??[]);}).catch(reason=>setError(reason instanceof Error?reason.message:"Catalog could not be loaded."));},[onProducts]);

  async function submit(){
    setBusy(true);setError("");setStatus("");
    try {
      const body=new FormData();
      for(const [index,view] of views.entries()){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);setProgress(`Preparing ${view} photo ${index+1} of 3`);body.append(view,await prepareImageForUpload(file));}
      Object.entries(form).forEach(([key,value])=>body.append(key,value));
      setProgress("Registering the encrypted product evidence");
      const response=await fetch("/api/brand/products",{method:"POST",body});
      const data=await readJsonResponse<{error?:string;product:BrandProductRegistration}>(response,"The product service returned an unreadable response. Please retry.");
      if(!response.ok)throw new Error(data.error??"Registration failed.");
      const next=[data.product,...products];setProducts(next);onProducts?.(next);
      setStatus(`${data.product.name} is now enrolled under SKU ${data.product.sku}.`);
      setForm({name:"",aliases:"",sku:"",gtin:"",category:"",labelText:"",productUrl:"",affiliateUrl:"",price:"",currency:"USD",availability:"unknown",affiliateProvider:"",affiliateTrackingId:""});setFiles({});setOpen(false);
    } catch(reason){setError(reason instanceof Error?reason.message:"Registration failed.");} finally{setBusy(false);setProgress("");}
  }

  return <section className="registry-panel" id="products">
    <div className="registry-heading"><div><div className="eyebrow">YOUR PRODUCT REGISTRY</div><h2>Connect real products to actual wear.</h2><p>Enroll an authorized front, back, and label image with the SKU. Consumer scans can then connect to your product without exposing the consumer’s photo.</p></div><button type="button" className="button button-accent" onClick={()=>setOpen(value=>!value)}>{open?"Close enrollment":"+ Enroll product"}</button></div>
    {open&&<div className="registry-form">
      <div className="registry-fields">
        <label>Product name<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Product name"/></label>
        <label>SKU / MPN<input value={form.sku} onChange={event=>setForm({...form,sku:event.target.value})} placeholder="SKU-1001"/></label>
        <label>GTIN / UPC / EAN (optional)<input inputMode="numeric" value={form.gtin} onChange={event=>setForm({...form,gtin:event.target.value})}/></label>
        <label>Category<input value={form.category} onChange={event=>setForm({...form,category:event.target.value})} placeholder="outerwear"/></label>
        <label>Brand aliases<input value={form.aliases} onChange={event=>setForm({...form,aliases:event.target.value})} placeholder="Alternative label spellings"/></label>
        <label className="registry-wide">Approved label text<textarea value={form.labelText} onChange={event=>setForm({...form,labelText:event.target.value})} placeholder="Exact brand and SKU text visible on the label"/></label>
        <label>Product URL (optional)<input type="url" value={form.productUrl} onChange={event=>setForm({...form,productUrl:event.target.value})} placeholder="https://brand.example/product"/></label>
        <label>Affiliate URL (optional)<input type="url" value={form.affiliateUrl} onChange={event=>setForm({...form,affiliateUrl:event.target.value})} placeholder="https://retailer.example/tracked"/></label>
        <label>Price (optional)<input inputMode="decimal" value={form.price} onChange={event=>setForm({...form,price:event.target.value})} placeholder="89.00"/></label>
        <label>Currency<input value={form.currency} maxLength={3} onChange={event=>setForm({...form,currency:event.target.value})}/></label>
        <label>Availability<select value={form.availability} onChange={event=>setForm({...form,availability:event.target.value})}><option value="unknown">Unknown</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="discontinued">Discontinued</option></select></label>
        <label>Affiliate provider (optional)<input value={form.affiliateProvider} onChange={event=>setForm({...form,affiliateProvider:event.target.value})}/></label>
      </div>
      <div className="registry-uploads">{views.map(view=><label key={view}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file)setFiles(current=>({...current,[view]:file}));}}/><strong>{view}</strong><span>{files[view]?.name??"Choose authorized image"}</span></label>)}</div>
      {busy&&progress&&<div className="upload-progress" role="status"><span/><strong>{progress}</strong><small>Racked reduces mobile photo size before the AWS request.</small></div>}
      <div className="registry-actions"><button type="button" className="button button-dark" onClick={submit} disabled={busy||!form.name||!form.sku||!form.category||!form.labelText||views.some(view=>!files[view])}>{busy?"Preparing secure upload…":"Register product identity"}</button></div>
    </div>}
    {status&&<div className="agent-action-status" role="status">✓ {status}</div>}{error&&<div className="form-error" role="alert">{error}</div>}
    <div className="registry-list"><div><strong>{products.length}</strong><span>registered products</span></div>{products.slice(0,6).map(product=><article key={product.id}><span className="verified-registry">BRAND VERIFIED</span><strong>{product.name}</strong><code>{product.brand} · {product.sku}</code><small>{product.gtin?`GTIN ${product.gtin}`:"SKU + brand identity"}</small></article>)}</div>
  </section>;
}
