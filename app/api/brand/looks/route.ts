import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listBrandLooks, saveBrandLook } from "@/lib/server/production-store";

export async function GET(){const session=await getSession();if(!session||session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});return NextResponse.json({looks:await listBrandLooks(session.subject)});}

export async function POST(request:Request){
  const session=await getSession();if(!session||session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});
  const body=await request.json().catch(()=>null) as {title?:string;caption?:string;productIds?:string[];published?:boolean}|null;
  if(!Array.isArray(body?.productIds))return NextResponse.json({error:"Choose brand-owned products for the Look."},{status:400});
  try{return NextResponse.json(await saveBrandLook(session.subject,{title:body?.title??"",caption:body?.caption??"",productIds:body.productIds,published:body?.published===true}),{status:201});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Brand Look could not be saved."},{status:400});}
}
