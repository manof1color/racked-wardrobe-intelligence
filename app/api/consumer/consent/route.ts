import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse } from "@/lib/api-errors";
import { getBrandDataSharing, setBrandDataSharing } from "@/lib/server/production-store";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readBoolean, readJsonObject } from "@/lib/request-input";
export async function GET(){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});return NextResponse.json({brandDataSharing:await getBrandDataSharing(session.subject)});}
export async function PATCH(request:Request){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`consent:${session.subject}`,RATE_LIMIT_RULES.consentChange);
  if(!limit.allowed)return NextResponse.json({error:"Too many changes at once. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{const body=await readJsonObject(request);onlyFields(body,["brandDataSharing"]);return NextResponse.json({brandDataSharing:await setBrandDataSharing(session.subject,readBoolean(body.brandDataSharing,"brandDataSharing"))});}
  catch(error){return failureResponse(error,"Consent change failed","Your sharing choice could not be saved. Try again.");}}
