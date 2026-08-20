import { NextResponse } from "next/server";
import { GENERIC_RESET_RESPONSE, safeResetPath } from "@/lib/account-security";
import { issuePasswordReset } from "@/lib/server/production-store";
import { sendPasswordResetEmail } from "@/lib/server/password-reset-email";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export async function POST(request:Request){
  const limit=consumeRateLimit(`password-reset:${clientIdentifier(request)}`,RATE_LIMIT_RULES.passwordResetRequest);
  if(!limit.allowed)return NextResponse.json({message:GENERIC_RESET_RESPONSE},{status:202});
  const body=await request.json().catch(()=>null) as {email?:string}|null;
  if(body?.email&&/^\S+@\S+\.\S+$/.test(body.email)){
    try{const issued=await issuePasswordReset(body.email);if(issued){const origin=(process.env.RACKED_PUBLIC_ORIGIN??new URL(request.url).origin).replace(/\/+$/,""),resetUrl=`${origin}${safeResetPath(issued.token)}`;await sendPasswordResetEmail({email:issued.email,resetUrl});}}catch(error){console.error("Password reset delivery unavailable",{name:error instanceof Error?error.name:"UnknownError"});}
  }
  return NextResponse.json({message:GENERIC_RESET_RESPONSE},{status:202});
}
