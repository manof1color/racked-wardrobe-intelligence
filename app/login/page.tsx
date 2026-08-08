import type { Metadata } from "next";
import { LoginPanel } from "@/components/login-panel";

export const metadata: Metadata = { title:"Sign in or create account" };
export default function LoginPage() { return <LoginPanel />; }
