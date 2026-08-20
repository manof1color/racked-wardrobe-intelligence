import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAccount } from "@/lib/server/production-store";
import { AccountSettingsPanel } from "@/components/account-settings-panel";

export const metadata:Metadata={title:"Account settings"};
export default async function SettingsPage(){const session=await getSession();if(!session)redirect("/login");const account=await getAccount(session.subject);if(!account)redirect("/login");return <AccountSettingsPanel account={{displayName:account.displayName,email:account.email,role:account.role,brandName:account.brandName}}/>;}
