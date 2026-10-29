import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConsumerDashboard } from "@/components/consumer-dashboard";
import { BrandDashboard } from "@/components/brand-dashboard";
import type { BrandTabView, ConsumerWorkspaceView } from "@/components/workspace-mobile-nav";
import { a11yHarnessEnabled, harnessScreen } from "@/lib/a11y-harness";

export const metadata: Metadata = { title:"Accessibility harness", robots:{ index:false, follow:false } };

// Signed-in screens with no account behind them, for the accessibility checks only. The flag is
// read per request, never at build time, so a build made with it set cannot carry the page into
// a deployment that lacks it.
export default async function A11yHarnessPage({searchParams}:{searchParams:Promise<{role?:string;view?:string;add?:string}>}) {
  await connection();
  if(!a11yHarnessEnabled(process.env))notFound();
  const query=await searchParams;
  const screen=harnessScreen(query.role,query.view);
  if(screen.role==="brand")return <BrandDashboard initialView={screen.view as BrandTabView}/>;
  return <ConsumerDashboard initialView={screen.view as ConsumerWorkspaceView} openAddInitially={query.add==="1"}/>;
}
