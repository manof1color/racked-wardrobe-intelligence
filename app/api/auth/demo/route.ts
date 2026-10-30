import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { DEMO_SESSION_MS, DEMO_SOURCE_ACCOUNTS, demoKindOf, isDemoBrandAccount } from "@/lib/demo-session";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { claimAddressRequest, claimDemoWardrobe } from "@/lib/server/abuse-guard";
import { createDemoWardrobe, getAccount, ProductionConfigurationError } from "@/lib/server/production-store";

/**
 * "Try the demo" (lib/demo-session.ts): one click on the sign-in screen, no email or password.
 * The wardrobe demo makes a fresh private copy of the seeded judge wardrobe; the brand demo opens the
 * seeded demo brand, read-only. Either way the session lasts a day and carries `demo`, which the
 * routes that could change sign-in settings, publish, or edit the brand refuse.
 */
export async function POST(request:Request){
  const body=await request.json().catch(()=>null) as {kind?:unknown}|null;
  const kind=demoKindOf(body?.kind);
  if(!kind)return NextResponse.json({error:"Choose the wardrobe demo or the brand demo."},{status:400});
  const secret=process.env.SESSION_SECRET;
  if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
  // Per instance, then per address across every instance, then — for a new wardrobe — the site's ceiling.
  const client=clientIdentifier(request);
  const byClient=consumeRateLimit(`demo:${client}`,RATE_LIMIT_RULES.demoSession);
  const byAddress=byClient.allowed?await claimAddressRequest("demo",client):byClient;
  const bySite=byAddress.allowed&&kind==="consumer"?await claimDemoWardrobe():byAddress;
  if(!bySite.allowed){
    const retryAfter=Math.max(byClient.retryAfterSeconds,byAddress.retryAfterSeconds,bySite.retryAfterSeconds);
    return NextResponse.json({error:"The demo is busy right now. Try again in a few minutes."},{status:429,headers:{"retry-after":String(retryAfter)}});
  }
  try{
    let subject:string,sessionVersion=0;
    if(kind==="consumer"){
      subject=await createDemoWardrobe();
    }else{
      const account=await getAccount(DEMO_SOURCE_ACCOUNTS.brand);
      if(!account||!isDemoBrandAccount(account))return NextResponse.json({error:"The demo brand is not set up yet."},{status:503});
      subject=account.id;sessionVersion=account.sessionVersion??0;
    }
    const token=await createSessionToken({subject,role:kind,sessionVersion,expiresAt:Date.now()+DEMO_SESSION_MS,demo:kind},secret);
    const response=NextResponse.json({destination:kind==="consumer"?"/consumer":"/brand"});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:DEMO_SESSION_MS/1000});
    return response;
  }catch(error){
    if(error instanceof ProductionConfigurationError)return NextResponse.json({error:error.message},{status:503});
    console.error("Demo sign-in failed",{kind,name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"The demo is temporarily unavailable. Please try again."},{status:503});
  }
}
