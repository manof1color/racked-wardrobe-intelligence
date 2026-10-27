import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { failureResponse } from "@/lib/api-errors";
import { onlyFields, readId, readJsonObject } from "@/lib/request-input";
import { getBrandCommunityMetrics } from "@/lib/server/production-store";

export async function POST(request:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="brand")return NextResponse.json({error:"Brand account required."},{status:403});
  const limit=consumeRateLimit(`brand-community:${session.subject}`,RATE_LIMIT_RULES.brandMetrics);
  if(!limit.allowed)return NextResponse.json({error:"Too many metric requests. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{const body=await readJsonObject(request);onlyFields(body,["productId"]);return NextResponse.json({metrics:await getBrandCommunityMetrics(session.subject,readId(body.productId,"product"))});}
  catch(error){return failureResponse(error,"Brand community metrics failed","Community metrics could not be loaded.");}
}
