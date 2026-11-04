import { NextResponse } from "next/server";
import { demoChoiceOf } from "@/lib/demo-session";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { claimAddressRequest, claimDemoSession } from "@/lib/server/abuse-guard";
import { openDemo } from "@/lib/server/demo-entry";
import { ProductionConfigurationError } from "@/lib/server/production-store";

/**
 * "Try the demo" (lib/demo-session.ts): one click on the sign-in screen, no email or password, for
 * any of the four judge accounts in the README. Judge Consumer is a fresh private copy of the seeded
 * judge wardrobe and New Consumer an empty one; Judge Brand opens the seeded demo brand, read-only;
 * New Brand is a private brand of the visitor's own. The session lasts a day and carries `demo`,
 * which the routes that could change sign-in settings, publish, or edit the shared brand refuse.
 */
export async function POST(request:Request){
  const body=await request.json().catch(()=>null) as {kind?:unknown}|null;
  const choice=demoChoiceOf(body?.kind);
  if(!choice)return NextResponse.json({error:"Choose one of the demo accounts."},{status:400});
  const secret=process.env.SESSION_SECRET;
  if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
  // Per instance, then per address across every instance, then the site's hourly ceiling, which
  // every demo counts toward: each one holds its own AI allowance.
  const client=clientIdentifier(request);
  const byClient=consumeRateLimit(`demo:${client}`,RATE_LIMIT_RULES.demoSession);
  const byAddress=byClient.allowed?await claimAddressRequest("demo",client):byClient;
  const bySite=byAddress.allowed?await claimDemoSession():byAddress;
  if(!bySite.allowed){
    const retryAfter=Math.max(byClient.retryAfterSeconds,byAddress.retryAfterSeconds,bySite.retryAfterSeconds);
    return NextResponse.json({error:"The demo is busy right now. Try again in a few minutes."},{status:429,headers:{"retry-after":String(retryAfter)}});
  }
  try{
    return await openDemo(choice,secret);
  }catch(error){
    if(error instanceof ProductionConfigurationError)return NextResponse.json({error:error.message},{status:503});
    console.error("Demo sign-in failed",{choice,name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"The demo is temporarily unavailable. Please try again."},{status:503});
  }
}
