import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listCommunityPosts } from "@/lib/server/production-store";
import { CommunityFeed } from "@/components/community-feed";

export const metadata:Metadata={title:"Outfit community"};
export default async function CommunityPage(){const session=await getSession();return <main className="community-page"><header className="community-nav"><Link className="wordmark" href="/">RACKED<span>.</span></Link><nav><Link href="/">About</Link><Link href="/partners/clothing">Partner dashboards</Link><Link href={session?.role==="consumer"?"/consumer":"/login"}>{session?.role==="consumer"?"My wardrobe":"Sign in"}</Link></nav></header><CommunityFeed initialPosts={await listCommunityPosts()} canPost={session?.role==="consumer"}/></main>}
