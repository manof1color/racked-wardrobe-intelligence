/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import type { GarmentAnalysis } from "@/lib/platform-types";
import type { DetectedLookGarment } from "@/lib/look-garment-detection";
import { GARMENT_TAXONOMY, normalizeGarmentCategory, subtypeForCategory } from "@/lib/garment-taxonomy";
import { PLANNED_CATEGORIES } from "@/lib/photo-plan";
import { prepareImageForUpload, readJsonResponse } from "@/lib/upload-client";
import type { GarmentOverrides } from "./three-view-uploader";

interface EditableDetection extends DetectedLookGarment {
  selected:boolean;
  overrides:GarmentOverrides;
}

export interface LookScanSelection {
  analysis:GarmentAnalysis;
  overrides:GarmentOverrides;
}

export function LookScanUploader({onConfirmed}:{onConfirmed:(pieces:LookScanSelection[])=>Promise<void>}) {
  const [file,setFile]=useState<File|null>(null);
  const [detections,setDetections]=useState<EditableDetection[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const selectedCount=useMemo(()=>detections.filter(item=>item.selected).length,[detections]);

  function chooseFile(next:File) {
    setFile(next);
    setDetections([]);
    setConfirmed(false);
    setError("");
  }
  async function analyze() {
    if(!file)return;
    setBusy(true);setError("");setDetections([]);setConfirmed(false);
    try {
      const form=new FormData();
      form.append("photo",await prepareImageForUpload(file));
      const response=await fetch("/api/garments/detect",{method:"POST",body:form});
      const data=await readJsonResponse<{error?:string;detections?:DetectedLookGarment[]}>(response,"The look scanner returned an unreadable response.");
      if(!response.ok||!data.detections)throw new Error(data.error??"The pieces could not be detected.");
      setDetections(data.detections.map(item=>({
        ...item,
        selected:true,
        overrides:{
          name:item.analysis.garment.name,
          brand:/^brand not verified$/i.test(item.analysis.label.brand)?"":item.analysis.label.brand,
          sku:"",
          category:item.analysis.garment.category,
          subtype:item.analysis.garment.subtype,
        },
      })));
    } catch(reason) {
      setError(reason instanceof Error?reason.message:"The pieces could not be detected.");
    } finally {setBusy(false);}
  }
  function updateDetection(id:string,update:(current:EditableDetection)=>EditableDetection) {
    setDetections(current=>current.map(item=>item.id===id?update(item):item));
  }
  function changeCategory(item:EditableDetection,value:string) {
    const category=normalizeGarmentCategory(value);
    updateDetection(item.id,current=>({...current,overrides:{...current.overrides,category,subtype:subtypeForCategory(category,current.overrides.subtype)}}));
  }
  async function save() {
    const selected=detections.filter(item=>item.selected);
    if(selected.length===0){setError("Select at least one detected piece.");return;}
    if(selected.some(item=>!item.overrides.name.trim())){setError("Give every selected piece a wardrobe name.");return;}
    if(!confirmed){setError("Confirm the selected pieces before saving.");return;}
    setBusy(true);setError("");
    try {
      await onConfirmed(selected.map(item=>({analysis:item.analysis,overrides:{...item.overrides,name:item.overrides.name.trim(),brand:item.overrides.brand.trim(),sku:item.overrides.sku.trim()}})));
    } catch(reason) {
      setError(reason instanceof Error?reason.message:"The selected pieces could not be saved.");
    } finally {setBusy(false);}
  }

  return <div className="look-scan-flow">
    <div className="upload-toolbar"><div><strong>Scan one photo into separate wardrobe pieces</strong><span>Use an outfit photo, a flat lay, or several garments placed where each item remains visible.</span></div><span className="fallback-pill">UP TO 8 PIECES</span></div>
    <label className={`look-photo-upload ${file?"has-file":""}`}>
      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event=>{const next=event.target.files?.[0];if(next)chooseFile(next);}}/>
      {file?<><span>✓</span><strong>Photo ready to scan</strong><small>{file.name}</small></>:<><span>＋</span><strong>Choose a photo or use your camera</strong><small>JPG, PNG, or WebP · up to 5 MB after preparation</small></>}
    </label>
    <div className="ai-notice"><span>HOW IT WORKS</span>AI finds distinct visible garments, crops each one into its own private wardrobe image, and asks you to confirm every label. Overlapping or hidden pieces may need a second photo.</div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    {detections.length===0&&<button type="button" className="button button-dark button-full" disabled={!file||busy} onClick={analyze}>{busy?"Separating visible pieces…":"Detect clothing pieces"}</button>}
    {detections.length>0&&<section className="look-detection-results" aria-live="polite">
      <div className="look-results-heading"><div><span className="fallback-pill">{detections.length} DETECTED</span><h3>Turn each detection into a wardrobe piece.</h3></div><button type="button" className="button button-light" disabled={busy} onClick={analyze}>Scan again</button></div>
      <p className="look-scan-boundary">Review the crops carefully. Brand names are editable suggestions only and remain unverified unless separate registry evidence is supplied.</p>
      <div className="look-piece-grid">{detections.map((item,index)=><article className={`look-piece-card ${item.selected?"selected":""}`} key={item.id}>
        <label className="look-piece-select"><input type="checkbox" checked={item.selected} onChange={event=>updateDetection(item.id,current=>({...current,selected:event.target.checked}))}/><span>Piece {index+1}</span><strong>{item.analysis.confidence}%</strong></label>
        {item.analysis.processedImage&&<img src={item.analysis.processedImage.url} alt={`Detected ${item.analysis.garment.name}`}/>}
        <div className="look-piece-fields">
          <label>Wardrobe name<input value={item.overrides.name} maxLength={100} disabled={!item.selected} onChange={event=>updateDetection(item.id,current=>({...current,overrides:{...current.overrides,name:event.target.value}}))}/></label>
          <label>Category<select value={item.overrides.category} disabled={!item.selected} onChange={event=>changeCategory(item,event.target.value)}>{PLANNED_CATEGORIES.map(category=><option value={category} key={category}>{category}</option>)}</select></label>
          <label>Specific type<select value={item.overrides.subtype} disabled={!item.selected} onChange={event=>updateDetection(item.id,current=>({...current,overrides:{...current.overrides,subtype:event.target.value}}))}>{GARMENT_TAXONOMY[item.overrides.category].map(subtype=><option value={subtype} key={subtype}>{subtype}</option>)}</select></label>
          <label>Brand <small>optional, unverified</small><input value={item.overrides.brand} maxLength={100} disabled={!item.selected} placeholder="Add or correct the label" onChange={event=>updateDetection(item.id,current=>({...current,overrides:{...current.overrides,brand:event.target.value}}))}/></label>
        </div>
        <p>{item.analysis.garment.color} · {item.analysis.garment.pattern} · {item.analysis.garment.material}</p>
      </article>)}</div>
      <label className="consent-row compact"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span><strong>I confirm the selected detections are separate pieces in my wardrobe.</strong><small>Only the {selectedCount} selected crop{selectedCount===1?"":"s"} will be added. The source photo remains private.</small></span></label>
      <button type="button" className="button button-accent button-full" disabled={busy||selectedCount===0} onClick={save}>{busy?"Adding private wardrobe pieces…":`Add ${selectedCount} selected piece${selectedCount===1?"":"s"}`}</button>
    </section>}
  </div>;
}
