import { NextResponse } from "next/server";
import { brandAccess } from "@/lib/server/brand-access";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { failureResponse } from "@/lib/api-errors";
import { onlyFields, readId, readJsonObject } from "@/lib/request-input";
import { getRealProductMetrics } from "@/lib/server/production-store";

export async function POST(request:Request){
  const access=await brandAccess();if(!access.ok)return access.response;const {session}=access;
  const limit=consumeRateLimit(`brand-metrics:${session.subject}`,RATE_LIMIT_RULES.brandMetrics);
  if(!limit.allowed)return NextResponse.json({error:"Too many metric requests. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  // The product must be this brand's own (getRealProductMetrics checks it against the session's
  // catalog), and the enumeration budget refuses a sweep across many products with 429.
  try{const body=await readJsonObject(request);onlyFields(body,["productId"]);return NextResponse.json({metrics:await getRealProductMetrics(session.subject,readId(body.productId,"product"))});}
  catch(error){return failureResponse(error,"Brand wear metrics failed","Wear metrics could not be loaded.");}
}
