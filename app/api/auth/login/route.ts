import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { authenticateAccount, ProductionConfigurationError } from "@/lib/server/production-store";

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {email?:string;password?:string}|null;
  if(!body?.email||!body.password)return NextResponse.json({error:"Enter your email and password."},{status:400});
  // Both keys slow credential stuffing: one caller cycling emails, and many callers
  // converging on one account.
  const byClient=consumeRateLimit(`login:${clientIdentifier(request)}`,RATE_LIMIT_RULES.login);
  const byEmail=consumeRateLimit(`login-email:${body.email.trim().toLowerCase()}`,RATE_LIMIT_RULES.login);
  if(!byClient.allowed||!byEmail.allowed){
    const retryAfter=Math.max(byClient.retryAfterSeconds,byEmail.retryAfterSeconds);
    return NextResponse.json({error:"Too many sign-in attempts. Try again in a few minutes."},{status:429,headers:{"retry-after":String(retryAfter)}});
  }
  try {const account=await authenticateAccount(body.email,body.password);if(!account)return NextResponse.json({error:"Email or password was incorrect."},{status:401});const secret=process.env.SESSION_SECRET;if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});const token=await createSessionToken({subject:account.id,role:account.role,expiresAt:Date.now()+1000*60*60*24*7},secret);const response=NextResponse.json({destination:account.role==="consumer"?"/consumer":"/brand"});response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});return response;}catch(error){
    if(error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    console.error("Account sign-in failed",error);
    return NextResponse.json({error:"Sign-in service is temporarily unavailable. Please try again."},{status:503});
  }
}
