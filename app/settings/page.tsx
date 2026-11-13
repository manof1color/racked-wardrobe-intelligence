import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { brandStatusOf } from "@/lib/brand-approval";
import { demoActivityLog } from "@/lib/demo-session";
import { getAccount } from "@/lib/server/production-store";
import { AccountSettingsPanel } from "@/components/account-settings-panel";

export const metadata:Metadata={title:"Account settings"};

/**
 * The demo brand's security features, shown and not changeable: one shared account must not have its
 * sign-in altered by a visitor, and its real activity log is every visitor's sign-ins.
 */
async function demoBrandPreview(account:{id:string;role?:unknown;brandStatus?:unknown}){
  const now=Date.now();
  return {brandStatus:brandStatusOf(account),activity:demoActivityLog(now),now};
}

export default async function SettingsPage(){const session=await getSession();if(!session)redirect("/login");const account=await getAccount(session.subject);if(!account)redirect("/login");
  const demoBrand=session.demo==="brand"?await demoBrandPreview(account):undefined;
  return <AccountSettingsPanel account={{displayName:account.displayName,email:account.email,role:account.role,brandName:account.brandName}} demoBrand={demoBrand}/>;}
