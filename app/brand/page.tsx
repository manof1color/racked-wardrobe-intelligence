import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { BrandDashboard } from "@/components/brand-dashboard";
import type { BrandTabView } from "@/components/workspace-mobile-nav";

export const metadata: Metadata = { title:"Brand opportunity" };
const views=new Set<BrandTabView>(["overview","catalog","looks"]);
export default async function BrandPage({searchParams}:{searchParams:Promise<{view?:string}>}) { await requireRole("brand");const query=await searchParams;const initialView=views.has(query.view as BrandTabView)?query.view as BrandTabView:"overview";return <BrandDashboard initialView={initialView}/>; }
