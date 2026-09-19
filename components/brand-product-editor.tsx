"use client";

import { useState } from "react";
import { GARMENT_TAXONOMY, garmentSubtypeLabel, type GarmentCategory, type GarmentSubtype } from "@/lib/garment-taxonomy";
import type { BrandProductRegistration } from "@/lib/platform-types";
import { readJsonResponse } from "@/lib/upload-client";

const categories:GarmentCategory[]=(Object.keys(GARMENT_TAXONOMY) as GarmentCategory[]).filter(category=>category!=="unknown");

/**
 * Correcting an enrolled product, and retiring one.
 *
 * A price moves, a link changes, a name has a typo — before this, none of it could be fixed, and
 * the only way out of a wrong record was to leave it there. What identifies the product is not
 * here: the brand, its style code, and its barcode are what consumers' labels match against, so
 * editing them would move existing links to a different product. Retiring is the honest ending:
 * owners keep their piece and their wear history, and the product stops answering new links.
 */
export function BrandProductEditor({product,onSaved,onClose}:{product:BrandProductRegistration;onSaved:(product:BrandProductRegistration)=>void;onClose:()=>void}) {
  const [form,setForm]=useState({
    name:product.name,
    category:product.category,
    subtype:product.subtype??"",
    color:product.color??"",
    pattern:product.pattern??"",
    material:product.material??"",
    style:(product.style??[]).join(", "),
    price:product.price===undefined?"":String(product.price),
    currency:product.currency??"USD",
    availability:String(product.availability??"unknown"),
    productUrl:product.productUrl??"",
    affiliateUrl:product.affiliateUrl??"",
  });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [confirmRetire,setConfirmRetire]=useState(false);

  const category=categories.includes(form.category as GarmentCategory)?form.category as GarmentCategory:null;
  const types:readonly string[]=category?GARMENT_TAXONOMY[category].filter((subtype:string)=>!subtype.startsWith("other-")):[];
  const field=(key:keyof typeof form)=>({value:form[key],onChange:(event:{target:{value:string}})=>setForm(current=>({...current,[key]:event.target.value}))});

  async function send(changes:Record<string,unknown>,note:string){
    setBusy(true);setError("");setStatus("");
    try{
      const response=await fetch(`/api/brand/products/${encodeURIComponent(product.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(changes)});
      const data=await readJsonResponse<{error?:string;product:BrandProductRegistration}>(response,"The product service returned an unreadable response.");
      if(!response.ok)throw new Error(data.error??"The product could not be updated.");
      onSaved(data.product);
      setStatus(note);
    }catch(reason){setError(reason instanceof Error?reason.message:"The product could not be updated.");}
    finally{setBusy(false);}
  }

  return <form className="product-editor" onSubmit={event=>{event.preventDefault();void send({...form,price:form.price===""?null:form.price},"Saved.");}}>
    <div className="product-editor-head">
      <div><div className="eyebrow">EDIT PRODUCT</div><h3>{product.name}</h3><small>{product.brand} · {product.sku}{product.gtin?` · GTIN ${product.gtin}`:""} — these identify the product and cannot change.</small></div>
      <button type="button" className="modal-close" aria-label="Close editing" onClick={onClose}>×</button>
    </div>
    <div className="registry-fields">
      <label>Product name<input {...field("name")} maxLength={120}/></label>
      <label>Category<select value={form.category} onChange={event=>setForm(current=>({...current,category:event.target.value,subtype:""}))}>{categories.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
      <label>Type<select value={form.subtype} disabled={!category} onChange={event=>setForm(current=>({...current,subtype:event.target.value}))}><option value="">No specific type</option>{types.map(subtype=><option key={subtype} value={subtype}>{garmentSubtypeLabel(subtype as GarmentSubtype)}</option>)}</select></label>
      <label>Colour<input {...field("color")} maxLength={40}/></label>
      <label>Pattern<input {...field("pattern")} maxLength={40}/></label>
      <label>Material<input {...field("material")} maxLength={40}/></label>
      <label>Style<input {...field("style")} maxLength={150} placeholder="minimal, workwear"/></label>
      <label>Price<input inputMode="decimal" {...field("price")} placeholder="Leave empty to remove"/></label>
      <label>Currency<input maxLength={3} {...field("currency")}/></label>
      <label>Availability<select value={form.availability} onChange={event=>setForm(current=>({...current,availability:event.target.value}))}><option value="unknown">Unknown</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="discontinued">Discontinued</option></select></label>
      <label className="registry-wide">Product URL<input type="url" {...field("productUrl")} placeholder="https://brand.example/product"/></label>
      <label className="registry-wide">Affiliate URL<input type="url" {...field("affiliateUrl")} placeholder="https://retailer.example/tracked"/></label>
    </div>
    {status&&<div className="agent-action-status" role="status">✓ {status}</div>}
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="product-editor-actions">
      <button type="submit" className="button button-dark" disabled={busy}>{busy?"Saving…":"Save changes"}</button>
      {product.archived
        ? <button type="button" className="button button-light" disabled={busy} onClick={()=>void send({archived:false},"Back in your catalog.")}>Restore to catalog</button>
        : <button type="button" className={confirmRetire?"button button-danger":"button button-light"} disabled={busy}
            onClick={()=>{if(!confirmRetire){setConfirmRetire(true);return;}void send({archived:true},"Retired. Owners keep their piece and its history.");}}>
            {confirmRetire?"Confirm retire":"Retire product"}
          </button>}
    </div>
    {confirmRetire&&!product.archived&&<p className="product-editor-note">Retiring stops this product answering new label checks, searches, and suggestions, and removes it from your public page. Everyone who already owns it keeps their piece, and its recorded wear stays exactly as it is.</p>}
  </form>;
}
