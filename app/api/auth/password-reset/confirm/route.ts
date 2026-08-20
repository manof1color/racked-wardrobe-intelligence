import { NextResponse } from "next/server";
import { consumePasswordReset } from "@/lib/server/production-store";
import { passwordValidationError } from "@/lib/account-security";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export async function POST(request:Request){
  const limit=consumeRateLimit(`password-reset-confirm:${clientIdentifier(request)}`,RATE_LIMIT_RULES.passwordResetConsume);if(!limit.allowed)return NextResponse.json({error:"Too many reset attempts. Try again later."},{status:429});
  const body=await request.json().catch(()=>null) as {token?:string;password?:string}|null;
  if(!body?.token||body.token.length>200)return NextResponse.json({error:"This reset link is invalid or expired."},{status:400});
  const passwordError=passwordValidationError(body.password??"");if(passwordError)return NextResponse.json({error:passwordError},{status:400});
  const account=await consumePasswordReset(body.token,body.password!);if(!account)return NextResponse.json({error:"This reset link is invalid, expired, or already used."},{status:400});
  return NextResponse.json({message:"Password updated. Sign in with your new password."});
}
