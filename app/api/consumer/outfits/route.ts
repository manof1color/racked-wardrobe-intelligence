import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse } from "@/lib/api-errors";
import { deleteOutfit, listOutfits, listWardrobe, saveOutfit, updateOutfitItems } from "@/lib/server/production-store";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readId, readIdList, readJsonObject, readText } from "@/lib/request-input";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  return NextResponse.json({ outfits: await listOutfits(session.subject) });
}

// Saving an outfit saves it; it never records a wear (POST /api/wears does, when asked).
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "consumer") return NextResponse.json({ error: "Consumer account required." }, { status: 403 });
  const limit = consumeRateLimit(`outfit-write:${session.subject}`, RATE_LIMIT_RULES.outfitWrite);
  if (!limit.allowed) return NextResponse.json({ error: "Too many outfit changes at once. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["name", "itemIds"]);
    const itemIds = readIdList(body.itemIds, { label: "wardrobe pieces", min: 1, max: 10 });
    const name = readText(body.name, { label: "the outfit name", max: 200, optional: true });
    // Every piece is checked against this account's own wardrobe before anything is saved.
    const wardrobe = await listWardrobe(session.subject);
    if (itemIds.some((id) => !wardrobe.some((item) => item.id === id))) return NextResponse.json({ error: "Every outfit piece must belong to your wardrobe." }, { status: 400 });
    return NextResponse.json({ outfit: await saveOutfit(session.subject, name || "Saved outfit", itemIds) }, { status: 201 });
  } catch (error) {
    return failureResponse(error, "Outfit save failed", "The outfit could not be saved. Try again.");
  }
}

export async function PATCH(request: Request) {
  const session=await getSession();
  if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`outfit-write:${session.subject}`,RATE_LIMIT_RULES.outfitWrite);
  if(!limit.allowed)return NextResponse.json({error:"Too many outfit changes at once. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{
    const body=await readJsonObject(request);
    onlyFields(body,["outfitId","itemIds"]);
    const outfitId=readId(body.outfitId,"saved outfit");
    const itemIds=readIdList(body.itemIds,{label:"wardrobe pieces",min:1,max:10});
    const outfit=await updateOutfitItems(session.subject,outfitId,itemIds);
    if(!outfit)return NextResponse.json({error:"Saved outfit not found."},{status:404});
    return NextResponse.json({outfit});
  }catch(error){
    return failureResponse(error,"Outfit update failed","Saved outfit could not be updated. Try again.");
  }
}

export async function DELETE(request: Request) {
  const session=await getSession();
  if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const limit=consumeRateLimit(`outfit-write:${session.subject}`,RATE_LIMIT_RULES.outfitWrite);
  if(!limit.allowed)return NextResponse.json({error:"Too many outfit changes at once. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  try{
    const body=await readJsonObject(request);
    onlyFields(body,["outfitId"]);
    const outfitId=readId(body.outfitId,"saved outfit");
    if(!await deleteOutfit(session.subject,outfitId))return NextResponse.json({error:"Saved outfit not found."},{status:404});
    return NextResponse.json({deleted:true,outfitId});
  }catch(error){
    return failureResponse(error,"Outfit delete failed","Saved outfit could not be deleted. Try again.");
  }
}
