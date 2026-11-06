/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { dataLabel, hasShoppablePiece, provenanceLabel } from "@/lib/look-language";
import { authorInitials, authorName, pieceCard, postPhoto, timeAgo } from "@/lib/community-piece";
import { RecreatePanel } from "./recreate-panel";
import type { OutfitPost, PublicOutfitGarment } from "@/lib/platform-types";
import type { RecreateLookResult } from "@/lib/recreate-look";

/** The person wearing the outfit, or, for a post without that photo, its pieces side by side. */
function PostPhoto({ post }: { post: OutfitPost }) {
  const photo = postPhoto(post);
  if (photo) return <div className="cpost-photo"><img src={photo} alt={`${post.outfitTitle}, worn`} loading="lazy" /></div>;
  const images = post.garments.filter((garment) => garment.image);
  if (images.length === 0) return <div className="cpost-photo cpost-photo-empty">Outfit image unavailable</div>;
  return <div className="cpost-collage" role="group" aria-label={`${post.outfitTitle}: ${images.length} piece${images.length === 1 ? "" : "s"}`}>
    {images.slice(0, 4).map((garment) => <figure key={garment.publicGarmentId}><img src={garment.image} alt={garment.name} loading="lazy" /></figure>)}
  </div>;
}

export interface CommunityPostCardProps {
  post: OutfitPost;
  canPost: boolean;
  isOwn: boolean;
  /** False on the person's own profile page, where the name would link to the page already open. */
  linkAuthor?: boolean;
  confirmingUnpublish: boolean;
  pendingUnpublish: boolean;
  pendingLike: boolean;
  inspired: boolean;
  pendingRecreate: boolean;
  recreated?: RecreateLookResult;
  onLike: () => void;
  onRecreate: () => void;
  onShop: () => void;
  onOpenPiece: (garment: PublicOutfitGarment) => void;
  onAskUnpublish: () => void;
  onCancelUnpublish: () => void;
  onConfirmUnpublish: () => void;
}

/**
 * One post, the same layout for brands and members: who posted it, the photo of the outfit, then
 * "Pieces in This Look" directly beneath it, always visible. A piece shows a price only when the
 * catalog gives one for the exact product (lib/community-piece.ts); tapping any piece opens its detail.
 */
export function CommunityPostCard(props: CommunityPostCardProps) {
  const { post, canPost } = props;
  const provenance = provenanceLabel(post.sourceType);
  const synthetic = dataLabel(post);
  const name = authorName(post);
  const brand = post.sourceType === "brand";
  const pieces = post.garments.map((garment) => ({ garment, card: pieceCard(garment) }));
  const profileHref = !brand && post.authorKey && props.linkAuthor !== false ? `/community/people/${post.authorKey}` : null;
  return <article className={`cpost source-${provenance.kind}`} id={`post-${post.id}`}>
    <header className="cpost-head">
      {profileHref
        ? <Link className="cpost-avatar" href={profileHref} aria-hidden="true" tabIndex={-1}>{authorInitials(name)}</Link>
        : <span className="cpost-avatar" aria-hidden="true">{authorInitials(name)}</span>}
      <div className="cpost-who">
        {brand && post.products[0]
          ? <Link href={`/brands/${post.products[0].brandSlug}`}>{name}</Link>
          : profileHref ? <Link href={profileHref}>{name}</Link> : <strong>{name}</strong>}
        {brand && <span className="cpost-verified" title={provenance.description}>Brand</span>}
        <small>{timeAgo(post.createdAt)}{synthetic ? ` · ${synthetic.label}` : ""}</small>
      </div>
      <span className={`look-source ${provenance.kind}`} title={provenance.description}>{provenance.label}</span>
    </header>

    <div className="cpost-text"><h2>{post.outfitTitle}</h2><p>{post.caption}</p></div>

    <PostPhoto post={post} />

    {pieces.length > 0 && <section className="cpost-pieces" aria-label="Pieces in this look">
      <h3>Pieces in this look</h3>
      <ul>{pieces.map(({ garment, card }) => <li key={card.id}>
        <button type="button" className="piece-card" onClick={() => props.onOpenPiece(garment)}>
          <span className="piece-thumb">{card.thumb ? <img src={card.thumb} alt="" loading="lazy" /> : <span aria-hidden="true">{card.name.slice(0, 1)}</span>}</span>
          <span className="piece-name">{card.name}</span>
          <span className={`piece-price${card.price ? "" : " none"}`}>{card.price ?? (card.kind === "catalog" ? card.brand : "Closet piece")}</span>
        </button>
      </li>)}</ul>
    </section>}

    <div className="cpost-actions">
      <button type="button" className="like-button" disabled={props.pendingLike || props.inspired} onClick={props.onLike} title={props.inspired ? `${post.outfitTitle} is saved as Hanger inspiration` : `Save ${post.outfitTitle} as Hanger inspiration`}><span aria-hidden="true">{props.inspired ? "♥ " : "♡ "}</span>{props.inspired ? "Saved" : `Save look · ${post.likes}`}{props.pendingLike ? " saving…" : ""}</button>
      {canPost
        ? <button type="button" className="button button-accent button-small" disabled={props.pendingRecreate || post.garments.length === 0} onClick={props.onRecreate}>{props.pendingRecreate ? "Checking your wardrobe…" : "Recreate with my wardrobe"}</button>
        : <Link className="button button-accent button-small" href="/login">Recreate with my wardrobe</Link>}
      {hasShoppablePiece(post.garments) && <button type="button" className="button button-light button-small" onClick={props.onShop}>Shop the look</button>}
    </div>

    {props.isOwn && <div className="look-owner-actions">
      {props.confirmingUnpublish
        ? <><button type="button" className="button button-small confirm-unpublish" disabled={props.pendingUnpublish} onClick={props.onConfirmUnpublish}>{props.pendingUnpublish ? "Taking it down…" : "Confirm unpublish"}</button><button type="button" className="text-button" onClick={props.onCancelUnpublish}>Cancel</button><small>This takes the look out of Community for everyone. Your saved outfit and wardrobe stay as they are; anyone who saved it as inspiration keeps only the style words, never a photo or your name.</small></>
        : <button type="button" className="text-button" aria-label={`Unpublish ${post.outfitTitle} from Community`} onClick={props.onAskUnpublish}>Your look · Unpublish</button>}
    </div>}

    {props.recreated && <RecreatePanel result={props.recreated} canShop={hasShoppablePiece(post.garments)} onShop={props.onShop} />}
  </article>;
}
