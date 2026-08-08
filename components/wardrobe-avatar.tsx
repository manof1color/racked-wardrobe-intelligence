/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import type { WardrobeItem } from "@/lib/types";

const slots=["top","bottom","outerwear","shoe","accessory"] as const;

export function WardrobeAvatar({items,onRecord}:{items:WardrobeItem[];onRecord:(ids:string[])=>Promise<void>}) {
  const initial=Object.fromEntries(slots.map(slot=>[slot,items.find(item=>item.category===slot)?.id??""])) as Record<(typeof slots)[number],string>;
  const [selected,setSelected]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const chosen=useMemo(()=>slots.map(slot=>items.find(item=>item.id===selected[slot])).filter((item):item is WardrobeItem=>Boolean(item)),[items,selected]);
  const piece=(slot:(typeof slots)[number])=>items.find(item=>item.id===selected[slot]);
  async function record(){setBusy(true);setError("");try{await onRecord(chosen.map(item=>item.id));}catch(reason){setError(reason instanceof Error?reason.message:"The outfit could not be saved.");}finally{setBusy(false);}}
  function layer(slot:(typeof slots)[number],className:string){const item=piece(slot);if(!item)return null;return item.imageUrl?<img className={`avatar-layer avatar-photo ${className}`} src={item.imageUrl} alt="" title={item.name}/>:<div className={`avatar-layer ${className} ${item.art}`} title={item.name}/>;}

  return <section className="avatar-view" aria-labelledby="avatar-title">
    <div className="avatar-copy"><div className="eyebrow">OUTFIT LAB · YOUR SAVED PIECES</div><h2 id="avatar-title">Build it on your avatar.</h2><p>Layer the private, avatar-ready garment images created from your uploads. Saving the look stores the outfit and records one wear for every selected piece.</p><div className="avatar-controls">{slots.map(slot=>{const options=items.filter(item=>item.category===slot);return <label key={slot}><span>{slot}</span><select value={selected[slot]} onChange={event=>setSelected(current=>({...current,[slot]:event.target.value}))}><option value="">None</option>{options.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;})}</div></div>
    <div className="avatar-phone"><div className="avatar-phone-top"><span>9:41</span><strong>RACKED FIT</strong><i>●●●</i></div><div className="avatar-stage" aria-label={`Avatar wearing ${chosen.map(item=>item.name).join(", ")}`}><div className="avatar-head"/><div className="avatar-neck"/><div className="avatar-body"/><div className="avatar-arm left"/><div className="avatar-arm right"/><div className="avatar-leg left"/><div className="avatar-leg right"/>{layer("top","avatar-top")}{layer("bottom","avatar-bottom")}{layer("outerwear","avatar-outerwear")}{layer("shoe","avatar-shoe avatar-shoe-pair")}{layer("accessory","avatar-bag")}</div><div className="avatar-outfit-list">{chosen.map(item=><span key={item.id}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<i className={item.art}/>} {item.name}</span>)}</div>{error&&<div className="avatar-error" role="alert">{error}</div>}<button type="button" className="button button-accent button-full" onClick={record} disabled={busy||chosen.length===0}>{busy?"Saving outfit…":"Save & wear this look"}</button></div>
  </section>;
}
