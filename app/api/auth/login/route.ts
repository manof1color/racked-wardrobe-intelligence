import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { signInPausedMessage } from "@/lib/abuse-limits";
import { deviceLabel } from "@/lib/device-label";
import { isKnownDevice, KNOWN_DEVICE_COOKIE, knownDeviceCookie } from "@/lib/known-device";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { claimAddressRequest, countKnownDeviceFailure, countSignInFailure, knownDevicePause, signInPause } from "@/lib/server/abuse-guard";
import { authenticateAccount, ProductionConfigurationError, recordAccountActivity, recordFailedSignIn } from "@/lib/server/production-store";
import { createTwoStepChallenge, TWO_STEP_CHALLENGE_COOKIE, TWO_STEP_CHALLENGE_MS, TWO_STEP_CHALLENGE_PATH, twoStepEnabled } from "@/lib/two-step";

export async function POST(request:Request) {
  const body=await request.json().catch(()=>null) as {email?:unknown;password?:unknown}|null;
  const email=typeof body?.email==="string"?body.email.trim():"";
  const password=typeof body?.password==="string"?body.password:"";
  if(!email||!password||email.length>254||password.length>1_024)return NextResponse.json({error:"Enter your email and password."},{status:400});
  const secret=process.env.SESSION_SECRET;
  // A browser that has signed in to this account before carries a signed cookie saying so, and the
  // per-email pauses below do not apply to it: an attacker typing wrong passwords for someone
  // else's email can pause their own attempts, never the owner's (lib/known-device.ts). The cookie
  // has a failure budget of its own, so a copied cookie cannot be used to guess from many
  // addresses: past eight wrong passwords it is an unknown device again.
  const deviceToken=(await cookies()).get(KNOWN_DEVICE_COOKIE)?.value;
  const deviceSigned=Boolean(secret)&&isKnownDevice(deviceToken,email,secret!);
  const knownDevice=deviceSigned&&(await knownDevicePause(deviceToken!)).allowed;
  // Both keys slow credential stuffing: one caller cycling emails, and many callers
  // converging on one account.
  // The client's address is limited twice: on this instance, and across every instance.
  const client=clientIdentifier(request);
  const byClient=consumeRateLimit(`login:${client}`,RATE_LIMIT_RULES.login);
  const byEmail=knownDevice?byClient:consumeRateLimit(`login-email:${email.toLowerCase()}`,RATE_LIMIT_RULES.login);
  const byAddress=byClient.allowed&&byEmail.allowed?await claimAddressRequest("sign-in",client):byClient;
  if(!byClient.allowed||!byEmail.allowed||!byAddress.allowed){
    const retryAfter=Math.max(byClient.retryAfterSeconds,byEmail.retryAfterSeconds,byAddress.retryAfterSeconds);
    return NextResponse.json({error:"Too many sign-in attempts. Try again in a few minutes."},{status:429,headers:{"retry-after":String(retryAfter)}});
  }
  // The shared pause holds across every server instance: after repeated wrong passwords an email
  // address is paused for the rest of the window, whether or not it belongs to an account, so the
  // answer reveals nothing about which emails do.
  if(!knownDevice){
    const paused=await signInPause(email);
    // An alarm signal for password guessing; the line carries no email address or client address.
    if(!paused.allowed){console.warn("Sign-in pause engaged");return NextResponse.json({error:signInPausedMessage(paused.retryAfterSeconds)},{status:429,headers:{"retry-after":String(paused.retryAfterSeconds)}});}
  }
  const device=deviceLabel(request.headers.get("user-agent"));
  try {
    const account=await authenticateAccount(email,password);
    if(!account){
      // The same two writes for every wrong password, account or not: count it, and file it where
      // the owner of that email — if there is one — will see it in their activity log.
      await Promise.all([countSignInFailure(email),...(deviceSigned?[countKnownDeviceFailure(deviceToken!)]:[]),recordFailedSignIn(email,device).catch(()=>undefined)]);
      return NextResponse.json({error:"Email or password was incorrect."},{status:401});
    }
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
    const known=knownDeviceCookie(email,secret,production);
    response.cookies.set(known.name,known.value,known.options);
    return response;
  }catch(error){
    if(error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    console.error("Account sign-in failed",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Sign-in service is temporarily unavailable. Please try again."},{status:503});
  }
}
