import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSessionToken } from "@/lib/session";
import { authenticateAccount, ProductionConfigurationError } from "@/lib/server/production-store";

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {email?:string;password?:string}|null;
  if(!body?.email||!body.password)return NextResponse.json({error:"Enter your email and password."},{status:400});
  try {const account=await authenticateAccount(body.email,body.password);if(!account)return NextResponse.json({error:"Email or password was incorrect."},{status:401});const secret=process.env.SESSION_SECRET;if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});const token=await createSessionToken({subject:account.id,role:account.role,expiresAt:Date.now()+1000*60*60*24*7},secret);const response=NextResponse.json({destination:account.role==="consumer"?"/consumer":"/brand"});response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});return response;}catch(error){return NextResponse.json({error:error instanceof ProductionConfigurationError?error.message:"Sign in failed."},{status:error instanceof ProductionConfigurationError?503:500});}
}
