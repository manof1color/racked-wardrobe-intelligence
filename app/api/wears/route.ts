import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse } from "@/lib/api-errors";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readId, readIdList, readJsonObject, readOptionalId } from "@/lib/request-input";
import { recordRealWear } from "@/lib/server/production-store";

export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  return NextResponse.json({error:"Use the wardrobe endpoint to retrieve current wear totals."},{status:405});
}

// Records a wear the person chose to record — the Record button on a piece, on a saved outfit, or
// under a Hanger suggestion. Nothing else records one: saving an outfit, a Hanger reply, and
// publishing a look never do. The owner is the session, every piece and the outfit must be in its
// own wardrobe, and the whole wear is written at once or not at all. A retried request, or the
// same pieces again within ten minutes, changes nothing and answers 200 with `duplicate: true`.
export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const limit=consumeRateLimit(`wear:${session.subject}`,RATE_LIMIT_RULES.wearRecord);
  if(!limit.allowed)return NextResponse.json({error:"Too many wears recorded at once. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try {
    const body=await readJsonObject(request);
    onlyFields(body,["itemId","itemIds","outfitId","requestId","localDate"]);
    const single=body.itemIds===undefined;
    const ids=single?[readId(body.itemId,"wardrobe piece")]:readIdList(body.itemIds,{label:"wardrobe pieces",min:1,max:10});
    const result=await recordRealWear(session.subject,ids,{outfitId:readOptionalId(body.outfitId,"saved outfit"),requestId:readOptionalId(body.requestId,"request"),localDate:typeof body.localDate==="string"?body.localDate:null});
    const status=result.duplicate?200:201,recordedAt=new Date().toISOString();
    if(!single)return NextResponse.json({counts:result.counts,outfitWears:result.outfitWears,duplicate:result.duplicate,points:result.points,recordedAt},{status});
    return NextResponse.json({itemId:ids[0],count:result.counts[ids[0]]??0,duplicate:result.duplicate,points:result.points,recordedAt},{status});
  } catch(error) {
    return failureResponse(error,"Wear recording failed","The wear could not be recorded. Try again.");
  }
}
