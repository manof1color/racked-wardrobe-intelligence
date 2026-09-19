"use client";

import { useEffect, useState } from "react";
import type { BrandProductRegistration, GarmentView } from "@/lib/platform-types";
import { GARMENT_TAXONOMY, garmentSubtypeLabel, type GarmentCategory, type GarmentSubtype } from "@/lib/garment-taxonomy";
import type { ProductDescriptionSuggestion } from "@/lib/product-description";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";

const optionalViews:Exclude<GarmentView,"front">[]=["back","label"];
const categories:GarmentCategory[]=(Object.keys(GARMENT_TAXONOMY) as GarmentCategory[]).filter(category=>category!=="unknown");
const emptyForm={name:"",aliases:"",sku:"",gtin:"",category:"",subtype:"",color:"",pattern:"",material:"",style:"",labelText:"",productUrl:"",affiliateUrl:"",price:"",currency:"USD",availability:"unknown",affiliateProvider:"",affiliateTrackingId:""};

/**
 * One product at a time, from one photo. The brand adds a product photo and its SKU; Racked can read
 * the photo and fill in the name, category, type, colour, pattern, and material, which the brand
 * checks before enrolling. Those details are what let a consumer's scan recognise the product
 * without its care label. Identity itself still comes only from the SKU and GTIN typed here.
 */
export function BrandProductEnrollment({onProducts}:{onProducts?:(products:BrandProductRegistration[])=>void}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [reading,setReading]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [readNote,setReadNote]=useState("");
  const [progress,setProgress]=useState("");
  const [products,setProducts]=useState<BrandProductRegistration[]>([]);
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [morePhotos,setMorePhotos]=useState(false);
  const [form,setForm]=useState(emptyForm);

  useEffect(()=>{fetch("/api/brand/products").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setProducts(data.products??[]);onProducts?.(data.products??[]);}).catch(reason=>setError(reason instanceof Error?reason.message:"Catalog could not be loaded."));},[onProducts]);

  const category=categories.includes(form.category as GarmentCategory)?form.category as GarmentCategory:null;
  const types:readonly string[]=category?GARMENT_TAXONOMY[category].filter((subtype:string)=>!subtype.startsWith("other-")):[];

  async function readPhoto(){
    const front=files.front;
    if(!front)return;
    setReading(true);setError("");setReadNote("");
    try {
      const body=new FormData();
      body.append("front",await prepareImageForUpload(front));
      const response=await fetch("/api/brand/products/describe",{method:"POST",body});
      const data=await readJsonResponse<{error?:string;message?:string;suggestion?:ProductDescriptionSuggestion|null}>(response,"The photo reader returned an unreadable response.");
      if(!response.ok)throw new Error(data.error??"The photo could not be read.");
      const suggestion=data.suggestion;
      if(suggestion){
        // Only empty fields are filled: anything the brand already typed is theirs and stays.
        setForm(current=>({
          ...current,
          name:current.name||suggestion.name,
          category:current.category||suggestion.category,
          subtype:current.subtype||(suggestion.subtype??""),
          color:current.color||(suggestion.color??""),
          pattern:current.pattern||(suggestion.pattern??""),
          material:current.material||(suggestion.material??""),
          style:current.style||suggestion.style.join(", "),
        }));
      }
      setReadNote(`${data.message??""}${suggestion&&suggestion.piecesInPhoto>1?` The photo showed ${suggestion.piecesInPhoto} pieces; the largest was described.`:""}`);
    } catch(reason){setError(reason instanceof Error?reason.message:"The photo could not be read.");} finally{setReading(false);}
  }

  async function submit(){
    setBusy(true);setError("");setStatus("");
    try {
      const body=new FormData();
      const chosen=(["front",...optionalViews] as GarmentView[]).filter(view=>files[view]);
      if(!files.front)throw new Error("Add a product photo.");
      for(const [index,view] of chosen.entries()){setProgress(`Preparing photo ${index+1} of ${chosen.length}`);body.append(view,await prepareImageForUpload(files[view]!));}
      Object.entries(form).forEach(([key,value])=>body.append(key,value));
      setProgress("Enrolling the product");
      const response=await fetch("/api/brand/products",{method:"POST",body});
      const data=await readJsonResponse<{error?:string;product:BrandProductRegistration}>(response,"The product service returned an unreadable response. Please retry.");
      if(!response.ok)throw new Error(data.error??"Registration failed.");
      const next=[data.product,...products];setProducts(next);onProducts?.(next);
      setStatus(`${data.product.name} is now enrolled under SKU ${data.product.sku}.`);
      setForm(emptyForm);setFiles({});setReadNote("");setMorePhotos(false);setOpen(false);
    } catch(reason){setError(reason instanceof Error?reason.message:"Registration failed.");} finally{setBusy(false);setProgress("");}
  }

  const field=(key:keyof typeof emptyForm)=>({value:form[key],onChange:(event:{target:{value:string}})=>setForm(current=>({...current,[key]:event.target.value}))});

  return <section className="registry-panel" id="products">
    <div className="registry-heading"><div><div className="eyebrow">YOUR PRODUCT REGISTRY · ONE PRODUCT AT A TIME</div><h2>Connect real products to actual wear.</h2><p>Add one product photo and its SKU. Racked can read the photo and fill in the rest, and those details let a customer&rsquo;s scan recognise the product even when its care label is gone. No catalog system or CSV is required.</p></div><button type="button" className="button button-accent" onClick={()=>setOpen(value=>!value)}>{open?"Close enrollment":"+ Enroll one product"}</button></div>
    {open&&<div className="registry-form">
      <div className="registry-photo">
        <label className="registry-photo-main"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file){setFiles(current=>({...current,front:file}));setReadNote("");}}}/><strong>Product photo</strong><span>{files.front?.name??"Choose a clear photo of the product"}</span></label>
        <button type="button" className="button button-light button-small" disabled={!files.front||reading||busy} onClick={()=>void readPhoto()}>{reading?"Reading the photo…":"Fill in from photo"}</button>
        {readNote&&<p className="registry-read-note" role="status">{readNote}</p>}
      </div>
      <div className="registry-fields">
        <label>Product name<input {...field("name")} placeholder="Product name"/></label>
        <label>SKU / style code<input {...field("sku")} placeholder="SKU-1001"/></label>
        <label>GTIN / UPC / EAN (optional)<input inputMode="numeric" {...field("gtin")}/></label>
        <label>Category<select value={form.category} onChange={event=>setForm(current=>({...current,category:event.target.value,subtype:""}))}><option value="">Choose a category</option>{categories.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
        <label>Type<select value={form.subtype} disabled={!category} onChange={event=>setForm(current=>({...current,subtype:event.target.value}))}><option value="">{category?"Choose a type":"Choose a category first"}</option>{types.map(subtype=><option key={subtype} value={subtype}>{garmentSubtypeLabel(subtype as GarmentSubtype)}</option>)}</select></label>
        <label>Colour<input {...field("color")} placeholder="navy"/></label>
        <label>Pattern<input {...field("pattern")} placeholder="solid"/></label>
        <label>Material<input {...field("material")} placeholder="cotton"/></label>
        <label>Style (optional)<input {...field("style")} placeholder="minimal, workwear"/></label>
        <label>Brand aliases<input {...field("aliases")} placeholder="Other spellings of your brand name"/></label>
        <label className="registry-wide">Label text (optional)<textarea {...field("labelText")} placeholder="Text printed on the care label, for your own records"/></label>
        <label>Product URL (optional)<input type="url" {...field("productUrl")} placeholder="https://brand.example/product"/></label>
        <label>Affiliate URL (optional)<input type="url" {...field("affiliateUrl")} placeholder="https://retailer.example/tracked"/></label>
        <label>Price (optional)<input inputMode="decimal" {...field("price")} placeholder="89.00"/></label>
        <label>Currency<input maxLength={3} {...field("currency")}/></label>
        <label>Availability<select value={form.availability} onChange={event=>setForm(current=>({...current,availability:event.target.value}))}><option value="unknown">Unknown</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="discontinued">Discontinued</option></select></label>
        <label>Affiliate provider (optional)<input {...field("affiliateProvider")}/></label>
      </div>
      <button type="button" className="intake-link-toggle" aria-expanded={morePhotos} onClick={()=>setMorePhotos(value=>!value)}>{morePhotos?"▾":"▸"} Back and label photos <span>Optional</span></button>
      {morePhotos&&<div className="registry-uploads">{optionalViews.map(view=><label key={view}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];if(file)setFiles(current=>({...current,[view]:file}));}}/><strong>{view}</strong><span>{files[view]?.name??"Optional"}</span></label>)}</div>}
      {busy&&progress&&<div className="upload-progress" role="status"><span/><strong>{progress}</strong><small>Racked reduces mobile photo size before the AWS request.</small></div>}
      <div className="registry-actions"><button type="button" className="button button-dark" onClick={submit} disabled={busy||reading||!form.name||!form.sku||!category||!files.front}>{busy?"Enrolling…":"Enroll product"}</button></div>
    </div>}
    {status&&<div className="agent-action-status" role="status">✓ {status}</div>}{error&&<div className="form-error" role="alert">{error}</div>}
    <div className="registry-list"><div><strong>{products.length}</strong><span>enrolled products</span></div>{products.slice(0,6).map(product=><article key={product.id}><span className="verified-registry">ENROLLED</span><strong>{product.name}</strong><code>{product.brand} · {product.sku}</code><small>{product.gtin?`GTIN ${product.gtin}`:"SKU + brand identity"}</small></article>)}</div>
  </section>;
}
