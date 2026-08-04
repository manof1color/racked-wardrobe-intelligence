import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { ConsumerDashboard } from "@/components/consumer-dashboard";

export const metadata: Metadata = { title:"My wardrobe" };
export default async function ConsumerPage() { await requireRole("consumer"); return <ConsumerDashboard />; }
