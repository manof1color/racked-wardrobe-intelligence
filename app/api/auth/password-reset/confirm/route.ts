import { NextResponse } from "next/server";
import { consumePasswordReset, getAccount, recordAccountActivity } from "@/lib/server/production-store";
import { deviceLabel } from "@/lib/device-label";
import { passwordValidationError } from "@/lib/account-security";
import { knownDeviceCookie } from "@/lib/known-device";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export async function POST(request:Request){
  const limit=consumeRateLimit(`password-reset-confirm:${clientIdentifier(request)}`,RATE_LIMIT_RULES.passwordResetConsume);if(!limit.allowed)return NextResponse.json({error:"Too many reset attempts. Try again later."},{status:429});
  const body=await request.json().catch(()=>null) as {token?:unknown;password?:unknown}|null;
  const token=typeof body?.token==="string"?body.token:"";
  const password=typeof body?.password==="string"?body.password:"";
  if(!token||token.length>200)return NextResponse.json({error:"This reset link is invalid or expired."},{status:400});
  const passwordError=password.length>1_024?"Use a password of at most 1,024 characters.":passwordValidationError(password);if(passwordError)return NextResponse.json({error:passwordError},{status:400});
  const account=await consumePasswordReset(token,password);if(!account)return NextResponse.json({error:"This reset link is invalid, expired, or already used."},{status:400});
  await recordAccountActivity(account.id,"password-reset",deviceLabel(request.headers.get("user-agent"))).catch(()=>undefined);
  const response=NextResponse.json({message:"Password updated. Sign in with your new password."});
  // Whoever opened the emailed link controls the inbox, so this browser is known to the account:
  // someone pausing sign-ins for this email address cannot keep its owner out (lib/known-device.ts).
  // The address is read from the profile, not from the record the reset returned: that record also
  // carries the new password hash, and nothing derived from it should be keyed into a cookie.
  const secret=process.env.SESSION_SECRET;
  const email=secret?(await getAccount(account.id).catch(()=>null))?.email:null;
  if(secret&&email){const known=knownDeviceCookie(email,secret,process.env.NODE_ENV==="production");response.cookies.set(known.name,known.value,known.options);}
  return response;
}
