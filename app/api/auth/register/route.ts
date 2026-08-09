import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { AccountConflictError, createAccount, ProductionConfigurationError } from "@/lib/server/production-store";
import type { Role } from "@/lib/types";

export async function POST(request:Request) {
  const limit=consumeRateLimit(`register:${clientIdentifier(request)}`,RATE_LIMIT_RULES.register);
  if(!limit.allowed)return NextResponse.json({error:"Too many account requests. Try again later."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const body=await request.json().catch(()=>null) as {email?:string;password?:string;role?:Role;displayName?:string;brandName?:string;consent?:boolean}|null;
  if(!body?.email||!/^\S+@\S+\.\S+$/.test(body.email)||!body.displayName||!body.role||!["consumer","brand"].includes(body.role)) return NextResponse.json({error:"Complete every required account field."},{status:400});
  if(!body.password||body.password.length<12||!/[A-Z]/.test(body.password)||!/[a-z]/.test(body.password)||!/[0-9]/.test(body.password)) return NextResponse.json({error:"Use at least 12 characters with uppercase, lowercase, and a number."},{status:400});
  if(body.role==="consumer"&&body.consent!==true) return NextResponse.json({error:"Consent is required to process wardrobe photos."},{status:400});
  if(body.role==="brand"&&!body.brandName?.trim()) return NextResponse.json({error:"Enter the brand name you represent."},{status:400});
  try {
    const account=await createAccount({email:body.email,password:body.password,role:body.role,displayName:body.displayName,brandName:body.brandName});
    const secret=process.env.SESSION_SECRET;if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
    const token=await createSessionToken({subject:account.id,role:account.role,expiresAt:Date.now()+1000*60*60*24*7},secret);
    const response=NextResponse.json({destination:account.role==="consumer"?"/consumer":"/brand"},{status:201});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});return response;
  } catch(error){
    if(error instanceof AccountConflictError) return NextResponse.json({error:error.message},{status:409});
    if(error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    console.error("Account registration failed",error);
    return NextResponse.json({error:"Account service is temporarily unavailable. Please try again."},{status:503});
  }
}
