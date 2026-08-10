/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import type { GarmentAnalysis, GarmentView } from "@/lib/platform-types";
import { buildPhotoPlan, PLANNED_CATEGORIES, type PhotoPlan } from "@/lib/photo-plan";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";

const allViews:GarmentView[]=["front","back","label"];
export interface GarmentOverrides {name:string;brand:string;sku:string}

export function ThreeViewUploader({onConfirmed}:{onConfirmed:(analysis:GarmentAnalysis,overrides:GarmentOverrides)=>Promise<void>}) {
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [analysis,setAnalysis]=useState<GarmentAnalysis|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [previews,setPreviews]=useState<Partial<Record<GarmentView,string>>>({});
  const [labelText,setLabelText]=useState("");
  const [overrides,setOverrides]=useState<GarmentOverrides>({name:"",brand:"",sku:""});
  const [plan,setPlan]=useState<PhotoPlan|null>(null);
  const [planBusy,setPlanBusy]=useState(false);

  useEffect(()=>()=>Object.values(previews).forEach(url=>URL.revokeObjectURL(url!)),[previews]);
  function setViewFile(view:GarmentView,file:File){setFiles(current=>({...current,[view]:file}));setPreviews(current=>({...current,[view]:URL.createObjectURL(file)}));setAnalysis(null);}
  async function requestPhotoPlan(){const front=files.front;if(!front||planBusy)return;setPlanBusy(true);setError("");try{const form=new FormData();form.append("front",await prepareImageForUpload(front));const response=await fetch("/api/garments/classify",{method:"POST",body:form});const data=await readJsonResponse<{error?:string;plan?:PhotoPlan}>(response,"The classification service returned an unreadable response.");if(!response.ok||!data.plan)throw new Error(data.error??"The photo plan could not be created.");setPlan(data.plan);}catch(reason){setError(reason instanceof Error?reason.message:"The photo plan could not be created.");}finally{setPlanBusy(false);}}
  function overridePlanCategory(category:string){setPlan(buildPhotoPlan(category,{source:"user-override"}));}
  const slotRequest=(view:GarmentView)=>view==="front"?null:plan?.requests.find(request=>request.slot===view)??null;
  async function analyze(){setBusy(true);setError("");setAnalysis(null);try{const form=new FormData();for(const [index,view] of allViews.entries()){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);setProgress(`Preparing ${view} photo ${index+1} of 3`);form.append(view,await prepareImageForUpload(file));}form.append("labelText",labelText);if(plan?.source==="user-override")form.append("categoryOverride",plan.category);setProgress("Sending the prepared evidence securely");const response=await fetch("/api/garments/analyze",{method:"POST",body:form});const data=await readJsonResponse<{error?:string;analysis:GarmentAnalysis}>(response,"The image service returned an unreadable response. Please retry.");if(!response.ok)throw new Error(data.error??"Analysis failed.");setAnalysis(data.analysis);setOverrides({name:data.analysis.garment.name,brand:/^(brand not verified|unmatched label)$/i.test(data.analysis.label.brand)?"":data.analysis.label.brand,sku:/^(unverified|unconfirmed)$/i.test(data.analysis.label.sku)?"":data.analysis.label.sku});}catch(reason){setError(reason instanceof Error?reason.message:"Analysis failed.");}finally{setBusy(false);setProgress("");}}
  async function confirm(){const box=document.getElementById("analysis-confirm") as HTMLInputElement|null;if(!box?.checked){setError("Confirm the result before saving.");return;}if(!analysis)return;if(!overrides.name.trim()){setError("Add your own garment name before saving.");return;}setBusy(true);setError("");try{await onConfirmed(analysis,{name:overrides.name.trim(),brand:overrides.brand.trim(),sku:overrides.sku.trim()});}catch(reason){setError(reason instanceof Error?reason.message:"The garment could not be saved.");}finally{setBusy(false);}}

  return <div className="three-view-flow">
    <div className="upload-toolbar"><div><strong>Required three-view garment record</strong><span>Start with the front photo. The optional AI plan then asks only for the shots this category actually needs.</span></div><span className="fallback-pill">3 PHOTOS REQUIRED</span></div>
    {files.front&&!plan&&!analysis&&<button type="button" className="button button-dark button-full" onClick={requestPhotoPlan} disabled={planBusy}>{planBusy?"Classifying the front photo…":"Get an AI photo plan for the next shots (optional)"}</button>}
    {plan&&<section className="photo-plan" aria-live="polite">
      <div className="ai-notice"><span>AI PHOTO PLAN</span>{plan.reasoning}</div>
      <div className="photo-plan-meta"><label>Category<select value={plan.category} onChange={event=>overridePlanCategory(event.target.value)}>{PLANNED_CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}</select></label><small>{plan.source==="ai"?`AI classified with ${plan.confidence}% confidence — change the category any time and the plan updates.`:plan.source==="user-override"?"You set this category; the plan reflects your choice.":"AI classification was unavailable, so this is the standard photo set. You can still set the category yourself."}</small></div>
      <ul className="photo-plan-requests">{plan.requests.map(request=><li key={request.slot}><strong>{request.title}</strong><span>{request.instruction}</span><small>Why: {request.reason}</small></li>)}</ul>
    </section>}
    <div className="three-view-grid">{allViews.map(view=>{const request=slotRequest(view);return <label className={`view-upload ${files[view]?"has-file":""}`} key={view}><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file)setViewFile(view,file);}}/>{previews[view]?<img src={previews[view]} alt={`${view} upload preview`}/>:<span className="view-placeholder">{view==="front"?"01":view==="back"?"02":"03"}</span>}<strong>{request?.title??view}</strong><small>{files[view]?.name??request?.instruction??"Choose image or use camera"}</small></label>;})}</div>
    <label className="label-text-field"><span>Visible label text <small>optional correction</small></span><textarea value={labelText} onChange={event=>setLabelText(event.target.value)} maxLength={1000} placeholder="Type a readable brand, style/SKU, GTIN, or material if the photo is difficult to read"/><small>Racked still requires the label photo. Typed text helps OCR but does not verify a product by itself.</small></label>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {busy&&progress&&<div className="upload-progress" role="status"><span/><strong>{progress}</strong><small>Original photos stay on your device; smaller analysis copies are encrypted in transit.</small></div>}
    {!analysis&&<button type="button" className="button button-dark button-full" onClick={analyze} disabled={busy||allViews.some(view=>!files[view])}>{busy?"Preparing secure upload…":"Analyze garment evidence"}</button>}
    {analysis&&<section className="analysis-result" aria-live="polite"><div className="analysis-head"><div><span className="fallback-pill">{analysis.label.matched?"VERIFIED PRODUCT":analysis.label.suggested?"SUGGESTED BRAND":"CUSTOM LABEL"}</span><h3>{analysis.garment.name}</h3><p>{analysis.garment.color} · {analysis.garment.category} · {analysis.garment.material}</p></div><div className="analysis-confidence"><strong>{analysis.confidence}%</strong><small>AI confidence</small></div></div>
      {analysis.processedImage&&<div className="processed-garment"><img src={analysis.processedImage.url} alt="AI-prepared garment preview"/><span>Cropped display image</span></div>}
      <div className="evidence-grid">{analysis.evidence.map(entry=><article key={entry.view}><strong>{entry.view}</strong>{entry.findings.map((finding,index)=><span key={`${entry.view}-${index}`}>✓ {finding}</span>)}</article>)}</div>
      <div className={`brand-match ${analysis.label.matched?"matched":""}`}><span>{analysis.label.matched?`VERIFIED · ${analysis.label.matchMethod}`:analysis.label.suggested?"MAJOR BRAND SUGGESTION":"UNVERIFIED — EDITABLE"}</span><strong>{analysis.label.brand}</strong><code>{analysis.label.sku}</code></div>
      <div className="consumer-label-fields"><label>Your garment label<input value={overrides.name} maxLength={100} onChange={event=>setOverrides({...overrides,name:event.target.value})}/><small>This is the name shown in your closet.</small></label><label>Brand name<input value={overrides.brand} maxLength={100} onChange={event=>setOverrides({...overrides,brand:event.target.value})} placeholder="Confirm, edit, or add a brand"/><small>{analysis.label.matched?"Verified from the enrolled brand registry.":"Your label will remain unverified unless it matches an enrolled product."}</small></label><label>SKU / style code <small>optional</small><input value={overrides.sku} maxLength={64} onChange={event=>setOverrides({...overrides,sku:event.target.value})}/></label></div>
      {analysis.warnings.map(warning=><p className="analysis-warning" key={warning}>{warning}</p>)}
      <label className="consent-row compact"><input type="checkbox" required id="analysis-confirm"/><span><strong>I confirm these photos and labels describe my garment.</strong><small>{analysis.label.matched?"The verified product link and private photos will be saved.":"Your editable label and private photos will be saved without claiming brand verification."}</small></span></label>
      <button type="button" className="button button-accent button-full" disabled={busy} onClick={confirm}>{busy?"Saving to wardrobe…":"Confirm & add to wardrobe"}</button>
    </section>}
  </div>;
}
