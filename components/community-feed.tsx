/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import type { OutfitPost } from "@/lib/platform-types";
import type { RecreateLookResult } from "@/lib/recreate-look";

interface SavedOutfitOption { id:string; name:string; pieceCount:number }

export function CommunityFeed({initialPosts,canPost,savedOutfits}:{initialPosts:OutfitPost[];canPost:boolean;savedOutfits:SavedOutfitOption[]}) {
  const [posts,setPosts]=useState(initialPosts);
  const [title,setTitle]=useState("");
  const [caption,setCaption]=useState("");
  const [outfitId,setOutfitId]=useState(savedOutfits[0]?.id??"");
  const [error,setError]=useState("");
  const [pendingLike,setPendingLike]=useState<string|null>(null);
  const [pendingRecreate,setPendingRecreate]=useState<string|null>(null);
  const [recreations,setRecreations]=useState<Record<string,RecreateLookResult>>({});

  async function publish(event:FormEvent){
    event.preventDefault();setError("");
    const response=await fetch("/api/community",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outfitTitle:title,caption,outfitId})});
    const data=await response.json();
    if(!response.ok){setError(data.error??"Post could not be published.");return;}
    setPosts(current=>[data.post,...current]);setTitle("");setCaption("");
  }
  async function like(postId:string){
    setPendingLike(postId);setError("");
    try{const response=await fetch("/api/community",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({postId})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Like could not be recorded.");setPosts(current=>current.map(item=>item.id===postId?{...item,likes:data.likes}:item));}
    catch(reason){setError(reason instanceof Error?reason.message:"Like could not be recorded.");}finally{setPendingLike(null);}
  }
  async function recreate(postId:string){
    setPendingRecreate(postId);setError("");
    try{const response=await fetch(`/api/community/${encodeURIComponent(postId)}/recreate`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error??"The look could not be compared.");setRecreations(current=>({...current,[postId]:data.result}));}
    catch(reason){setError(reason instanceof Error?reason.message:"The look could not be compared.");}finally{setPendingRecreate(null);}
  }

  return <>
    <section className="community-hero"><div className="eyebrow">PUBLIC OUTFIT COMMUNITY</div><h1>Wear it. Track it.<br/><em>Pass the idea on.</em></h1><p>Only the saved outfit you explicitly publish becomes public. Brand links appear only for exact registry-verified products; the rest of your wardrobe stays private.</p></section>
    {canPost?(savedOutfits.length?<form className="post-composer" onSubmit={publish}><div><strong>Share a saved outfit</strong><span>Every piece in the selected outfit is published; no other wardrobe item is exposed.</span></div><select aria-label="Saved outfit" value={outfitId} onChange={event=>setOutfitId(event.target.value)} required>{savedOutfits.map(outfit=><option key={outfit.id} value={outfit.id}>{outfit.name} · {outfit.pieceCount} pieces</option>)}</select><input aria-label="Outfit title" placeholder="Outfit title" value={title} onChange={event=>setTitle(event.target.value)} required/><input aria-label="Caption" placeholder="What made this outfit work?" value={caption} onChange={event=>setCaption(event.target.value)} required/><button className="button button-accent">Publish selected outfit</button></form>:<div className="community-signin"><span>Save an outfit in your Consumer dashboard before publishing.</span><Link className="button button-dark button-small" href="/consumer">Build an outfit</Link></div>):<div className="community-signin"><span>Want to share or recreate an outfit?</span><Link className="button button-dark button-small" href="/login">Consumer sign in</Link></div>}
    {error&&<div className="form-error" role="alert">{error}</div>}
    {posts.length===0?<div className="empty-wardrobe"><h2>No public outfits yet.</h2><p>Be the first to share a look built from your saved wardrobe.</p></div>:<div className="community-grid">{posts.map(post=>{
      const recreated=recreations[post.id];
      return <article className="social-card" key={post.id}><div className="social-image">{post.image?<img src={post.image} alt={post.outfitTitle}/>:<div className="social-image-empty">Image unavailable</div>}</div><div className="social-copy"><div className="social-author"><span>{post.handle}</span><span>{post.dataClassification==="DEMO"||post.fictional?"SYNTHETIC DEMO":post.sourceType==="brand"?"BRAND LOOK":"CONSUMER LOOK"}</span></div><h2>{post.outfitTitle}</h2><p>{post.caption}</p><div className="social-products">{post.garments.map(garment=>garment.verifiedProduct?<div key={garment.publicGarmentId}><span>{garment.verifiedProduct.brand}</span><strong>{garment.name}</strong><small>{garment.verifiedProduct.sku} · Verified product</small><Link href={`/brands/${garment.verifiedProduct.brandSlug}`}>View brand →</Link>{garment.verifiedProduct.outboundUrl&&<a href={garment.verifiedProduct.outboundUrl} rel="nofollow sponsored">Shop exact product ↗</a>}{garment.verifiedProduct.commerceState==="EXACT_UNAVAILABLE"&&<small>Exact product unavailable</small>}</div>:<div key={garment.publicGarmentId}><span>UNVERIFIED GARMENT</span><strong>{garment.name}</strong><small>{garment.subtype??garment.category}{garment.unverifiedBrandLabel?` · label: ${garment.unverifiedBrandLabel}`:""}</small></div>)}</div>
        {canPost&&post.garments.length>0&&<button type="button" className="button button-dark button-small" disabled={pendingRecreate===post.id} onClick={()=>recreate(post.id)}>{pendingRecreate===post.id?"Comparing your wardrobe…":"Recreate this look"}</button>}
        {recreated&&<div className="recreate-result" aria-live="polite"><strong>{recreated.coveragePercentage}% wardrobe coverage</strong><small>{recreated.coveredPieces} of {recreated.totalPieces} pieces have an owned option</small>{recreated.pieces.map(piece=><span key={piece.target.publicGarmentId}>{piece.state.replaceAll("_"," ")} · {piece.target.name}{piece.ownedItem?` → ${piece.ownedItem.name}`:""}</span>)}</div>}
        <button type="button" className="like-button" disabled={pendingLike===post.id} onClick={()=>like(post.id)}>♡ {post.likes} {pendingLike===post.id?"saving…":"inspired"}</button></div></article>;
    })}</div>}
  </>;
}
