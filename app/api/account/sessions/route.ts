import { NextResponse } from "next/server";
import { DEMO_SETTINGS_MESSAGE } from "@/lib/demo-session";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { deviceLabel } from "@/lib/device-label";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { endOtherSessions, recordAccountActivity } from "@/lib/server/production-store";

// "Sign out of all other devices." Raising the account's session version invalidates every
// session issued before it; this device gets a fresh session at the new version so it stays
// signed in. Always the session's own account.
export async function DELETE(request:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  if(session.demo)return NextResponse.json({error:DEMO_SETTINGS_MESSAGE},{status:403});
  const limit=consumeRateLimit(`end-sessions:${session.subject}`,RATE_LIMIT_RULES.endSessions);
  if(!limit.allowed)return NextResponse.json({error:"Too many requests. Try again shortly."},{status:429});
  const secret=process.env.SESSION_SECRET;
  if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
  try{
    const account=await endOtherSessions(session.subject);
    const token=await createSessionToken({subject:account.id,role:account.role,sessionVersion:account.sessionVersion??0,expiresAt:Date.now()+1000*60*60*24*7},secret);
    await recordAccountActivity(account.id,"signed-out-everywhere",deviceLabel(request.headers.get("user-agent"))).catch(()=>undefined);
    const response=NextResponse.json({signedOutOthers:true});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});
    return response;
  }catch(error){
    console.error("Other sessions could not be ended",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Other devices could not be signed out. Try again."},{status:503});
  }
}
