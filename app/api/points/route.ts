import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse } from "@/lib/api-errors";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getWearPoints } from "@/lib/server/production-store";

// The signed-in person's own wear points: the rolling seven days ending on their today, and the
// all-time total. Points are earned only by recording wears, are private to the account, and no
// brand route reads them.
export async function GET(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const limit=consumeRateLimit(`points:${session.subject}`,RATE_LIMIT_RULES.pointsRead);
  if(!limit.allowed)return NextResponse.json({error:"Too many requests. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try {
    const points=await getWearPoints(session.subject,new URL(request.url).searchParams.get("today"));
    return NextResponse.json(points,{headers:{"cache-control":"no-store"}});
  } catch(error) {
    return failureResponse(error,"Wear points failed","Your points could not be loaded. Try again.");
  }
}
