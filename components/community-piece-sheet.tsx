/* eslint-disable @next/next/no-img-element */
"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { looksWithProduct, pieceCard, postPhoto } from "@/lib/community-piece";
import type { OutfitPost, PublicOutfitGarment } from "@/lib/platform-types";

/**
 * A piece opened from a post. Price and the way to buy come only from the catalog product the piece
 * is verified as; a closet piece says plainly that it is not for sale. "Seen in these looks" lists the
 * other posts with the same exact product, so a brand's look and a member's look lead to one product.
 */
export function CommunityPieceSheet({ garment, post, posts, onClose, onOpenPost }: { garment: PublicOutfitGarment; post: OutfitPost; posts: OutfitPost[]; onClose: () => void; onOpenPost: (postId: string) => void }) {
  const card = pieceCard(garment);
  const closeButton = useRef<HTMLButtonElement>(null);
  const others = looksWithProduct(posts, card.registryProductId, post.id);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return <div className="piece-backdrop" onClick={onClose}>
    <div className="piece-sheet" role="dialog" aria-modal="true" aria-labelledby="piece-title" onClick={(event) => event.stopPropagation()}>
      <div className="piece-sheet-head">
        <h2 id="piece-title">Item</h2>
        <button ref={closeButton} type="button" className="text-button" onClick={onClose}>Close</button>
      </div>

      <div className="piece-sheet-main">
        <div className="piece-sheet-image">{card.thumb ? <img src={card.thumb} alt={card.name} /> : <span aria-hidden="true">{card.name.slice(0, 1)}</span>}</div>
        <div className="piece-sheet-info">
          <h3>{card.name}</h3>
          {card.brand && (card.brandSlug ? <Link className="piece-brand" href={`/brands/${card.brandSlug}`}>{card.brand}</Link> : <span className="piece-brand">{card.brand}</span>)}
          {card.price
            ? <p className="piece-sheet-price">{card.price}</p>
            : <p className="piece-sheet-closet">{card.kind === "catalog" ? "No price listed for this product." : "From a personal closet. Not for sale."}</p>}
          <span className={`shop-badge tone-${card.language.tone}`}>{card.language.label}</span>
          <p className="piece-sheet-detail">{card.language.detail}</p>
          {(garment.color || garment.material) && <p className="piece-sheet-attrs">{[garment.color, garment.material].filter(Boolean).join(" · ")}</p>}
          {card.outboundUrl && <a className="button button-accent" href={card.outboundUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">Shop on brand site ↗</a>}
        </div>
      </div>

      {others.length > 0 && <section className="piece-seen" aria-label="Seen in these looks">
        <h3>Seen in these looks</h3>
        <ul>{others.map((other) => {
          const photo = postPhoto(other) ?? other.garments.find((item) => item.image)?.image ?? "";
          return <li key={other.id}><button type="button" onClick={() => onOpenPost(other.id)} aria-label={`Go to ${other.outfitTitle}`}>
            {photo ? <img src={photo} alt="" loading="lazy" /> : <span aria-hidden="true" />}
            <small>{other.outfitTitle}</small>
          </button></li>;
        })}</ul>
      </section>}
    </div>
  </div>;
}
