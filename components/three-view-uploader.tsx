/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import type { GarmentAnalysis, GarmentView } from "@/lib/platform-types";

const fixtures:Record<GarmentView,string>={front:"/test-uploads/northstar-overshirt-front.png",back:"/test-uploads/northstar-overshirt-back.png",label:"/test-uploads/northstar-overshirt-label.png"};
const views:GarmentView[]=["front","back","label"];

export function ThreeViewUploader({onConfirmed}:{onConfirmed:(analysis:GarmentAnalysis)=>void}) {
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [analysis,setAnalysis]=useState<GarmentAnalysis|null>(null);
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const [previews,setPreviews]=useState<Partial<Record<GarmentView,string>>>({});

  useEffect(()=>()=>Object.values(previews).forEach((url)=>URL.revokeObjectURL(url!)),[previews]);
  function setViewFile(view:GarmentView,file:File){setFiles((current)=>({...current,[view]:file}));setPreviews((current)=>({...current,[view]:URL.createObjectURL(file)}));setAnalysis(null);}
  async function loadTestSet(){setBusy(true);setError("");try{const entries=await Promise.all(views.map(async(view)=>{const response=await fetch(fixtures[view]);const blob=await response.blob();return [view,new File([blob],fixtures[view].split("/").pop()!,{type:"image/png"})] as const;}));setFiles(Object.fromEntries(entries));setPreviews(Object.fromEntries(entries.map(([view,file])=>[view,URL.createObjectURL(file)])));setAnalysis(null);}catch{setError("The checked-in test set could not be loaded.");}finally{setBusy(false);}}
  async function analyze(){setBusy(true);setError("");setAnalysis(null);try{const form=new FormData();for(const view of views){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);form.append(view,file);}const response=await fetch("/api/garments/analyze",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error ?? "Analysis failed.");setAnalysis(data.analysis);}catch(reason){setError(reason instanceof Error?reason.message:"Analysis failed.");}finally{setBusy(false);}}
  return <div className="three-view-flow">
    <div className="upload-toolbar"><div><strong>Three-view evidence set</strong><span>Front + back establish the garment. Label connects the brand and SKU.</span></div><button type="button" className="fixture-button" onClick={loadTestSet} disabled={busy}>Load runnable test set</button></div>
    <div className="three-view-grid">{views.map((view)=><label className={`view-upload ${files[view]?"has-file":""}`} key={view}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>{const file=event.target.files?.[0];if(file)setViewFile(view,file);}}/>{previews[view]?<img src={previews[view]} alt={`${view} upload preview`}/>:<span className="view-placeholder">{view==="front"?"01":view==="back"?"02":"03"}</span>}<strong>{view}</strong><small>{files[view]?.name ?? "Choose image"}</small></label>)}</div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {!analysis&&<button type="button" className="button button-dark button-full" onClick={analyze} disabled={busy||views.some((view)=>!files[view])}>{busy?"Analyzing three views…":"Analyze front, back & label"}</button>}
    {analysis&&<section className="analysis-result" aria-live="polite"><div className="analysis-head"><div><span className="fallback-pill">{analysis.fallback?"DETERMINISTIC FALLBACK":"MULTIMODAL"}</span><h3>{analysis.garment.name}</h3><p>{analysis.garment.color} · {analysis.garment.category} · {analysis.garment.material}</p></div><div className="analysis-confidence"><strong>{analysis.confidence}%</strong><small>confidence</small></div></div><div className="evidence-grid">{analysis.evidence.map((entry)=><article key={entry.view}><strong>{entry.view}</strong>{entry.findings.map((finding)=><span key={finding}>✓ {finding}</span>)}</article>)}</div><div className={`brand-match ${analysis.label.matched?"matched":""}`}><span>LABEL MATCH</span><strong>{analysis.label.brand}</strong><code>{analysis.label.sku}</code>{analysis.label.brandSlug&&<a href={`/brands/${analysis.label.brandSlug}`}>Open brand page →</a>}</div><label className="consent-row compact"><input type="checkbox" required id="analysis-confirm"/><span><strong>I confirm the three-view result.</strong><small>Brand, SKU, and attributes remain editable before a production save.</small></span></label><button type="button" className="button button-accent button-full" onClick={()=>{const box=document.getElementById("analysis-confirm") as HTMLInputElement|null;if(!box?.checked){setError("Confirm the three-view result before saving.");return;}onConfirmed(analysis);}}>Confirm & add to wardrobe</button></section>}
  </div>;
}
