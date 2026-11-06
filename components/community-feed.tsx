"use client";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BackButton } from "./back-button";
import { CommunityPostCard } from "./community-post-card";
import { CommunityPieceSheet } from "./community-piece-sheet";
import { ShopTheLook } from "./shop-the-look";
import { availableCategories, availableStyles, filterLooks, type LookCategory, type LookStyle } from "@/lib/look-discovery";
import type { OutfitPost, PublicOutfitGarment } from "@/lib/platform-types";
import type { RecreateLookResult } from "@/lib/recreate-look";

interface SavedOutfitOption { id:string; name:string; pieceCount:number }
type Filter = "all" | "consumer" | "brand";

export function CommunityFeed({profile,initialPosts,canPost,initialInspiredPostIds,initialOwnPostIds,savedOutfits,testCheckout=false}:{profile?:{name:string;initials:string};initialPosts:OutfitPost[];canPost:boolean;initialInspiredPostIds:string[];initialOwnPostIds:string[];savedOutfits:SavedOutfitOption[];testCheckout?:boolean}) {
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
  // The piece whose detail is open, with the post it was opened from.
  const [openPiece,setOpenPiece]=useState<{garment:PublicOutfitGarment;post:OutfitPost}|null>(null);
  // Looks this person published. Only they see an Unpublish control, and only on their own posts.
  const [ownPostIds,setOwnPostIds]=useState(()=>new Set(initialOwnPostIds));
  const [confirmUnpublishId,setConfirmUnpublishId]=useState<string|null>(null);
  const [pendingUnpublish,setPendingUnpublish]=useState<string|null>(null);
  const [notice,setNotice]=useState("");

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
    setPosts(current=>[data.post,...current]);setOwnPostIds(current=>new Set([...current,data.post.id]));setTitle("");setCaption("");setComposerOpen(false);
  }
  async function like(postId:string){
    setPendingLike(postId);setError("");
    try{const response=await fetch("/api/community",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({postId})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Inspiration could not be saved.");setPosts(current=>current.map(item=>item.id===postId?{...item,likes:data.likes}:item));if(data.inspired)setInspiredPostIds(current=>new Set([...current,postId]));}
    catch(reason){setError(reason instanceof Error?reason.message:"Like could not be recorded.");}finally{setPendingLike(null);}
  }
  async function unpublish(post:OutfitPost){
    setPendingUnpublish(post.id);setError("");setNotice("");
    try{
      const response=await fetch(`/api/community/${encodeURIComponent(post.id)}`,{method:"DELETE"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error??"The look could not be taken down.");
      setPosts(current=>current.filter(item=>item.id!==post.id));
      setOwnPostIds(current=>{const next=new Set(current);next.delete(post.id);return next;});
      setConfirmUnpublishId(null);
      setNotice(`"${post.outfitTitle}" is no longer in Community. Your outfit and wardrobe are unchanged.`);
    }catch(reason){setError(reason instanceof Error?reason.message:"The look could not be taken down.");}
    finally{setPendingUnpublish(null);}
  }
  async function recreate(postId:string){
    setPendingRecreate(postId);setError("");
    try{const response=await fetch(`/api/community/${encodeURIComponent(postId)}/recreate`,{method:"POST"});const data=await response.json();if(!response.ok)throw new Error(data.error??"The look could not be compared.");setRecreations(current=>({...current,[postId]:data.result}));}
    catch(reason){setError(reason instanceof Error?reason.message:"The look could not be compared.");}finally{setPendingRecreate(null);}
  }

  return <>
    {profile
      ? <section className="cprofile">
        <BackButton fallback="/community"/>
        <div className="cprofile-who">
          <span className="cpost-avatar" aria-hidden="true">{profile.initials}</span>
          <div><h1>{profile.name}</h1><p>{posts.length} shared look{posts.length===1?"":"s"}</p></div>
        </div>
      </section>
      : <><section className="community-hero">
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
    </div></>}

    {canPost&&composerOpen&&savedOutfits.length>0&&<form className="post-composer" onSubmit={publish}>
      <div><strong>Share a saved outfit</strong><span>Only the pieces in the outfit you pick become public, and the look also appears on your Community profile. Nothing else in your wardrobe is exposed.</span></div>
      <select aria-label="Saved outfit" value={outfitId} onChange={event=>setOutfitId(event.target.value)} required>{savedOutfits.map(outfit=><option key={outfit.id} value={outfit.id}>{outfit.name} · {outfit.pieceCount} pieces</option>)}</select>
      <input aria-label="Outfit title" placeholder="Outfit title" value={title} onChange={event=>setTitle(event.target.value)} required/>
      <input aria-label="Caption" placeholder="What made this outfit work?" value={caption} onChange={event=>setCaption(event.target.value)} required/>
      <button className="button button-accent">Publish this outfit</button>
    </form>}

    {error&&<div className="form-error" role="alert">{error}</div>}
    {notice&&<div className="agent-action-status" role="status">✓ {notice}</div>}

    {visible.length===0
      ? <div className="empty-wardrobe"><h2>{posts.length===0?(profile?"No shared looks here any more.":"No public outfits yet."):"No looks match this search."}</h2><p>{posts.length===0?"Be the first to share a look built from your saved wardrobe.":"Try a different style, piece, or search term."}</p>{filtersActive&&posts.length>0&&<button type="button" className="button button-accent" onClick={clearFilters}>Clear filters</button>}</div>
      : <div className="cfeed">{visible.map(post=><CommunityPostCard key={post.id} post={post} canPost={canPost}
        isOwn={ownPostIds.has(post.id)} linkAuthor={!profile} confirmingUnpublish={confirmUnpublishId===post.id} pendingUnpublish={pendingUnpublish===post.id}
        pendingLike={pendingLike===post.id} inspired={inspiredPostIds.has(post.id)} pendingRecreate={pendingRecreate===post.id} recreated={recreations[post.id]}
        onLike={()=>like(post.id)} onRecreate={()=>recreate(post.id)} onShop={()=>setShopping(post)} onOpenPiece={garment=>setOpenPiece({garment,post})}
        onAskUnpublish={()=>setConfirmUnpublishId(post.id)} onCancelUnpublish={()=>setConfirmUnpublishId(null)} onConfirmUnpublish={()=>unpublish(post)}/>)}</div>}

    {openPiece&&<CommunityPieceSheet garment={openPiece.garment} post={openPiece.post} posts={posts} testCheckout={testCheckout} onClose={()=>setOpenPiece(null)}
      onOpenPost={postId=>{setOpenPiece(null);window.setTimeout(()=>document.getElementById(`post-${postId}`)?.scrollIntoView({behavior:"smooth",block:"start"}),50);}}/>}

    {shopping&&<ShopTheLook post={shopping} onClose={()=>setShopping(null)}/>}
  </>;
}
