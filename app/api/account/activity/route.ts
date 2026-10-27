import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { listAccountActivity } from "@/lib/server/production-store";

// The signed-in account's own security activity: sign-ins, failed attempts, password and detail
// changes, sign-outs. The account is always the session's; no id is accepted from the request.
export async function GET(){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  const limit=consumeRateLimit(`account-activity:${session.subject}`,RATE_LIMIT_RULES.accountActivity);
  if(!limit.allowed)return NextResponse.json({error:"Too many requests. Try again shortly."},{status:429});
  try{
    return NextResponse.json({activity:await listAccountActivity(session.subject)});
  }catch(error){
    console.error("Account activity unavailable",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Account activity could not be loaded."},{status:503});
  }
}
