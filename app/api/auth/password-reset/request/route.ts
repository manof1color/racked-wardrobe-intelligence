import { NextResponse } from "next/server";
import { GENERIC_RESET_RESPONSE, safeResetPath } from "@/lib/account-security";
import { checkFormSubmission, HONEYPOT_FIELD } from "@/lib/bot-trap";
import { issuePasswordReset } from "@/lib/server/production-store";
import { claimPasswordResetEmail } from "@/lib/server/abuse-guard";
import { publicOrigin } from "@/lib/site-origin";
import { sendPasswordResetEmail } from "@/lib/server/password-reset-email";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

// Every outcome answers the same way — sent, not sent, unknown email, bot, or flood — so the
// response reveals nothing. What changes is whether an email actually goes out: not to a bot, and
// at most a few an hour to any one address, so nobody can flood someone's inbox through Racked.
export async function POST(request:Request){
  const limit=consumeRateLimit(`password-reset:${clientIdentifier(request)}`,RATE_LIMIT_RULES.passwordResetRequest);
  if(!limit.allowed)return NextResponse.json({message:GENERIC_RESET_RESPONSE},{status:202});
  const body=await request.json().catch(()=>null) as {email?:string;formToken?:string;[HONEYPOT_FIELD]?:string}|null;
  const secret=process.env.SESSION_SECRET;
  const human=!secret||checkFormSubmission({token:body?.formToken,honeypot:body?.[HONEYPOT_FIELD],secret}).ok;
  if(human&&body?.email&&/^\S+@\S+\.\S+$/.test(body.email)&&(await claimPasswordResetEmail(body.email)).allowed){
    try{const issued=await issuePasswordReset(body.email);if(issued){// The link's address comes from configuration, never from this request's Host: a reset link
      // built from a forged host would carry the victim's valid token to an attacker's site.
      const resetUrl=`${publicOrigin()}${safeResetPath(issued.token)}`;await sendPasswordResetEmail({email:issued.email,resetUrl});}}catch(error){console.error("Password reset delivery unavailable",{name:error instanceof Error?error.name:"UnknownError"});}
  }
  return NextResponse.json({message:GENERIC_RESET_RESPONSE},{status:202});
}
