/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { dataLabel, hasShoppablePiece, provenanceLabel } from "@/lib/look-language";
import { RecreatePanel } from "./recreate-panel";
import { ShopTheLook } from "./shop-the-look";
import { availableCategories, availableStyles, filterLooks, type LookCategory, type LookStyle } from "@/lib/look-discovery";
import type { OutfitPost } from "@/lib/platform-types";
import type { RecreateLookResult } from "@/lib/recreate-look";

interface SavedOutfitOption { id:string; name:string; pieceCount:number }
type Filter = "all" | "consumer" | "brand";

function OutfitGallery({ post }: { post: OutfitPost }) {
  const images = post.garments.filter((garment) => garment.image);
  if (images.length === 0) return <div className="look-gallery-empty">Outfit image unavailable</div>;
  if (images.length === 1) return <div className="look-hero-single"><img src={images[0].image} alt={post.outfitTitle} /></div>;
  return <div className="look-gallery" role="group" aria-label={`${post.outfitTitle}: ${images.length} pieces`}>
    {images.map((garment) => <figure key={garment.publicGarmentId}>
      <img src={garment.image} alt={garment.name} />
    </figure>)}
  </div>;
}

export function CommunityFeed({initialPosts,canPost,initialInspiredPostIds,savedOutfits}:{initialPosts:OutfitPost[];canPost:boolean;initialInspiredPostIds:string[];savedOutfits:SavedOutfitOption[]}) {
  const [posts,setPosts]=useState(initialPosts);
  const [title,setTitle]=useState("");
  const [caption,setCaption]=useState("");
  const [outfitId,setOutfitId]=useState(savedOutfits[0]?.id??"");
  const [composerOpen,setComposerOpen]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState<Filter>("all");
  const [style,setStyle]=useState<LookStyle|"all">("all");
  const [category,setCategory]=useState<LookCategory|"all">("all");
  const [query,setQuery]=useState("");
  const [pendingLike,setPendingLike]=useState<string|null>(null);
  const [inspiredPostIds,setInspiredPostIds]=useState(()=>new Set(initialInspiredPostIds));
  const [pendingRecreate,setPendingRecreate]=useState<string|null>(null);
  const [recreations,setRecreations]=useState<Record<string,RecreateLookResult>>({});
  const [shopping,setShopping]=useState<OutfitPost|null>(null);

  // Style and category options are derived from what has actually been published, so
  // the feed never offers a filter that would return nothing.
  const styleOptions=useMemo(()=>availableStyles(posts),[posts]);
  const categoryOptions=useMemo(()=>availableCategories(posts),[posts]);
  const visible=useMemo(()=>filterLooks(posts,{source:filter,style,category,query}),[posts,filter,style,category,query]);
  const filtersActive=filter!=="all"||style!=="all"||category!=="all"||query.trim().length>0;
  function clearFilters(){setFilter("all");setStyle("all");setCategory("all");setQuery("");}

  async function publish(event:FormEvent){
    event.preventDefault();setError("");
    const response=await fetch("/api/community",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({outfitTitle:title,caption,outfitId})});
    const data=await response.json();
    if(!response.ok){setError(data.error??"Post could not be published.");return;}
    setPosts(current=>[data.post,...current]);setTitle("");setCaption("");setComposerOpen(false);
  }
  async function like(postId:string){
    setPendingLike(postId);setError("");
    try{const response=await fetch("/api/community",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({postId})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Inspiration could not be saved.");setPosts(current=>current.map(item=>item.id===postId?{...item,likes:data.likes}:item));if(data.inspired)setInspiredPostIds(current=>new Set([...current,postId]));}
    catch(reason){setError(reason instanceof Error?reason.message:"Like could not be recorded.");}finally{setPendingLike(null);}
  }
  async function recreate(postId:string){
    setPendingRecreate(postId);setError("");
    try{const response=await fetch(`/api/community/${encodeURIComponent(postId)}/recreate`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error??"The look could not be compared.");setRecreations(current=>({...current,[postId]:data.result}));}
    catch(reason){setError(reason instanceof Error?reason.message:"The look could not be compared.");}finally{setPendingRecreate(null);}
  }

  return <>
    <section className="community-hero">
      <div className="eyebrow">OUTFIT DISCOVERY</div>
      <h1>See the outfit.<br/><em>Then check your closet.</em></h1>
      <p>Every look here was explicitly published by the person or brand who built it. Open one and Racked will tell you how much of it you can already wear from your own wardrobe.</p>
    </section>

    <div className="community-toolbar">
      <div className="filter-row" role="group" aria-label="Filter looks">
        <button type="button" className={filter==="all"?"active":""} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>All looks</button>
        <button type="button" className={filter==="consumer"?"active":""} aria-pressed={filter==="consumer"} onClick={()=>setFilter("consumer")}>Community</button>
        <button type="button" className={filter==="brand"?"active":""} aria-pressed={filter==="brand"} onClick={()=>setFilter("brand")}>Brand</button>
      </div>
      {canPost
        ? savedOutfits.length
          ? <button type="button" className="button button-accent button-small" aria-expanded={composerOpen} onClick={()=>setComposerOpen(value=>!value)}>{composerOpen?"Cancel":"Share a saved outfit"}</button>
          : <Link className="button button-dark button-small" href="/consumer">Build an outfit first</Link>
        : <Link className="button button-dark button-small" href="/login">Sign in to recreate</Link>}
    </div>

    <div className="look-discovery">
      <label className="look-search">
        <span className="sr-only">Search looks</span>
        <input type="search" value={query} placeholder="Search looks, pieces, colours, or brands" onChange={event=>setQuery(event.target.value)}/>
      </label>

      {styleOptions.length>0&&<div className="discovery-row">
        <span className="eyebrow">Style</span>
        <div className="discovery-chips" role="group" aria-label="Filter looks by style">
          <button type="button" className={style==="all"?"active":""} aria-pressed={style==="all"} onClick={()=>setStyle("all")}>All styles</button>
          {styleOptions.map(option=><button type="button" key={option.id} className={style===option.id?"active":""} aria-pressed={style===option.id} title={option.description} onClick={()=>setStyle(option.id)}>{option.label} <i>{option.count}</i></button>)}
        </div>
      </div>}

      {categoryOptions.length>0&&<div className="discovery-row">
        <span className="eyebrow">Piece</span>
        <div className="discovery-chips" role="group" aria-label="Filter looks by garment category">
          <button type="button" className={category==="all"?"active":""} aria-pressed={category==="all"} onClick={()=>setCategory("all")}>Any piece</button>
          {categoryOptions.map(option=><button type="button" key={option.category} className={category===option.category?"active":""} aria-pressed={category===option.category} onClick={()=>setCategory(option.category)}>{option.category} <i>{option.count}</i></button>)}
        </div>
      </div>}

      <p className="discovery-summary" aria-live="polite">
        {`Showing ${visible.length} of ${posts.length} look${posts.length===1?"":"s"}`}
        {filtersActive&&<button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}
      </p>
    </div>

    {canPost&&composerOpen&&savedOutfits.length>0&&<form className="post-composer" onSubmit={publish}>
      <div><strong>Share a saved outfit</strong><span>Only the pieces in the outfit you pick become public. Nothing else in your wardrobe is exposed.</span></div>
      <select aria-label="Saved outfit" value={outfitId} onChange={event=>setOutfitId(event.target.value)} required>{savedOutfits.map(outfit=><option key={outfit.id} value={outfit.id}>{outfit.name} · {outfit.pieceCount} pieces</option>)}</select>
      <input aria-label="Outfit title" placeholder="Outfit title" value={title} onChange={event=>setTitle(event.target.value)} required/>
      <input aria-label="Caption" placeholder="What made this outfit work?" value={caption} onChange={event=>setCaption(event.target.value)} required/>
      <button className="button button-accent">Publish this outfit</button>
    </form>}

    {error&&<div className="form-error" role="alert">{error}</div>}

    {visible.length===0
      ? <div className="empty-wardrobe"><h2>{posts.length===0?"No public outfits yet.":"No looks match this search."}</h2><p>{posts.length===0?"Be the first to share a look built from your saved wardrobe.":"Try a different style, piece, or search term."}</p>{filtersActive&&posts.length>0&&<button type="button" className="button button-accent" onClick={clearFilters}>Clear filters</button>}</div>
      : <div className="look-grid">{visible.map(post=>{
        const provenance=provenanceLabel(post.sourceType);
        const synthetic=dataLabel(post);
        const recreated=recreations[post.id];
        const shoppable=hasShoppablePiece(post.garments);
        const verifiedCount=post.garments.filter(garment=>garment.verifiedProduct).length;
        return <article className={`look-card source-${provenance.kind}`} key={post.id}>
          <OutfitGallery post={post}/>
          <div className="look-body">
            <div className="look-meta">
              <span className={`look-source ${provenance.kind}`} title={provenance.description}>{provenance.label}</span>
              {post.sourceType==="brand"&&post.products[0]
                ? <Link className="look-handle" href={`/brands/${post.products[0].brandSlug}`}>{post.products[0].brand}</Link>
                : <span className="look-handle">{post.handle}</span>}
              {synthetic&&<span className="look-demo" title={synthetic.detail}>{synthetic.label}</span>}
            </div>
            <h2>{post.outfitTitle}</h2>
            <p className="look-caption">{post.caption}</p>
            <p className="look-pieces">{post.garments.length} piece{post.garments.length===1?"":"s"}{verifiedCount>0?` · ${verifiedCount} verified product${verifiedCount===1?"":"s"}`:""}</p>

            <div className="look-actions">
              {canPost
                ? <button type="button" className="button button-accent button-small" disabled={pendingRecreate===post.id||post.garments.length===0} onClick={()=>recreate(post.id)}>{pendingRecreate===post.id?"Checking your wardrobe…":"Recreate with my wardrobe"}</button>
                : <Link className="button button-accent button-small" href="/login">Recreate with my wardrobe</Link>}
              {shoppable&&<button type="button" className="button button-light button-small" onClick={()=>setShopping(post)}>Shop the look</button>}
              <button type="button" className="like-button" disabled={pendingLike===post.id||inspiredPostIds.has(post.id)} onClick={()=>like(post.id)} aria-label={inspiredPostIds.has(post.id)?`${post.outfitTitle} is saved as Hanger inspiration.`:`Save ${post.outfitTitle} as Hanger inspiration. Currently ${post.likes}.`}>{inspiredPostIds.has(post.id)?"♥ Inspired":`♡ ${post.likes}`}{pendingLike===post.id?" saving…":""}</button>
            </div>

            {recreated&&<RecreatePanel result={recreated} canShop={shoppable} onShop={()=>setShopping(post)}/>}
          </div>
        </article>;
      })}</div>}

    {shopping&&<ShopTheLook post={shopping} onClose={()=>setShopping(null)}/>}
  </>;
}
