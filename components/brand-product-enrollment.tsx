"use client";

import { useState } from "react";
import type { BrandProductRegistration } from "@/lib/platform-types";
import { GARMENT_TAXONOMY, garmentSubtypeLabel, type GarmentCategory, type GarmentSubtype } from "@/lib/garment-taxonomy";
import { draftBlockers, draftReady, duplicateSkusInBatch, enrollmentSummary, MAX_ENROLL_DRAFTS, planEnrollmentBatch } from "@/lib/brand-enrollment-batch";
import type { ProductDescriptionSuggestion } from "@/lib/product-description";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";
import { PhotoSourcePicker } from "./photo-source-picker";

const categories:GarmentCategory[]=(Object.keys(GARMENT_TAXONOMY) as GarmentCategory[]).filter(category=>category!=="unknown");
const emptyForm={name:"",aliases:"",sku:"",gtin:"",category:"",subtype:"",color:"",pattern:"",material:"",style:"",labelText:"",productUrl:"",affiliateUrl:"",price:"",currency:"USD",availability:"unknown",affiliateProvider:"",affiliateTrackingId:""};
type DraftForm=typeof emptyForm;

interface Draft {
  id:string;
  file:File;
  fileName:string;
  form:DraftForm;
  state:"waiting"|"reading"|"ready"|"enrolling"|"enrolled"|"failed";
  note:string;
  expanded:boolean;
}

/**
 * One photo per product, several products at a time.
 *
 * A brand photographing its range takes one picture per product, so the enrollment form used to be
 * walked once per photo. Now the library door opens on several photos and each becomes a draft:
 * recognition proposes the name, category, type, colour, pattern, and material, the brand supplies
 * what only it knows — the style code — and the drafts are enrolled one after another.
 *
 * Identity is still the brand's alone. Recognition never invents a SKU or a GTIN, a draft cannot be
 * enrolled without a style code, and two drafts carrying the same one are caught before the registry
 * has to refuse them. A draft the registry does refuse stays on screen with the reason, so nothing
 * is lost to a typo in the tenth field of the third card.
 */
export function BrandProductEnrollment({products,onProducts}:{products:BrandProductRegistration[];onProducts:(products:BrandProductRegistration[])=>void}) {
  const [open,setOpen]=useState(false);
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [skippedPhotos,setSkippedPhotos]=useState(0);

  const duplicates=duplicateSkusInBatch(drafts.map(draft=>draft.form));
  const pending=drafts.filter(draft=>draft.state!=="enrolled");
  const readyCount=pending.filter(draft=>draftReady(draft.form)).length;

  function updateDraft(id:string,change:(draft:Draft)=>Draft){setDrafts(current=>current.map(draft=>draft.id===id?change(draft):draft));}

  function chooseFiles(files:File[]){
    const plan=planEnrollmentBatch(files);
    setSkippedPhotos(plan.skipped);
    setError("");setStatus("");
    const next:Draft[]=plan.accepted.map((file,index)=>({id:`${Date.now()}-${index}`,file,fileName:file.name,form:{...emptyForm},state:"waiting",note:"",expanded:false}));
    setDrafts(next);
    void readPhotos(next);
  }

  /** Recognition runs once per photo, in order; a photo it cannot read leaves a draft to fill in by hand. */
  async function readPhotos(batch:Draft[]){
    setBusy(true);
    try{
      for(const [index,draft] of batch.entries()){
        setProgress(batch.length===1?"Reading your photo":`Reading photo ${index+1} of ${batch.length}`);
        updateDraft(draft.id,current=>({...current,state:"reading"}));
        try{
          const body=new FormData();
          body.append("front",await prepareImageForUpload(draft.file));
          const response=await fetch("/api/brand/products/describe",{method:"POST",body});
          const data=await readJsonResponse<{error?:string;message?:string;suggestion?:ProductDescriptionSuggestion|null}>(response,"The photo reader returned an unreadable response.");
          if(!response.ok)throw new Error(data.error??"The photo could not be read.");
          const suggestion=data.suggestion;
          updateDraft(draft.id,current=>({
            ...current,
            state:"ready",
            note:suggestion?"Filled in from your photo — check every field.":"Racked couldn't make out the product. Fill this one in yourself.",
            form:suggestion?{
              ...current.form,
              name:current.form.name||suggestion.name,
              category:current.form.category||suggestion.category,
              subtype:current.form.subtype||(suggestion.subtype??""),
              color:current.form.color||(suggestion.color??""),
              pattern:current.form.pattern||(suggestion.pattern??""),
              material:current.form.material||(suggestion.material??""),
              style:current.form.style||suggestion.style.join(", "),
            }:current.form,
          }));
        }catch(reason){
          updateDraft(draft.id,current=>({...current,state:"ready",note:reason instanceof Error?`${reason.message} Fill this one in yourself.`:"Fill this one in yourself."}));
        }
      }
    }finally{setBusy(false);setProgress("");}
  }

  /** Enrolled one at a time: a draft the registry refuses stays on screen with the reason. */
  async function enrolAll(){
    if(duplicates.length){setError(`Two drafts share the style code ${duplicates[0]}. Style codes identify a product, so each needs its own.`);return;}
    setBusy(true);setError("");setStatus("");
    const enrolled:BrandProductRegistration[]=[];
    let failed=0;
    try{
      const queue=drafts.filter(draft=>draft.state!=="enrolled"&&draftReady(draft.form));
      for(const [index,draft] of queue.entries()){
        setProgress(`Enrolling ${index+1} of ${queue.length}`);
        updateDraft(draft.id,current=>({...current,state:"enrolling",note:""}));
        try{
          const body=new FormData();
          body.append("front",await prepareImageForUpload(draft.file));
          Object.entries(draft.form).forEach(([key,value])=>body.append(key,value));
          const response=await fetch("/api/brand/products",{method:"POST",body});
          const data=await readJsonResponse<{error?:string;product:BrandProductRegistration}>(response,"The product service returned an unreadable response. Please retry.");
          if(!response.ok)throw new Error(data.error??"Registration failed.");
          enrolled.push(data.product);
          updateDraft(draft.id,current=>({...current,state:"enrolled",note:`Enrolled under ${data.product.sku}.`}));
        }catch(reason){
          failed++;
          updateDraft(draft.id,current=>({...current,state:"failed",note:reason instanceof Error?reason.message:"Registration failed."}));
        }
      }
      if(enrolled.length)onProducts([...enrolled,...products]);
      setStatus(enrollmentSummary({total:queue.length,enrolled:enrolled.length,failed,skippedPhotos}));
      setSkippedPhotos(0);
      if(enrolled.length&&!failed){setDrafts([]);setOpen(false);}
      else setDrafts(current=>current.filter(draft=>draft.state!=="enrolled"));
    }finally{setBusy(false);setProgress("");}
  }

  const field=(draft:Draft,key:keyof DraftForm)=>({
    value:draft.form[key],
    onChange:(event:{target:{value:string}})=>updateDraft(draft.id,current=>({...current,form:{...current.form,[key]:event.target.value}})),
  });

  function draftCard(draft:Draft){
    const category=categories.includes(draft.form.category as GarmentCategory)?draft.form.category as GarmentCategory:null;
    const types:readonly string[]=category?GARMENT_TAXONOMY[category].filter((subtype:string)=>!subtype.startsWith("other-")):[];
    const blockers=draftBlockers(draft.form);
    return <article className={`enroll-draft ${draft.state}`} key={draft.id}>
      <header>
        <div><strong>{draft.form.name||draft.fileName}</strong><small>{draft.fileName}</small></div>
        <button type="button" className="back-link" onClick={()=>setDrafts(current=>current.filter(entry=>entry.id!==draft.id))} disabled={busy}>Remove</button>
      </header>
      {draft.state==="reading"&&<p className="catalog-note" role="status">Reading this photo…</p>}
      {draft.note&&<p className={draft.state==="failed"?"form-error":"catalog-note"} role={draft.state==="failed"?"alert":undefined}>{draft.note}</p>}
      <div className="registry-fields">
        <label>Product name<input {...field(draft,"name")} placeholder="Product name"/></label>
        <label>SKU / style code<input {...field(draft,"sku")} placeholder="SKU-1001"/></label>
        <label>Category<select value={draft.form.category} onChange={event=>updateDraft(draft.id,current=>({...current,form:{...current.form,category:event.target.value,subtype:""}}))}><option value="">Choose a category</option>{categories.map(option=><option key={option} value={option}>{option}</option>)}</select></label>
        <label>Type<select value={draft.form.subtype} disabled={!category} onChange={event=>updateDraft(draft.id,current=>({...current,form:{...current.form,subtype:event.target.value}}))}><option value="">{category?"Choose a type":"Choose a category first"}</option>{types.map(subtype=><option key={subtype} value={subtype}>{garmentSubtypeLabel(subtype as GarmentSubtype)}</option>)}</select></label>
        <label>Colour<input {...field(draft,"color")} placeholder="navy"/></label>
        <label>Price (optional)<input inputMode="decimal" {...field(draft,"price")} placeholder="89.00"/></label>
      </div>
      <button type="button" className="intake-link-toggle" aria-expanded={draft.expanded} onClick={()=>updateDraft(draft.id,current=>({...current,expanded:!current.expanded}))}>{draft.expanded?"▾":"▸"} More details <span>Optional</span></button>
      {draft.expanded&&<div className="registry-fields">
        <label>GTIN / UPC / EAN<input inputMode="numeric" {...field(draft,"gtin")}/></label>
        <label>Pattern<input {...field(draft,"pattern")} placeholder="solid"/></label>
        <label>Material<input {...field(draft,"material")} placeholder="cotton"/></label>
        <label>Style<input {...field(draft,"style")} placeholder="minimal, workwear"/></label>
        <label>Brand aliases<input {...field(draft,"aliases")} placeholder="Other spellings of your brand name"/></label>
        <label>Currency<input maxLength={3} {...field(draft,"currency")}/></label>
        <label>Availability<select value={draft.form.availability} onChange={event=>updateDraft(draft.id,current=>({...current,form:{...current.form,availability:event.target.value}}))}><option value="unknown">Unknown</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="discontinued">Discontinued</option></select></label>
        <label>Product URL<input type="url" {...field(draft,"productUrl")} placeholder="https://brand.example/product"/></label>
        <label>Affiliate URL<input type="url" {...field(draft,"affiliateUrl")} placeholder="https://retailer.example/tracked"/></label>
        <label className="registry-wide">Label text<textarea {...field(draft,"labelText")} placeholder="Text printed on the care label, for your own records"/></label>
      </div>}
      {blockers.length>0&&<p className="catalog-note">Still needs {blockers.join(" and ")}.</p>}
    </article>;
  }

  return <section className="registry-panel" id="products">
    <div className="registry-heading"><div><div className="eyebrow">YOUR PRODUCT REGISTRY</div><h2>Connect real products to actual wear.</h2><p>Add a photo of each product — up to {MAX_ENROLL_DRAFTS} at once. Racked reads every photo and fills in what it can; you add the style code, which is the part only you know. No catalog system or CSV is required.</p></div><button type="button" className="button button-accent" onClick={()=>setOpen(value=>!value)}>{open?"Close enrollment":"+ Enrol products"}</button></div>

    {open&&<div className="registry-form">
      <PhotoSourcePicker label={drafts.length?"Choose different photos":"Add product photos"} multiple onFiles={chooseFiles}/>
      {busy&&progress&&<div className="upload-progress" role="status"><span/><strong>{progress}</strong><small>Racked reduces mobile photo size before the AWS request.</small></div>}
      {skippedPhotos>0&&<p className="catalog-note">{skippedPhotos} photo{skippedPhotos===1?"":"s"} were left for a second batch — {MAX_ENROLL_DRAFTS} at a time.</p>}
      {duplicates.length>0&&<p className="form-error" role="alert">Two drafts share the style code {duplicates[0]}. Style codes identify a product, so each needs its own.</p>}
      <div className="enroll-drafts">{drafts.map(draftCard)}</div>
      {drafts.length>0&&<div className="registry-actions">
        <button type="button" className="button button-dark" onClick={()=>void enrolAll()} disabled={busy||readyCount===0||duplicates.length>0}>
          {busy?"Enrolling…":`Enrol ${readyCount} product${readyCount===1?"":"s"}`}
        </button>
        {readyCount<pending.length&&<small className="catalog-note">{pending.length-readyCount} draft{pending.length-readyCount===1?"":"s"} still need a name, style code, or category.</small>}
      </div>}
    </div>}

    {status&&<div className="agent-action-status" role="status">✓ {status}</div>}{error&&<div className="form-error" role="alert">{error}</div>}
    <div className="registry-list"><div><strong>{products.length}</strong><span>enrolled products</span></div>{products.slice(0,6).map(product=><article key={product.id}><span className="verified-registry">ENROLLED</span><strong>{product.name}</strong><code>{product.brand} · {product.sku}</code><small>{product.gtin?`GTIN ${product.gtin}`:"SKU + brand identity"}</small></article>)}</div>
  </section>;
}
