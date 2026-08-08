/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";
import type { GarmentAnalysis, GarmentView } from "@/lib/platform-types";

const allViews:GarmentView[]=["front","back","label"];
type ScanMode="quick"|"verified";

export function ThreeViewUploader({onConfirmed}:{onConfirmed:(analysis:GarmentAnalysis)=>Promise<void>}) {
  const [mode,setMode]=useState<ScanMode>("quick");
  const [files,setFiles]=useState<Partial<Record<GarmentView,File>>>({});
  const [analysis,setAnalysis]=useState<GarmentAnalysis|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [previews,setPreviews]=useState<Partial<Record<GarmentView,string>>>({});
  const [labelText,setLabelText]=useState("");
  const visibleViews=mode==="quick"?["front"] as GarmentView[]:allViews;

  useEffect(()=>()=>Object.values(previews).forEach(url=>URL.revokeObjectURL(url!)),[previews]);
  function switchMode(next:ScanMode){setMode(next);setAnalysis(null);setError("");}
  function setViewFile(view:GarmentView,file:File){setFiles(current=>({...current,[view]:file}));setPreviews(current=>({...current,[view]:URL.createObjectURL(file)}));setAnalysis(null);}
  async function analyze(){setBusy(true);setError("");setAnalysis(null);try{const form=new FormData();for(const view of visibleViews){const file=files[view];if(!file)throw new Error(`Add the ${view} image.`);form.append(view,file);}if(mode==="verified")form.append("labelText",labelText);const response=await fetch("/api/garments/analyze",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error??"Analysis failed.");setAnalysis(data.analysis);}catch(reason){setError(reason instanceof Error?reason.message:"Analysis failed.");}finally{setBusy(false);}}
  async function confirm(){const box=document.getElementById("analysis-confirm") as HTMLInputElement|null;if(!box?.checked){setError("Confirm the result before saving.");return;}if(!analysis)return;setBusy(true);setError("");try{await onConfirmed(analysis);}catch(reason){setError(reason instanceof Error?reason.message:"The garment could not be saved.");}finally{setBusy(false);}}

  return <div className="three-view-flow">
    <div className="scan-mode-switch" role="group" aria-label="Scan confidence level"><button type="button" className={mode==="quick"?"active":""} aria-pressed={mode==="quick"} onClick={()=>switchMode("quick")}><strong>Quick scan</strong><span>Front photo only</span></button><button type="button" className={mode==="verified"?"active":""} aria-pressed={mode==="verified"} onClick={()=>switchMode("verified")}><strong>Verified match</strong><span>Front + back + label</span></button></div>
    <div className="upload-toolbar"><div><strong>{mode==="quick"?"Fast visual wardrobe entry":"High-confidence evidence set"}</strong><span>{mode==="quick"?"AI classifies the garment and prepares it for your avatar. Brand and SKU stay unverified.":"The label can connect the item to an enrolled brand and SKU; the back strengthens construction evidence."}</span></div></div>
    <div className={`three-view-grid ${mode==="quick"?"quick-grid":""}`}>{visibleViews.map(view=><label className={`view-upload ${files[view]?"has-file":""}`} key={view}><input type="file" accept="image/jpeg,image/png,image/webp" capture={view==="front"?"environment":undefined} onChange={event=>{const file=event.target.files?.[0];if(file)setViewFile(view,file);}}/>{previews[view]?<img src={previews[view]} alt={`${view} upload preview`}/>:<span className="view-placeholder">{view==="front"?"01":view==="back"?"02":"03"}</span>}<strong>{view}{mode==="verified"?"":" photo"}</strong><small>{files[view]?.name??"Choose image or use camera"}</small></label>)}</div>
    {mode==="verified"&&<label className="label-text-field"><span>Label text <small>optional correction</small></span><textarea value={labelText} onChange={event=>setLabelText(event.target.value)} maxLength={1000} placeholder="If needed, type the visible brand, SKU/MPN, GTIN, or material text"/><small>AI reads the label photo; use this field only to correct text that is hard to photograph.</small></label>}
    {error&&<div className="form-error" role="alert">{error}</div>}
    {!analysis&&<button type="button" className="button button-dark button-full" onClick={analyze} disabled={busy||visibleViews.some(view=>!files[view])}>{busy?"Analyzing and preparing image…":mode==="quick"?"Analyze front photo":"Analyze verified evidence"}</button>}
    {analysis&&<section className="analysis-result" aria-live="polite"><div className="analysis-head"><div><span className="fallback-pill">{analysis.dataSufficiency==="partial"?"QUICK SCAN":"VERIFIED EVIDENCE"}</span><h3>{analysis.garment.name}</h3><p>{analysis.garment.color} · {analysis.garment.category} · {analysis.garment.material}</p></div><div className="analysis-confidence"><strong>{analysis.confidence}%</strong><small>confidence</small></div></div>
      {analysis.processedImage&&<div className="processed-garment"><img src={analysis.processedImage.url} alt="AI-prepared garment preview"/><span>Avatar-ready crop</span></div>}
      <div className={`evidence-grid ${analysis.evidence.length===1?"single-evidence":""}`}>{analysis.evidence.map(entry=><article key={entry.view}><strong>{entry.view}</strong>{entry.findings.map(finding=><span key={finding}>✓ {finding}</span>)}</article>)}</div>
      <div className={`brand-match ${analysis.label.matched?"matched":""}`}><span>{analysis.label.matched?`REGISTRY MATCH · ${analysis.label.matchMethod}`:"IDENTITY STATUS"}</span><strong>{analysis.label.brand}</strong><code>{analysis.label.sku}</code>{analysis.label.brandSlug&&<a href={`/brands/${analysis.label.brandSlug}`}>Open brand page →</a>}</div>
      {analysis.warnings.map(warning=><p className="analysis-warning" key={warning}>{warning}</p>)}
      <label className="consent-row compact"><input type="checkbox" required id="analysis-confirm"/><span><strong>I confirm this result.</strong><small>{analysis.label.matched?"The verified brand, SKU, attributes, and private image will be saved.":"The image and visible attributes will be saved; no brand identity will be claimed."}</small></span></label>
      <button type="button" className="button button-accent button-full" disabled={busy} onClick={confirm}>{busy?"Saving to wardrobe…":"Confirm & add to wardrobe"}</button>
    </section>}
  </div>;
}
