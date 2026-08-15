import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/login-panel";
import { getSession } from "@/lib/auth";
import { workspaceHome } from "@/lib/workspace-navigation";

export const metadata: Metadata = { title:"Sign in or create account" };
export default async function LoginPage() { const session=await getSession();if(session)redirect(workspaceHome(session.role));return <LoginPanel />; }
