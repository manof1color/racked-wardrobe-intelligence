import { NextResponse } from "next/server";
import { brandAccess } from "@/lib/server/brand-access";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { failureResponse } from "@/lib/api-errors";
import { onlyFields, readId, readJsonObject } from "@/lib/request-input";
import { getBrandCommunityMetrics } from "@/lib/server/production-store";

export async function POST(request:Request){
  const access=await brandAccess();if(!access.ok)return access.response;const {session}=access;
  const limit=consumeRateLimit(`brand-community:${session.subject}`,RATE_LIMIT_RULES.brandMetrics);
  if(!limit.allowed)return NextResponse.json({error:"Too many metric requests. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{const body=await readJsonObject(request);onlyFields(body,["productId"]);return NextResponse.json({metrics:await getBrandCommunityMetrics(session.subject,readId(body.productId,"product"))});}
  catch(error){return failureResponse(error,"Brand community metrics failed","Community metrics could not be loaded.");}
}
