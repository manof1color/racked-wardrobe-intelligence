import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { classifyGarmentImage, MAX_UPLOAD_BYTES, type InMemoryGarmentImage } from "@/lib/garment-analysis";
import { buildPhotoPlan } from "@/lib/photo-plan";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Adaptive enrollment step 1: classify the first (front) photo and return a photo plan
// describing exactly which additional shots this category needs, with visible reasoning.
// Nothing is stored here, and the response carries category evidence only — brand
// verification is untouched and still requires registry GTIN / brand-plus-SKU evidence
// at analysis time, regardless of which plan the user follows or overrides.
export async function POST(request:Request) {
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="consumer")return NextResponse.json({error:"Only Consumer accounts can classify wardrobe photos."},{status:403});
  const limit=consumeRateLimit(`garment-classify:${session.subject}`,RATE_LIMIT_RULES.garmentClassify);
  if(!limit.allowed)return NextResponse.json({error:"Too many classification requests. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  if(Number(request.headers.get("content-length")??0)>MAX_UPLOAD_BYTES+1_000_000)return NextResponse.json({error:"The photo must be no more than 5 MB."},{status:413});
  try {
    const form=await request.formData();
    const file=form.get("front");
    if(!(file instanceof File)||file.size===0)return NextResponse.json({error:"Add the front photo first."},{status:400});
    if(file.size>MAX_UPLOAD_BYTES)return NextResponse.json({error:"The photo must be no more than 5 MB."},{status:413});
    const optimized=await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({width:1200,height:1200,fit:"inside",withoutEnlargement:true}).jpeg({quality:80}).toBuffer();
    const image:InMemoryGarmentImage={view:"front",contentType:"image/jpeg",base64:optimized.toString("base64")};
    const classified=await classifyGarmentImage(image);
    const plan=classified
      ?buildPhotoPlan(classified.category,{source:"ai",confidence:classified.confidence,aiReasoning:classified.reasoning})
      :buildPhotoPlan("unknown",{source:"fallback"});
    return NextResponse.json({plan,retention:"The classification photo was processed in request memory and was not stored."});
  } catch {
    return NextResponse.json({plan:buildPhotoPlan("unknown",{source:"fallback"}),retention:"The classification photo was processed in request memory and was not stored."});
  }
}
