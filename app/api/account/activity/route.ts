import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { demoActivityLog } from "@/lib/demo-session";
import { listAccountActivity } from "@/lib/server/production-store";

// The signed-in account's own security activity: sign-ins, failed attempts, password and detail
// changes, sign-outs. The account is always the session's; no id is accepted from the request.
export async function GET(){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  // The demo brand is one shared account: its real log is every judge's sign-ins. A demo is shown a
  // made-up log instead, and the store is never asked (nor the shared account's rate limit spent).
  if(session.demo)return NextResponse.json({activity:demoActivityLog(),demo:true});
  const limit=consumeRateLimit(`account-activity:${session.subject}`,RATE_LIMIT_RULES.accountActivity);
  if(!limit.allowed)return NextResponse.json({error:"Too many requests. Try again shortly."},{status:429});
  try{
    return NextResponse.json({activity:await listAccountActivity(session.subject)});
  }catch(error){
    console.error("Account activity unavailable",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Account activity could not be loaded."},{status:503});
  }
}
