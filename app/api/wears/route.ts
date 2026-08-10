import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { incrementOutfitWears, recordRealWear } from "@/lib/server/production-store";

export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  return NextResponse.json({error:"Use the wardrobe endpoint to retrieve current wear totals."},{status:405});
}

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const body=await request.json().catch(()=>null) as {itemId?:string;itemIds?:string[];outfitId?:string}|null;
  try {
    const ids=Array.isArray(body?.itemIds)?body.itemIds:[body?.itemId??""];
    const counts=await recordRealWear(session.subject,ids);
    // Optional: when the wear came from a saved outfit, bump that outfit's own wear
    // total so the "repeated wears" stat reflects reality. Ownership is enforced by
    // looking the outfit up inside the signed-in account's partition only.
    const outfitWears=typeof body?.outfitId==="string"&&body.outfitId?await incrementOutfitWears(session.subject,body.outfitId).catch(()=>null):null;
    if(Array.isArray(body?.itemIds))return NextResponse.json({counts,outfitWears,recordedAt:new Date().toISOString()},{status:201});
    return NextResponse.json({itemId:body?.itemId,count:counts[body?.itemId??""]??0,recordedAt:new Date().toISOString()},{status:201});
  }
  catch { return NextResponse.json({error:"Unknown wardrobe item."},{status:404}); }
}
