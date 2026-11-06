import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isCommunityAuthorKey, looksByAuthor } from "@/lib/community-author";
import { authorInitials, authorName } from "@/lib/community-piece";
import { getConsumerInspirationProfile, listCommunityPosts, listOutfits, listOwnCommunityPostIds } from "@/lib/server/production-store";
import { stripeTestKey } from "@/lib/test-checkout";
import { AppShell } from "@/components/app-shell";
import { CommunityFeed } from "@/components/community-feed";
import { WorkspaceMobileNav } from "@/components/workspace-mobile-nav";

// A member's page is reachable from their looks, but it is not a page search engines should list.
export const metadata: Metadata = { title: "Shared looks", robots: { index: false, follow: false } };

/** One member's Community profile: the looks they chose to publish, and nothing else from their account. */
export default async function CommunityProfilePage({ params }: { params: Promise<{ author: string }> }) {
  const { author } = await params;
  if (!isCommunityAuthorKey(author)) notFound();
  const looks = looksByAuthor(await listCommunityPosts(), author);
  if (looks.length === 0) notFound();
  const name = authorName(looks[0]);
  const profile = { name, initials: authorInitials(name) };

  const session = await getSession();
  const consumer = session?.role === "consumer" ? session.subject : null;
  const [outfits, inspiration, ownPostIds] = await Promise.all([
    consumer ? listOutfits(consumer) : Promise.resolve([]),
    consumer ? getConsumerInspirationProfile(consumer) : Promise.resolve({ postIds: [] }),
    consumer ? listOwnCommunityPostIds(consumer) : Promise.resolve([]),
  ]);
  const feed = <CommunityFeed profile={profile} testCheckout={Boolean(stripeTestKey(process.env.STRIPE_SECRET_KEY))} initialPosts={looks} canPost={session?.role === "consumer"} initialInspiredPostIds={inspiration.postIds} initialOwnPostIds={ownPostIds} savedOutfits={outfits.map((outfit) => ({ id: outfit.id, name: outfit.name, pieceCount: outfit.itemIds.length }))} />;
  if (session) return <AppShell role={session.role}><main className="community-page">{feed}</main><WorkspaceMobileNav role={session.role} active="community" /></AppShell>;
  return <main className="community-page"><header className="community-nav"><Link className="wordmark" href="/">RACKED<span>.</span></Link><nav><Link href="/community">Community</Link><Link href="/login">Sign in</Link></nav></header>{feed}</main>;
}
