import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { wardrobe } from "@/lib/demo-data";
import { getWearCount, recordOutfitWears, recordWear } from "@/lib/server/demo-store";

export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="brand") return NextResponse.json({error:"Brand role required."},{status:403});
  const byCategory=new Map<string,{category:string;wears:number;itemCount:number}>();
  for (const item of wardrobe) { const current=byCategory.get(item.category)??{category:item.category,wears:0,itemCount:0}; current.wears+=getWearCount(item.id); current.itemCount+=1; byCategory.set(item.category,current); }
  const aggregate=[...byCategory.values()];
  return NextResponse.json({aggregate,classification:"synthetic aggregate"});
}

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const body=await request.json().catch(()=>null) as {itemId?:string;itemIds?:string[]}|null;
  try {
    if (Array.isArray(body?.itemIds)) return NextResponse.json({counts:recordOutfitWears(body.itemIds),recordedAt:new Date().toISOString()},{status:201});
    const count=recordWear(body?.itemId ?? ""); return NextResponse.json({itemId:body?.itemId,count,recordedAt:new Date().toISOString()},{status:201});
  }
  catch { return NextResponse.json({error:"Unknown wardrobe item."},{status:404}); }
}
