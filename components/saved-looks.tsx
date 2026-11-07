/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CommunityPostCard } from "./community-post-card";
import { CommunityPieceSheet } from "./community-piece-sheet";
import { ShopTheLook } from "./shop-the-look";
import { authorName, postPhoto } from "@/lib/community-piece";
import { savedLabel } from "@/lib/outfit-detail";
import { createSaveToggle, saveLookRequest } from "@/lib/save-toggle";
import type { SavedLookCard } from "@/lib/saved-looks";
import type { OutfitPost, PublicOutfitGarment } from "@/lib/platform-types";
import type { RecreateLookResult } from "@/lib/recreate-look";

/**
 * "Saved from Community" on the Outfits tab: looks other people published that this person hearted.
 * They are someone else's clothes, so they are kept apart from the person's own saved outfits: no
 * wear button, no wear count, and nothing here is part of the wardrobe Hanger builds from.
 */

function thumbsOf(post: OutfitPost) {
  const photo = postPhoto(post);
  if (photo) return [photo];
  return post.garments.map((garment) => garment.image).filter(Boolean).slice(0, 4);
}

export function SavedLookList({ looks, onOpen }: { looks: SavedLookCard[]; onOpen: (look: SavedLookCard) => void }) {
  return <ul className="outfit-list saved-look-list">{looks.map((look) => <li key={look.postId}>
    <button type="button" className="outfit-row" onClick={() => onOpen(look)}>
      {look.kind === "live"
        ? <>
          <span className="outfit-row-text">
            <strong>{look.post.outfitTitle}</strong>
            <small>By {authorName(look.post)} · {savedLabel(look.savedAt)}</small>
          </span>
          <span className="outfit-row-thumbs" aria-hidden="true">{thumbsOf(look.post).map((src) => <span key={src}><img src={src} alt="" loading="lazy" /></span>)}</span>
        </>
        : <span className="outfit-row-text">
          <strong>No longer in Community</strong>
          <small>Style words kept: {look.styleWords.slice(0, 5).join(", ")}</small>
        </span>}
      <span className="outfit-row-chevron" aria-hidden="true">›</span>
    </button>
  </li>)}</ul>;
}

export function SavedLooksSection({ looks, loadError, onOpen }: { looks: SavedLookCard[] | null; loadError: string; onOpen: (look: SavedLookCard) => void }) {
  return <section className="saved-looks" aria-labelledby="saved-looks-title">
    <div className="section-title"><div><div className="eyebrow">SAVED FROM COMMUNITY</div><h2 id="saved-looks-title">{looks === null ? "Saved looks" : `${looks.length} saved look${looks.length === 1 ? "" : "s"}`}</h2></div></div>
    <p className="saved-looks-note">Looks you hearted in Community. They are other people&rsquo;s clothes, so they are not in your wardrobe and are never logged as wears.</p>
    {loadError
      ? <div className="form-error" role="alert">{loadError}</div>
      : looks === null
        ? <p className="saved-looks-note" role="status">Loading saved looks…</p>
        : looks.length === 0
          ? <div className="empty-match"><h3>No saved looks yet.</h3><p>Tap the heart on a look in Community to keep it here.</p><Link className="button button-light" href="/community">Browse Community</Link></div>
          : <SavedLookList looks={looks} onOpen={onOpen} />}
  </section>;
}

/** One saved look: the post as Community shows it, with Recreate and Shop the look where available. */
export function SavedLookDetail({ look, onBack, onSavedChange }: { look: SavedLookCard; onBack: () => void; onSavedChange: (postId: string, saved: boolean) => void }) {
  const [post, setPost] = useState<OutfitPost | null>(look.kind === "live" ? look.post : null);
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recreated, setRecreated] = useState<RecreateLookResult | undefined>();
  const [pendingRecreate, setPendingRecreate] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [openPiece, setOpenPiece] = useState<PublicOutfitGarment | null>(null);
  const toggle = useMemo(() => createSaveToggle(saveLookRequest), []);

  async function toggleSave() {
    setError(""); setNotice(""); setPending(true);
    try {
      const answer = await toggle.toggle(look.postId, { saved, likes: post?.likes ?? 0 }, (state) => {
        setSaved(state.saved);
        setPost((current) => current ? { ...current, likes: state.likes } : current);
      });
      if (answer) { onSavedChange(look.postId, answer.saved); setNotice(answer.saved ? "Saved to your Outfits again." : "Removed from your Outfits. Tap the heart to keep it after all."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The look could not be changed."); }
    finally { setPending(false); }
  }

  async function recreate() {
    if (!post) return;
    setPendingRecreate(true); setError("");
    try {
      const response = await fetch(`/api/community/${encodeURIComponent(post.id)}/recreate`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The look could not be compared.");
      setRecreated(data.result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The look could not be compared."); }
    finally { setPendingRecreate(false); }
  }

  return <article className="outfit-detail saved-look-detail">
    <header className="outfit-detail-head">
      <button type="button" className="outfit-back" aria-label="Back to Outfits" onClick={onBack}><span aria-hidden="true">‹</span></button>
      <div className="outfit-detail-title">
        <div className="eyebrow">SAVED FROM COMMUNITY</div>
        <h2>{post ? post.outfitTitle : "No longer in Community"}</h2>
        <p>{savedLabel(look.savedAt)}</p>
      </div>
    </header>

    {error && <div className="form-error" role="alert">{error}</div>}
    <div role="status" className={notice ? "agent-action-status" : "sr-only"}>{notice}</div>

    {post
      ? <div className="cfeed"><CommunityPostCard post={post} canPost saveMode="toggle" isOwn={false} confirmingUnpublish={false} pendingUnpublish={false}
        pendingLike={pending} inspired={saved} pendingRecreate={pendingRecreate} recreated={recreated}
        onLike={toggleSave} onRecreate={recreate} onShop={() => setShopping(true)} onOpenPiece={setOpenPiece}
        onAskUnpublish={() => undefined} onCancelUnpublish={() => undefined} onConfirmUnpublish={() => undefined} /></div>
      : look.kind === "gone" && <section className="saved-look-gone">
        <p>This look is no longer in Community, so its photo, pieces and who shared it are no longer shown. You kept only its style words, which Hanger can use as a hint.</p>
        <ul className="saved-look-words">{look.styleWords.map((word) => <li key={word}>{word}</li>)}</ul>
        {saved
          ? <button type="button" className="button button-dark" disabled={pending} onClick={toggleSave}>{pending ? "Removing…" : "Remove from my Outfits"}</button>
          : <p className="saved-looks-note">Removed. It will not come back, because the look is no longer in Community.</p>}
      </section>}

    {post && shopping && <ShopTheLook post={post} onClose={() => setShopping(false)} />}
    {post && openPiece && <CommunityPieceSheet garment={openPiece} post={post} posts={[post]} testCheckout={false} onClose={() => setOpenPiece(null)} onOpenPost={() => setOpenPiece(null)} />}
  </article>;
}
