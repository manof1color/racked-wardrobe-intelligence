import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ConsumerDashboard } from "@/components/consumer-dashboard";
import { BrandDashboard } from "@/components/brand-dashboard";
import type { BrandTabView, ConsumerWorkspaceView } from "@/components/workspace-mobile-nav";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import { a11yHarnessEnabled, harnessScreen } from "@/lib/a11y-harness";
import { demoActivityLog } from "@/lib/demo-session";
import { JudgeTour } from "@/components/judge-tour";

/** A fixed clock, so the preview's relative times are the same on every run. */
const FIXTURE_NOW = Date.parse("2026-10-29T12:00:00.000Z");

export const metadata: Metadata = { title:"Accessibility harness", robots:{ index:false, follow:false } };

// Signed-in screens with no account behind them, for the accessibility checks only. The flag is
// read per request, never at build time, so a build made with it set cannot carry the page into
// a deployment that lacks it.
export default async function A11yHarnessPage({searchParams}:{searchParams:Promise<{role?:string;view?:string;add?:string;tour?:string}>}) {
  await connection();
  if(!a11yHarnessEnabled(process.env))notFound();
  const query=await searchParams;
  const screen=harnessScreen(query.role,query.view);
  if(screen.role==="brand"&&screen.view==="demo-settings")return <AccountSettingsPanel account={{displayName:"Fixture Brand",email:"brand@fixture.example",role:"brand",brandName:"Fixture Denim Co"}} demoBrand={{brandStatus:"approved",budget:{opened:2,limit:6},activity:demoActivityLog(FIXTURE_NOW),now:FIXTURE_NOW}}/>;
  // tour=1 adds the judge guide a demo session shows above its workspace (components/judge-tour.tsx).
  const tour=query.tour==="1"?<JudgeTour kind={screen.role} sessionExpiresAt={FIXTURE_NOW+86_400_000}/>:null;
  if(screen.role==="brand")return <>{tour}<BrandDashboard initialView={screen.view as BrandTabView}/></>;
  return <>{tour}<ConsumerDashboard initialView={screen.view as ConsumerWorkspaceView} openAddInitially={query.add==="1"}/></>;
}
