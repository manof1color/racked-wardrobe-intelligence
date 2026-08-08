import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRealProductMetrics } from "@/lib/server/production-store";

export async function POST(request:Request){const session=await getSession();if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});if(session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});const body=await request.json().catch(()=>null) as {productId?:string}|null;if(!body?.productId||body.productId.length>80)return NextResponse.json({error:"Choose a valid product."},{status:400});try{return NextResponse.json({metrics:await getRealProductMetrics(session.subject,body.productId)});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Wear metrics could not be loaded."},{status:400});}}
