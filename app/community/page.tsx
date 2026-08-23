import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getConsumerInspirationProfile, listCommunityPosts, listOutfits } from "@/lib/server/production-store";
import { CommunityFeed } from "@/components/community-feed";
import { AppShell } from "@/components/app-shell";
import { WorkspaceMobileNav } from "@/components/workspace-mobile-nav";

export const metadata:Metadata={title:"Outfit community"};
export default async function CommunityPage(){
  const session=await getSession();
  const [posts,outfits,inspiration]=await Promise.all([listCommunityPosts(),session?.role==="consumer"?listOutfits(session.subject):Promise.resolve([]),session?.role==="consumer"?getConsumerInspirationProfile(session.subject):Promise.resolve({postIds:[]})]);
  const feed=<main className="community-page"><CommunityFeed initialPosts={posts} canPost={session?.role==="consumer"} initialInspiredPostIds={inspiration.postIds} savedOutfits={outfits.map(outfit=>({id:outfit.id,name:outfit.name,pieceCount:outfit.itemIds.length}))}/></main>;
  if(session)return <AppShell role={session.role}>{feed}<WorkspaceMobileNav role={session.role} active="community"/></AppShell>;
  return <main className="community-page"><header className="community-nav"><Link className="wordmark" href="/">RACKED<span>.</span></Link><nav><Link href="/">About</Link><Link href="/partners/clothing">Partner dashboards</Link><Link href="/login">Sign in</Link></nav></header><CommunityFeed initialPosts={posts} canPost={false} initialInspiredPostIds={[]} savedOutfits={[]}/></main>;
}
