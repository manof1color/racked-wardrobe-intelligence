import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { ConsumerDashboard } from "@/components/consumer-dashboard";
import type { ConsumerWorkspaceView } from "@/components/workspace-mobile-nav";

export const metadata: Metadata = { title:"My wardrobe" };
const views=new Set<ConsumerWorkspaceView>(["home","looks","closet","outfits"]);
export default async function ConsumerPage({searchParams}:{searchParams:Promise<{view?:string;add?:string}>}) { await requireRole("consumer");const query=await searchParams;const initialView=views.has(query.view as ConsumerWorkspaceView)?query.view as ConsumerWorkspaceView:"home";return <ConsumerDashboard initialView={initialView} openAddInitially={query.add==="1"}/>; }
