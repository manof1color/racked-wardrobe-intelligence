import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listOutfits, saveOutfit } from "@/lib/server/production-store";

export async function GET(){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});return NextResponse.json({outfits:await listOutfits(session.subject)});}
export async function POST(request:Request){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});const body=await request.json().catch(()=>null) as {name?:string;itemIds?:string[]}|null;if(!Array.isArray(body?.itemIds)||body.itemIds.length<1||body.itemIds.length>10)return NextResponse.json({error:"Choose 1–10 wardrobe pieces."},{status:400});return NextResponse.json({outfit:await saveOutfit(session.subject,body.name??"Saved outfit",body.itemIds)},{status:201});}
