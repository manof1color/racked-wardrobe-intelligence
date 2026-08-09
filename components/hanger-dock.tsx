"use client";

import { useState } from "react";
import { BrandAgentPanel, ConsumerAgentPanel } from "./agent-panels";

export function HangerDock({role,productId,onWearRecorded}:{role:"consumer"|"brand";productId?:string;onWearRecorded?:(counts:Record<string,number>)=>void}) {
  const [open,setOpen]=useState(false);
  return <>
    <button type="button" className="hanger-launcher" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><span className="hanger-mark" aria-hidden="true">⌁</span><span><strong>Hanger</strong><small>{role==="consumer"?"Style my wardrobe":"Analyze brand wear"}</small></span></button>
    {open&&<div className="hanger-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}><aside className="hanger-drawer" role="dialog" aria-modal="true" aria-label="Hanger AI assistant"><header><div><span className="hanger-mark">⌁</span><div><strong>Hanger</strong><small>{role==="consumer"?"Wardrobe styling agent":"Brand wear intelligence agent"}</small></div></div><button type="button" aria-label="Close Hanger" onClick={()=>setOpen(false)}>×</button></header>{role==="consumer"?<ConsumerAgentPanel onWearRecorded={onWearRecorded}/>:productId?<BrandAgentPanel productId={productId}/>:<div className="hanger-empty"><strong>Enroll a product first.</strong><p>Hanger needs a registered product before it can analyze privacy-safe wear information.</p></div>}</aside></div>}
  </>;
}
