import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { signInPausedMessage } from "@/lib/abuse-limits";
import { deviceLabel } from "@/lib/device-label";
import { isKnownDevice, KNOWN_DEVICE_COOKIE, knownDeviceCookie } from "@/lib/known-device";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { claimAddressRequest, claimSignInAttempt, releaseSignInAttempt } from "@/lib/server/abuse-guard";
import { authenticateAccount, findAccountByEmail, getAccount, ProductionConfigurationError, recordAccountActivity, recordFailedSignIn } from "@/lib/server/production-store";
import { createTwoStepChallenge, TWO_STEP_CHALLENGE_COOKIE, TWO_STEP_CHALLENGE_MS, TWO_STEP_CHALLENGE_PATH, twoStepEnabled } from "@/lib/two-step";

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {email?:unknown;password?:unknown}|null;
  const email=typeof body?.email==="string"?body.email.trim():"";
  const password=typeof body?.password==="string"?body.password:"";
  if(!email||!password||email.length>254||password.length>1_024)return NextResponse.json({error:"Enter your email and password."},{status:400});
  const secret=process.env.SESSION_SECRET;
  const client=clientIdentifier(request);
  const byClient=consumeRateLimit(`login:${client}`,RATE_LIMIT_RULES.login);
  const byAddress=byClient.allowed?await claimAddressRequest("sign-in",client):byClient;
  if(!byAddress.allowed)return NextResponse.json({error:"Too many sign-in attempts. Try again in a few minutes."},{status:429,headers:{"retry-after":String(byAddress.retryAfterSeconds)}});
  const device=deviceLabel(request.headers.get("user-agent"));
  try {
    const deviceToken=(await cookies()).get(KNOWN_DEVICE_COOKIE)?.value;
    const now=Date.now();
    const signed=Boolean(secret)&&isKnownDevice(deviceToken,email,secret!,now);
    const identified=signed?await findAccountByEmail(email):null;
    const profile=identified?await getAccount(identified.id):null;
    const knownDevice=Boolean(profile&&isKnownDevice(deviceToken,email,secret!,now,profile.passwordChangedAt??0));
    const byEmail=knownDevice?byClient:consumeRateLimit(`login-email:${email.toLowerCase()}`,RATE_LIMIT_RULES.login);
    const paused=byEmail.allowed?await claimSignInAttempt(email,knownDevice,now):{...byEmail,reserved:false};
    if(!paused.allowed){console.warn("Sign-in pause engaged");return NextResponse.json({error:signInPausedMessage(paused.retryAfterSeconds)},{status:429,headers:{"retry-after":String(paused.retryAfterSeconds)}});}
    const account=await authenticateAccount(email,password);
    if(!account){
      await recordFailedSignIn(email,device).catch(()=>undefined);
      return NextResponse.json({error:"Email or password was incorrect."},{status:401});
    }
    if(paused.reserved)await releaseSignInAttempt(email,knownDevice,now).catch(()=>undefined);
    if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});
    const production=process.env.NODE_ENV==="production";
    // With two-step sign-in on, the right password earns a five-minute challenge, not a session: the
    // session is issued by /api/auth/two-step once a code from the authenticator app is right too.
    if(twoStepEnabled(account)){
      const challenge=createTwoStepChallenge({subject:account.id,sessionVersion:account.sessionVersion??0,expiresAt:Date.now()+TWO_STEP_CHALLENGE_MS},secret);
      const response=NextResponse.json({twoStep:true});
      response.cookies.set(TWO_STEP_CHALLENGE_COOKIE,challenge,{httpOnly:true,sameSite:"strict",secure:production,path:TWO_STEP_CHALLENGE_PATH,maxAge:TWO_STEP_CHALLENGE_MS/1000});
      return response;
    }
    const token=await createSessionToken({subject:account.id,role:account.role,sessionVersion:account.sessionVersion??0,expiresAt:Date.now()+1000*60*60*24*7},secret);
    await recordAccountActivity(account.id,"sign-in",device).catch(()=>undefined);
    const response=NextResponse.json({destination:account.role==="consumer"?"/consumer":"/brand"});
    response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:production,path:"/",maxAge:60*60*24*7});
    const known=knownDeviceCookie(email,secret,production,account.passwordChangedAt);
    response.cookies.set(known.name,known.value,known.options);
    return response;
  }catch(error){
    if(error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    console.error("Account sign-in failed",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Sign-in service is temporarily unavailable. Please try again."},{status:503});
  }
}
