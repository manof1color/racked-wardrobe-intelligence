import { NextResponse } from "next/server";
import { brandAccess } from "@/lib/server/brand-access";
import { failureResponse } from "@/lib/api-errors";
import { listBrandLooks, saveBrandLook } from "@/lib/server/production-store";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readBoolean, readIdList, readJsonObject, readText } from "@/lib/request-input";

export async function GET(){const access=await brandAccess();if(!access.ok)return access.response;const {session}=access;
  return NextResponse.json({looks:await listBrandLooks(session.subject)});}

// Every product in a Look must be this brand's own; saveBrandLook checks each one against the
// session's catalog before anything is saved.
export async function POST(request:Request){
  const access=await brandAccess({write:true});if(!access.ok)return access.response;const {session}=access;
  const limit=consumeRateLimit(`brand-look:${session.subject}`,RATE_LIMIT_RULES.brandLookPublish);
  if(!limit.allowed)return NextResponse.json({error:"Too many Looks at once. Try again later."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{
    const body=await readJsonObject(request);
    onlyFields(body,["title","caption","productIds","published"]);
    const look={title:readText(body.title,{label:"a title",max:80,min:3}),caption:readText(body.caption,{label:"a caption",max:280,min:3}),productIds:readIdList(body.productIds,{label:"brand products",min:1,max:10}),published:body.published===undefined?false:readBoolean(body.published,"published")};
    return NextResponse.json(await saveBrandLook(session.subject,look),{status:201});
  }
  catch(error){return failureResponse(error,"Brand Look save failed","The Look could not be saved. Try again.");}
}
