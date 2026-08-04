import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { BrandDashboard } from "@/components/brand-dashboard";

export const metadata: Metadata = { title:"Brand opportunity" };
export default async function BrandPage() { await requireRole("brand"); return <BrandDashboard />; }
