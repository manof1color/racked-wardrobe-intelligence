"use client";

import Link from "next/link";
import { useState } from "react";

type DemoPurchaseStep="product"|"bag"|"complete";

export function DemoPurchasePanel({productName,unavailable}:{productName:string;unavailable:boolean}) {
  const [step,setStep]=useState<DemoPurchaseStep>("product");
  if(unavailable)return <><button type="button" className="button button-dark button-full" disabled>Unavailable</button><p className="demo-product-nosale">This fictional product is deliberately unavailable so judges can verify the unavailable-product state.</p></>;

  if(step==="complete")return <section className="demo-purchase-confirmation" role="status">
    <span aria-hidden="true">✓</span>
    <div><strong>Demo purchase complete</strong><p>No card was requested, no payment was processed, and no order was created. The full commerce handoff is now demonstrated.</p></div>
    <Link className="button button-accent" href="/community">Return to Racked</Link>
  </section>;

  if(step==="bag")return <section className="demo-bag" aria-label="Fictional demo bag">
    <div><span>DEMO BAG · 1 ITEM</span><strong>{productName}</strong><small>Simulation only · total charged $0.00</small></div>
    <button type="button" className="button button-accent button-full" onClick={()=>setStep("complete")}>Complete demo purchase — $0.00</button>
    <button type="button" className="text-button" onClick={()=>setStep("product")}>Remove from demo bag</button>
  </section>;

  return <><button type="button" className="button button-dark button-full" onClick={()=>setStep("bag")}>Add to demo bag</button><p className="demo-product-nosale">This is a working purchase simulation for competition testing. It never asks for payment, contact, shipping, or account information.</p></>;
}
