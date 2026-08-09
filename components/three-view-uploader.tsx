/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import type { GarmentAnalysis, GarmentView } from "@/lib/platform-types";

const allViews:GarmentView[]=["front","back","label"];
export interface GarmentOverrides {name:string;brand:string;sku:string}

export function ThreeViewUploader({onConfirmed}:{onConfirmed:(analysis:GarmentAnalysis,overrides:GarmentOverrides)=>Promise<void>}) {
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [analysis,setAnalysis]=useState<GarmentAnalysis|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [previews,setPreviews]=useState<Partial<Record<GarmentView,string>>>({});
  const [labelText,setLabelText]=useState("");
  const [overrides,setOverrides]=useState<GarmentOverrides>({name:"",brand:"",sku:""});

  useEffect(()=>()=>Object.values(previews).forEach(url=>URL.revokeObjectURL(url!)),[previews]);
  function setViewFile(view:GarmentView,file:File){setFiles(current=>({...current,[view]:file}));setPreviews(current=>({...current,[view]:URL.createObjectURL(file)}));setAnalysis(null);}
  async function analyze(){setBusy(true);setError("");setAnalysis(null);try{const form=new FormData();for(const view of allViews){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);form.append(view,file);}form.append("labelText",labelText);const response=await fetch("/api/garments/analyze",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error??"Analysis failed.");setAnalysis(data.analysis);setOverrides({name:data.analysis.garment.name,brand:/^(brand not verified|unmatched label)$/i.test(data.analysis.label.brand)?"":data.analysis.label.brand,sku:/^(unverified|unconfirmed)$/i.test(data.analysis.label.sku)?"":data.analysis.label.sku});}catch(reason){setError(reason instanceof Error?reason.message:"Analysis failed.");}finally{setBusy(false);}}
  async function confirm(){const box=document.getElementById("analysis-confirm") as HTMLInputElement|null;if(!box?.checked){setError("Confirm the result before saving.");return;}if(!analysis)return;if(!overrides.name.trim()){setError("Add your own garment name before saving.");return;}setBusy(true);setError("");try{await onConfirmed(analysis,{name:overrides.name.trim(),brand:overrides.brand.trim(),sku:overrides.sku.trim()});}catch(reason){setError(reason instanceof Error?reason.message:"The garment could not be saved.");}finally{setBusy(false);}}

  return <div className="three-view-flow">
    <div className="upload-toolbar"><div><strong>Required three-view garment record</strong><span>Front and back images support garment analysis. The label image supports brand, SKU, material, and catalog matching.</span></div><span className="fallback-pill">3 PHOTOS REQUIRED</span></div>
    <div className="three-view-grid">{allViews.map(view=><label className={`view-upload ${files[view]?"has-file":""}`} key={view}><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file)setViewFile(view,file);}}/>{previews[view]?<img src={previews[view]} alt={`${view} upload preview`}/>:<span className="view-placeholder">{view==="front"?"01":view==="back"?"02":"03"}</span>}<strong>{view}</strong><small>{files[view]?.name??"Choose image or use camera"}</small></label>)}</div>
    <label className="label-text-field"><span>Visible label text <small>optional correction</small></span><textarea value={labelText} onChange={event=>setLabelText(event.target.value)} maxLength={1000} placeholder="Type a readable brand, style/SKU, GTIN, or material if the photo is difficult to read"/><small>Racked still requires the label photo. Typed text helps OCR but does not verify a product by itself.</small></label>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {!analysis&&<button type="button" className="button button-dark button-full" onClick={analyze} disabled={busy||allViews.some(view=>!files[view])}>{busy?"Analyzing all three views…":"Analyze garment evidence"}</button>}
    {analysis&&<section className="analysis-result" aria-live="polite"><div className="analysis-head"><div><span className="fallback-pill">{analysis.label.matched?"VERIFIED PRODUCT":analysis.label.suggested?"SUGGESTED BRAND":"CUSTOM LABEL"}</span><h3>{analysis.garment.name}</h3><p>{analysis.garment.color} · {analysis.garment.category} · {analysis.garment.material}</p></div><div className="analysis-confidence"><strong>{analysis.confidence}%</strong><small>AI confidence</small></div></div>
      {analysis.processedImage&&<div className="processed-garment"><img src={analysis.processedImage.url} alt="AI-prepared garment preview"/><span>Avatar-ready crop</span></div>}
      <div className="evidence-grid">{analysis.evidence.map(entry=><article key={entry.view}><strong>{entry.view}</strong>{entry.findings.map((finding,index)=><span key={`${entry.view}-${index}`}>✓ {finding}</span>)}</article>)}</div>
      <div className={`brand-match ${analysis.label.matched?"matched":""}`}><span>{analysis.label.matched?`VERIFIED · ${analysis.label.matchMethod}`:analysis.label.suggested?"MAJOR BRAND SUGGESTION":"UNVERIFIED — EDITABLE"}</span><strong>{analysis.label.brand}</strong><code>{analysis.label.sku}</code></div>
      <div className="consumer-label-fields"><label>Your garment label<input value={overrides.name} maxLength={100} onChange={event=>setOverrides({...overrides,name:event.target.value})}/><small>This is the name shown in your closet.</small></label><label>Brand name<input value={overrides.brand} maxLength={100} onChange={event=>setOverrides({...overrides,brand:event.target.value})} placeholder="Confirm, edit, or add a brand"/><small>{analysis.label.matched?"Verified from the enrolled brand registry.":"Your label will remain unverified unless it matches an enrolled product."}</small></label><label>SKU / style code <small>optional</small><input value={overrides.sku} maxLength={64} onChange={event=>setOverrides({...overrides,sku:event.target.value})}/></label></div>
      {analysis.warnings.map(warning=><p className="analysis-warning" key={warning}>{warning}</p>)}
      <label className="consent-row compact"><input type="checkbox" required id="analysis-confirm"/><span><strong>I confirm these photos and labels describe my garment.</strong><small>{analysis.label.matched?"The verified product link and private photos will be saved.":"Your editable label and private photos will be saved without claiming brand verification."}</small></span></label>
      <button type="button" className="button button-accent button-full" disabled={busy} onClick={confirm}>{busy?"Saving to wardrobe…":"Confirm & add to wardrobe"}</button>
    </section>}
  </div>;
}
