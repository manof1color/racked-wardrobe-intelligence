import { NextResponse } from "next/server";
import { commerceDestination } from "@/lib/commerce";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getPublicCommunityPost, getRegistryProductById, recordPrivacySafeCommerceEvent } from "@/lib/server/production-store";

export async function GET(request:Request,{params}:{params:Promise<{productId:string}>}){
  const {productId}=await params;
  if(!productId||productId.length>120)return NextResponse.json({error:"A valid product ID is required."},{status:400});
  // This endpoint is public by design, but it also writes an outbound-interest event a
  // brand later sees. Without a limit anyone could inflate that counter by replaying the
  // URL, so the click budget is throttled per caller before anything is recorded.
  const limit=consumeRateLimit(`outbound:${clientIdentifier(request)}`,RATE_LIMIT_RULES.outboundClick);
  if(!limit.allowed)return NextResponse.json({error:"Too many product redirects. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const product=await getRegistryProductById(productId);
  if(!product)return NextResponse.json({error:"Product not found."},{status:404});
  // commerceDestination re-validates the stored URL and throws on anything malformed;
  // a legacy or seeded record must produce a clean 404, never an unhandled 500.
  let destination:ReturnType<typeof commerceDestination>;
  try{destination=commerceDestination(product);}
  catch{return NextResponse.json({error:"This product has no usable shopping destination.",state:"NO_DESTINATION"},{status:404});}
  if(destination.state!=="EXACT_AVAILABLE"||!destination.url)return NextResponse.json({error:"This exact product has no available shopping destination.",state:destination.state},{status:404});
  const requestedPostId=new URL(request.url).searchParams.get("sourcePostId")??"";
  let sourcePostId: string|undefined;
  if(requestedPostId&&requestedPostId.length<=100){const post=await getPublicCommunityPost(requestedPostId);if(post?.garments.some(garment=>garment.verifiedProduct?.registryProductId===productId))sourcePostId=post.id;}
  await recordPrivacySafeCommerceEvent(productId,sourcePostId);
  return NextResponse.redirect(destination.url,307);
}
