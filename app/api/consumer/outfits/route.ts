import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteOutfit, listOutfits, listWardrobe, saveOutfit, updateOutfitItems } from "@/lib/server/production-store";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  return NextResponse.json({ outfits: await listOutfits(session.subject) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: string; itemIds?: string[] } | null;
  if (!Array.isArray(body?.itemIds) || body.itemIds.length < 1 || body.itemIds.length > 10) return NextResponse.json({ error: "Choose 1–10 wardrobe pieces." }, { status: 400 });
  const unique = [...new Set(body.itemIds)];
  const wardrobe = await listWardrobe(session.subject);
  if (unique.some((id) => !wardrobe.some((item) => item.id === id))) return NextResponse.json({ error: "Every outfit piece must belong to your wardrobe." }, { status: 400 });
  return NextResponse.json({ outfit: await saveOutfit(session.subject, body.name ?? "Saved outfit", unique) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session=await getSession();
  if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const body=await request.json().catch(()=>null) as {outfitId?:string;itemIds?:string[]}|null;
  const outfitId=body?.outfitId?.trim();
  if(!outfitId||outfitId.length>128)return NextResponse.json({error:"Choose a valid saved outfit."},{status:400});
  if(!Array.isArray(body?.itemIds)||body.itemIds.length<1||body.itemIds.length>10)return NextResponse.json({error:"Keep 1–10 wardrobe pieces in the outfit, or delete the whole outfit."},{status:400});
  const unique=[...new Set(body.itemIds)];
  try{
    const outfit=await updateOutfitItems(session.subject,outfitId,unique);
    if(!outfit)return NextResponse.json({error:"Saved outfit not found."},{status:404});
    return NextResponse.json({outfit});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Saved outfit could not be updated."},{status:400});
  }
}

export async function DELETE(request: Request) {
  const session=await getSession();
  if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const body=await request.json().catch(()=>null) as {outfitId?:string}|null;
  const outfitId=body?.outfitId?.trim();
  if(!outfitId||outfitId.length>128)return NextResponse.json({error:"Choose a valid saved outfit."},{status:400});
  if(!await deleteOutfit(session.subject,outfitId))return NextResponse.json({error:"Saved outfit not found."},{status:404});
  return NextResponse.json({deleted:true,outfitId});
}
