import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addWardrobeItem, deleteWardrobeItem, listOutfits, listWardrobe, ProductionConfigurationError } from "@/lib/server/production-store";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import type { GarmentAnalysis } from "@/lib/platform-types";

export async function GET() {
  const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  try {const [items,outfits]=await Promise.all([listWardrobe(session.subject),listOutfits(session.subject)]);return NextResponse.json({items,outfits});}catch(error){return NextResponse.json({error:error instanceof ProductionConfigurationError?error.message:"Wardrobe could not be loaded."},{status:503});}
}

export async function POST(request:Request) {
  const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const body=await request.json().catch(()=>null) as {analysis?:GarmentAnalysis;overrides?:{name?:string;brand?:string;sku?:string;category?:string;subtype?:string;customType?:string|null;labelText?:string|null}}|null;
  if(!body?.analysis||!body.analysis.garment||!body.analysis.processedImage)return NextResponse.json({error:"A completed image analysis is required."},{status:400});
  try {return NextResponse.json({item:await addWardrobeItem(session.subject,body.analysis,body.overrides)},{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Garment could not be saved."},{status:400});}
}

// Deleting a piece. deleteWardrobeItem orders the work so outfits, Community posts, and brand
// wear totals stay consistent. The item comes from the body; the owner is always the session.
export async function DELETE(request:Request) {
  const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`garment-delete:${session.subject}`,RATE_LIMIT_RULES.garmentDelete);
  if(!limit.allowed)return NextResponse.json({error:"Too many deletions at once. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const body=await request.json().catch(()=>null) as {itemId?:unknown}|null;
  const itemId=typeof body?.itemId==="string"?body.itemId.trim():"";
  if(!itemId||itemId.length>128)return NextResponse.json({error:"Choose a wardrobe piece to delete."},{status:400});
  try {
    const result=await deleteWardrobeItem(session.subject,itemId);
    if(!result)return NextResponse.json({error:"That piece is not in your wardrobe."},{status:404});
    return NextResponse.json({deleted:true,itemId,...result});
  } catch(error) {
    console.error("Wardrobe piece deletion failed",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"This piece was not fully deleted. Try again — a retry finishes what was started."},{status:503});
  }
}
