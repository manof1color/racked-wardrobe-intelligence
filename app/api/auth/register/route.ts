import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { checkFormSubmission, formCheckMessage, HONEYPOT_FIELD } from "@/lib/bot-trap";
import { deviceLabel } from "@/lib/device-label";
import { knownDeviceCookie } from "@/lib/known-device";
import { claimAddressRequest, claimSignUp } from "@/lib/server/abuse-guard";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { failureResponse } from "@/lib/api-errors";
import { createAccount, recordAccountActivity, setBrandDataSharing } from "@/lib/server/production-store";
import type { Role } from "@/lib/types";
import { passwordValidationError } from "@/lib/account-security";

export async function POST(request:Request) {
  const client=clientIdentifier(request);
  const local=consumeRateLimit(`register:${client}`,RATE_LIMIT_RULES.register);
  // The same address is also limited across every server instance.
  const limit=local.allowed?await claimAddressRequest("sign-up",client):local;
  if(!limit.allowed)return NextResponse.json({error:"Too many account requests. Try again later."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const raw=await request.json().catch(()=>null) as Record<string,unknown>|null;
  // Strings are checked as strings, and every value is bounded, before anything reads them. The
  // role is one of two, and nothing else in the body — an account ID, a verification state — is read.
  const text=(value:unknown,max:number)=>typeof value==="string"&&value.length<=max?value:undefined;
  const body=raw&&typeof raw==="object"?{email:text(raw.email,254),password:text(raw.password,1_024),role:raw.role==="consumer"||raw.role==="brand"?raw.role as Role:undefined,displayName:text(raw.displayName,80)?.trim(),brandName:text(raw.brandName,80),consent:raw.consent===true,brandDataSharing:raw.brandDataSharing===true,formToken:raw.formToken,[HONEYPOT_FIELD]:raw[HONEYPOT_FIELD]}:null;
  // The bot trap: a hidden field a person never fills, and a signed token proving the form was
  // served by Racked a few seconds ago. A script posting straight here has neither.
  const secret=process.env.SESSION_SECRET;
  if(secret){const check=checkFormSubmission({token:body?.formToken,honeypot:body?.[HONEYPOT_FIELD],secret});if(!check.ok)return NextResponse.json({error:formCheckMessage(check)},{status:400});}
  if(!body?.email||!/^\S+@\S+\.\S+$/.test(body.email)||!body.displayName||!body.role||!["consumer","brand"].includes(body.role)) return NextResponse.json({error:"Complete every required account field."},{status:400});
  const passwordError=passwordValidationError(body.password??"");if(passwordError)return NextResponse.json({error:passwordError},{status:400});
  if(body.role==="consumer"&&body.consent!==true) return NextResponse.json({error:"Consent is required to process wardrobe photos."},{status:400});
  if(body.role==="brand"&&!body.brandName?.trim()) return NextResponse.json({error:"Enter the brand name you represent."},{status:400});
  // A site-wide ceiling on new accounts, shared across every server instance.
  const slot=await claimSignUp();
  if(!slot.allowed)return NextResponse.json({error:"Racked is taking a lot of new accounts right now. Try again in a little while."},{status:429,headers:{"retry-after":String(slot.retryAfterSeconds)}});
  try {
    const account=await createAccount({email:body.email,password:body.password!,role:body.role,displayName:body.displayName,brandName:body.brandName});
    if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
    await recordAccountActivity(account.id,"account-created",deviceLabel(request.headers.get("user-agent"))).catch(()=>undefined);
    // Brand sharing is asked once, at sign-up, and starts off unless ticked. It is recorded like any
    // later change in Settings (the words shown, and when); if that write fails the account simply
    // starts with sharing off, which Settings can change.
    if(account.role==="consumer"&&body.brandDataSharing){const shared=await setBrandDataSharing(account.id,true).catch(()=>null);if(shared?.changed)await recordAccountActivity(account.id,"brand-sharing-on",deviceLabel(request.headers.get("user-agent"))).catch(()=>undefined);}
    const token=await createSessionToken({subject:account.id,role:account.role,sessionVersion:account.sessionVersion??0,expiresAt:Date.now()+1000*60*60*24*7},secret);
    const response=NextResponse.json({destination:account.role==="consumer"?"/consumer":"/brand"},{status:201});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});
    // The browser that created the account is known to it, so a stranger pausing sign-ins for this
    // email address cannot keep its owner out (lib/known-device.ts).
    const known=knownDeviceCookie(body.email,secret,process.env.NODE_ENV==="production");response.cookies.set(known.name,known.value,known.options);return response;
  } catch(error){
    return failureResponse(error,"Account registration failed","Account service is temporarily unavailable. Please try again.",503);
  }
}
