import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addWardrobeItem, listOutfits, listWardrobe, ProductionConfigurationError } from "@/lib/server/production-store";
import type { GarmentAnalysis } from "@/lib/platform-types";

export async function GET() {
  const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  try {const [items,outfits]=await Promise.all([listWardrobe(session.subject),listOutfits(session.subject)]);return NextResponse.json({items,outfits});}catch(error){return NextResponse.json({error:error instanceof ProductionConfigurationError?error.message:"Wardrobe could not be loaded."},{status:503});}
}

export async function POST(request:Request) {
  const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const body=await request.json().catch(()=>null) as {analysis?:GarmentAnalysis;overrides?:{name?:string;brand?:string;sku?:string}}|null;
  if(!body?.analysis||!body.analysis.garment||!body.analysis.processedImage)return NextResponse.json({error:"A completed image analysis is required."},{status:400});
  try {return NextResponse.json({item:await addWardrobeItem(session.subject,body.analysis,body.overrides)},{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Garment could not be saved."},{status:400});}
}
