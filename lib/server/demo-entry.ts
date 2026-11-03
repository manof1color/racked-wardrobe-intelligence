import "server-only";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { DEMO_SESSION_MS, DEMO_SOURCE_ACCOUNTS, demoRoleOf, isDemoBrandAccount, type DemoChoice } from "@/lib/demo-session";
import { createSessionToken } from "@/lib/session";
import { createDemoBrand, createDemoWardrobe, getAccount, ProductionConfigurationError } from "@/lib/server/production-store";

/**
 * Opens one of the four demos (lib/demo-session.ts) and answers with its session cookie. The
 * sign-in screen's buttons and a password sign-in to a seeded judge account both arrive here, so
 * they open exactly the same thing. Judge Brand is the shared seeded brand; the other three are
 * made fresh for this visitor.
 */
export async function openDemo(choice:DemoChoice,secret:string){
  const role=demoRoleOf(choice);
  let subject:string,sessionVersion=0;
  if(choice==="judge-consumer")subject=await createDemoWardrobe();
  else if(choice==="new-consumer")subject=await createDemoWardrobe(Date.now(),{empty:true});
  else if(choice==="new-brand")subject=await createDemoBrand();
  else{
    const account=await getAccount(DEMO_SOURCE_ACCOUNTS.brand);
    if(!account||!isDemoBrandAccount(account))throw new ProductionConfigurationError("The demo brand is not set up yet.");
    subject=account.id;sessionVersion=account.sessionVersion??0;
  }
  // `sid` is this visitor's own: on the shared demo brand, allowances are counted by it.
  const token=await createSessionToken({subject,role,sessionVersion,expiresAt:Date.now()+DEMO_SESSION_MS,demo:role,sid:crypto.randomUUID()},secret);
  const response=NextResponse.json({destination:role==="consumer"?"/consumer":"/brand",demo:choice});
  response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:DEMO_SESSION_MS/1000});
  return response;
}
