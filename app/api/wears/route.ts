import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { recordRealWear } from "@/lib/server/production-store";

export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  return NextResponse.json({error:"Use the wardrobe endpoint to retrieve current wear totals."},{status:405});
}

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const body=await request.json().catch(()=>null) as {itemId?:string;itemIds?:string[]}|null;
  try {
    const ids=Array.isArray(body?.itemIds)?body.itemIds:[body?.itemId??""];
    const counts=await recordRealWear(session.subject,ids);
    if(Array.isArray(body?.itemIds))return NextResponse.json({counts,recordedAt:new Date().toISOString()},{status:201});
    return NextResponse.json({itemId:body?.itemId,count:counts[body?.itemId??""]??0,recordedAt:new Date().toISOString()},{status:201});
  }
  catch { return NextResponse.json({error:"Unknown wardrobe item."},{status:404}); }
}
