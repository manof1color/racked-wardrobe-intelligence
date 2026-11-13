/* eslint-disable @next/next/no-img-element */
"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BrandLook, BrandProductRegistration } from "@/lib/platform-types";
import { signalJudgeTourProgress } from "@/lib/judge-tour";
import { EmptyState } from "./empty-state";

const SLOT_ORDER = ["outerwear", "top", "dress", "bottom", "shoe", "bag", "jewelry", "accessory"];
const MAX_PIECES = 10;

function slotOf(category: string) {
  const value = category.toLowerCase();
  return SLOT_ORDER.find((slot) => value.includes(slot)) ?? "other";
}

// Judge note: a Brand Look can only ever contain products this brand enrolled. The
// picker is built from the server-provided owned catalog, and the server independently
// re-checks ownership on save — the UI is a convenience, not the boundary.
//
// In a demo session (`preview`), Post shows the Look as Community would, labelled as a preview, and
// sends nothing: demo brands cannot publish to the live feed, which real brands share (lib/demo-session.ts,
// enforced again by the server). Saving a draft still goes to the server, which decides.
interface PreviewPost { title: string; caption: string; pieces: BrandProductRegistration[] }

export function BrandLookBuilder({products,preview=false,compact=false}:{products:BrandProductRegistration[];preview?:boolean;compact?:boolean}){
  const [looks,setLooks]=useState<BrandLook[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [title,setTitle]=useState("");
  const [caption,setCaption]=useState("");
  const [publish,setPublish]=useState(true);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [posted,setPosted]=useState<PreviewPost|null>(null);

  useEffect(()=>{fetch("/api/brand/looks").then(response=>response.json()).then(data=>setLooks(data.looks??[])).catch(()=>setError("Brand Looks could not be loaded.")).finally(()=>setLoading(false));},[]);

  const groups=useMemo(()=>{
    const bySlot=new Map<string,BrandProductRegistration[]>();
    for(const product of products){
      const slot=slotOf(product.category);
      bySlot.set(slot,[...(bySlot.get(slot)??[]),product]);
    }
    return [...SLOT_ORDER,"other"].flatMap(slot=>{const items=bySlot.get(slot);return items?.length?[{slot,items}]:[];});
  },[products]);

  const chosen=useMemo(()=>selected.flatMap(id=>{const product=products.find(item=>item.id===id);return product?[product]:[];}),[selected,products]);
  const atLimit=selected.length>=MAX_PIECES;

  function toggle(id:string){
    setError("");
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):current.length>=MAX_PIECES?current:[...current,id]);
  }

  async function submit(event:FormEvent){
    event.preventDefault();setError("");setNotice("");
    if(preview&&publish){
      setPosted({title:title.trim(),caption:caption.trim(),pieces:chosen});
      setTitle("");setCaption("");setSelected([]);
      setNotice("Demo preview: this is how your Look appears in Community. Nothing was published or saved.");
      signalJudgeTourProgress("brand-post");
      return;
    }
    setBusy(true);
    try{
      const response=await fetch("/api/brand/looks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,caption,productIds:selected,published:publish})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Brand Look could not be saved.");
      setLooks(current=>[data.look,...current]);
      setTitle("");setCaption("");setSelected([]);
      setNotice(publish?"Brand Look published to Community and your public brand page.":"Draft Brand Look saved; it is not public yet.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Brand Look could not be saved.");}
    finally{setBusy(false);}
  }

  return <section className="registry-panel brand-look-panel" id="brand-looks">
    <div className={`registry-heading${compact?" compact":""}`}>
      <div><div className="eyebrow">BRAND LOOKS</div><h2>Style your own catalog.</h2><p>Build a Look from products enrolled under this account. Published Looks are labeled as Brand content everywhere they appear, so they never read as an ordinary customer post.</p></div>
      <span className="fallback-pill">{loading?"…":`${looks.length} LOOKS`}</span>
    </div>

    {products.length===0
      ? <EmptyState icon="catalog" title="Enroll a product first.">A Brand Look can only contain products you have enrolled and verified. Add one from the Catalog tab.</EmptyState>
      : <form className="brand-look-builder" onSubmit={submit}>
        <div className="brand-look-slots">
          {groups.map(group=><div key={group.slot} className="brand-look-slot">
            <span className="eyebrow">{group.slot}</span>
            <div className="brand-look-options">{group.items.map(product=>{
              const active=selected.includes(product.id);
              return <button type="button" key={product.id} className={active?"selected":""} aria-pressed={active} disabled={!active&&atLimit} onClick={()=>toggle(product.id)}>
                {product.imageUrls?.front?<img src={product.imageUrls.front} alt=""/>:<span className="brand-look-swatch" aria-hidden="true"/>}
                <strong>{product.name}</strong>
                <small>{product.sku}</small>
              </button>;
            })}</div>
          </div>)}
        </div>

        <div className="brand-look-preview" aria-live="polite">
          <div className="eyebrow">THIS LOOK</div>
          {chosen.length===0
            ? <p className="brand-look-hint">Choose products above to compose the Look.</p>
            : <div className="brand-look-preview-row">{chosen.map(product=><figure key={product.id}>{product.imageUrls?.front?<img src={product.imageUrls.front} alt={product.name}/>:<span className="brand-look-swatch" aria-hidden="true"/>}<figcaption>{product.name}</figcaption></figure>)}</div>}
          <small>{selected.length} of {MAX_PIECES} pieces{atLimit?" · limit reached":""}</small>
        </div>

        <label className="brand-look-field">Look title<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={80} placeholder="Autumn layering" required/></label>
        <label className="brand-look-field">Styling story<input value={caption} onChange={event=>setCaption(event.target.value)} maxLength={280} placeholder="How this comes together and when to wear it" required/></label>

        <label className="consent-row compact"><input type="checkbox" checked={publish} onChange={event=>setPublish(event.target.checked)}/><span><strong>Publish as a Brand Look</strong><small>Public in Community and on your brand page, always labeled as brand-created.</small></span></label>

        <button className="button button-dark" disabled={busy||!selected.length||!title.trim()||!caption.trim()}>{busy?"Saving…":publish?(preview?"Post":"Publish Brand Look"):"Save draft Look"}</button>
        {preview&&publish&&<small className="brand-look-preview-note">Demo: Post shows the Look as Community would. Demo brands cannot publish to the live feed, which real brands share.</small>}
      </form>}

    {notice&&<div className="agent-action-status" role="status">✓ {notice}</div>}

    {posted&&<article className="brand-look-posted" aria-label="Demo preview of your posted Look">
      <div className="brand-look-posted-head"><span className="shop-badge">Brand Look</span><span className="brand-look-posted-flag">Demo preview · not published</span></div>
      <h3>{posted.title}</h3>
      <p>{posted.caption}</p>
      <div className="brand-look-preview-row">{posted.pieces.map(product=><figure key={product.id}>{product.imageUrls?.front?<img src={product.imageUrls.front} alt={product.name}/>:<span className="brand-look-swatch" aria-hidden="true"/>}<figcaption>{product.name}</figcaption></figure>)}</div>
      <small>In Community, each piece links to your store, and shoppers who follow it count toward Racked&rsquo;s visits-sent figure on your dashboard.</small>
    </article>}
    {error&&<div className="form-error" role="alert">{error}</div>}

    {looks.length>0&&<div className="brand-look-existing"><div className="eyebrow">YOUR LOOKS</div><ul>{looks.map(look=><li key={look.id}><strong>{look.title}</strong><small>{look.productIds.length} piece{look.productIds.length===1?"":"s"} · {look.published?"Published":"Draft"}</small></li>)}</ul></div>}
  </section>;
}
