import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { brandStatusOf } from "@/lib/brand-approval";
import { getAccount } from "@/lib/server/production-store";
import { BrandDashboard } from "@/components/brand-dashboard";
import { BrandApprovalNotice } from "@/components/brand-approval-notice";
import { DemoNotice } from "@/components/demo-notice";
import type { BrandTabView } from "@/components/workspace-mobile-nav";

export const metadata: Metadata = { title:"Brand opportunity" };
const views=new Set<BrandTabView>(["overview","catalog","looks"]);
export default async function BrandPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
  const session=await requireRole("brand");
  // A brand the owner has not approved, or has revoked, sees why instead of a dashboard whose every request would be refused.
  const account=await getAccount(session.subject);
  const status=brandStatusOf(account);
  if(status==="pending"||status==="revoked")return <BrandApprovalNotice status={status} brandName={account?.brandName??null}/>;
  const query=await searchParams;const initialView=views.has(query.view as BrandTabView)?query.view as BrandTabView:"overview";return <>{session.demo&&<DemoNotice kind="brand"/>}<BrandDashboard initialView={initialView}/></>;
}
