import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnerDashboard } from "@/components/partner-dashboard";
import { partnerDashboards } from "@/lib/community-data";
import type { PartnerVertical } from "@/lib/platform-types";

export function generateStaticParams(){return Object.keys(partnerDashboards).map((vertical)=>({vertical}));}
export async function generateMetadata({params}:{params:Promise<{vertical:string}>}):Promise<Metadata>{const {vertical}=await params;const data=partnerDashboards[vertical as PartnerVertical];return {title:data?.title??"Partner dashboard"};}
export default async function PartnerPage({params}:{params:Promise<{vertical:string}>}){const {vertical}=await params;const data=partnerDashboards[vertical as PartnerVertical];if(!data)notFound();return <PartnerDashboard data={data}/>}
