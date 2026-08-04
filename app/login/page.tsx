import type { Metadata } from "next";
import { LoginPanel } from "@/components/login-panel";

export const metadata: Metadata = { title:"Demo sign in" };
export default function LoginPage() { return <LoginPanel />; }
