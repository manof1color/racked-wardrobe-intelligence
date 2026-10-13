import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getConsumerInspirationProfile, listCommunityPosts, listOutfits, listOwnCommunityPostIds } from "@/lib/server/production-store";
import { CommunityFeed } from "@/components/community-feed";
import { AppShell } from "@/components/app-shell";
import { WorkspaceMobileNav } from "@/components/workspace-mobile-nav";

export const metadata:Metadata={title:"Outfit community"};
export default async function CommunityPage(){
  const session=await getSession();
  const consumer=session?.role==="consumer"?session.subject:null;
  const [posts,outfits,inspiration,ownPostIds]=await Promise.all([listCommunityPosts(),consumer?listOutfits(consumer):Promise.resolve([]),consumer?getConsumerInspirationProfile(consumer):Promise.resolve({postIds:[]}),consumer?listOwnCommunityPostIds(consumer):Promise.resolve([])]);
  const feed=<main className="community-page"><CommunityFeed initialPosts={posts} canPost={session?.role==="consumer"} initialInspiredPostIds={inspiration.postIds} initialOwnPostIds={ownPostIds} savedOutfits={outfits.map(outfit=>({id:outfit.id,name:outfit.name,pieceCount:outfit.itemIds.length}))}/></main>;
  if(session)return <AppShell role={session.role}>{feed}<WorkspaceMobileNav role={session.role} active="community"/></AppShell>;
  return <main className="community-page"><header className="community-nav"><Link className="wordmark" href="/">RACKED<span>.</span></Link><nav><Link href="/">About</Link><Link href="/login">Sign in</Link></nav></header><CommunityFeed initialPosts={posts} canPost={false} initialInspiredPostIds={[]} initialOwnPostIds={[]} savedOutfits={[]}/></main>;
}
