import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { AccountConflictError, AccountDeletionUnavailableError, deleteOwnConsumerAccount, getAccount, updateOwnAccount } from "@/lib/server/production-store";
import { ACCOUNT_DELETION_CONFIRMATION, accountDeletionConfirmed } from "@/lib/deletion-plan";
import { passwordValidationError } from "@/lib/account-security";
import { createSessionToken } from "@/lib/session";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export async function GET(){
  const session=await getSession();if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  const account=await getAccount(session.subject);if(!account)return NextResponse.json({error:"Account not found."},{status:404});
  return NextResponse.json({account:{displayName:account.displayName,email:account.email,role:account.role,brandName:account.brandName}});
}

export async function PATCH(request:Request){
  const session=await getSession();if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  const limit=consumeRateLimit(`account:${session.subject}:${clientIdentifier(request)}`,RATE_LIMIT_RULES.accountSettings);if(!limit.allowed)return NextResponse.json({error:"Too many account changes. Try again later."},{status:429});
  const body=await request.json().catch(()=>null) as {displayName?:string;email?:string;currentPassword?:string;newPassword?:string}|null;
  if(!body?.displayName||!body.email||!body.currentPassword)return NextResponse.json({error:"Name, email, and current password are required."},{status:400});
  if(body.newPassword){const passwordError=passwordValidationError(body.newPassword);if(passwordError)return NextResponse.json({error:passwordError},{status:400});}
  try{
    const account=await updateOwnAccount(session.subject,{displayName:body.displayName,email:body.email,currentPassword:body.currentPassword,newPassword:body.newPassword});
    if(!account)return NextResponse.json({error:"Current password was incorrect."},{status:401});
    const response=NextResponse.json({account:{displayName:account.displayName,email:account.email,role:account.role,brandName:account.brandName},passwordChanged:Boolean(body.newPassword)});
    if(body.newPassword){const secret=process.env.SESSION_SECRET;if(!secret)return NextResponse.json({error:"Session security is not configured."},{status:503});const token=await createSessionToken({subject:account.id,role:account.role,sessionVersion:account.sessionVersion??0,expiresAt:Date.now()+1000*60*60*24*7},secret);response.cookies.set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*7});}
    return response;
  }catch(error){if(error instanceof AccountConflictError)return NextResponse.json({error:error.message},{status:409});console.error("Account settings update failed",{name:error instanceof Error?error.name:"UnknownError"});return NextResponse.json({error:"Account settings could not be updated."},{status:503});}
}

// Deleting an account needs the current password and the typed confirmation word, and is rate
// limited. The account is always the session's own; no ID is accepted from the body.
export async function DELETE(request:Request){
  const session=await getSession();if(!session)return NextResponse.json({error:"Sign in required."},{status:401});
  const limit=consumeRateLimit(`account-delete:${session.subject}:${clientIdentifier(request)}`,RATE_LIMIT_RULES.accountDeletion);if(!limit.allowed)return NextResponse.json({error:"Too many deletion attempts. Try again later."},{status:429});
  const body=await request.json().catch(()=>null) as {currentPassword?:unknown;confirmation?:unknown}|null;
  if(typeof body?.currentPassword!=="string"||!body.currentPassword)return NextResponse.json({error:"Enter your current password to delete your account."},{status:400});
  if(!accountDeletionConfirmed(body.confirmation))return NextResponse.json({error:`Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm.`},{status:400});
  try{
    const result=await deleteOwnConsumerAccount(session.subject,body.currentPassword);
    if(!result)return NextResponse.json({error:"Current password was incorrect."},{status:401});
    const response=NextResponse.json({deleted:true});
    response.cookies.set(SESSION_COOKIE,"",{httpOnly:true,expires:new Date(0),path:"/"});
    return response;
  }catch(error){
    if(error instanceof AccountDeletionUnavailableError)return NextResponse.json({error:error.message},{status:409});
    console.error("Account deletion failed",{name:error instanceof Error?error.name:"UnknownError"});
    return NextResponse.json({error:"Your account was not fully deleted. Try again — anything already removed stays removed, and a retry finishes the rest."},{status:503});
  }
}
