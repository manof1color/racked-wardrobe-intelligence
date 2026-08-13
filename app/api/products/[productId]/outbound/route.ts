import { NextResponse } from "next/server";
import { commerceDestination } from "@/lib/commerce";
import { getPublicCommunityPost, getRegistryProductById, recordPrivacySafeCommerceEvent } from "@/lib/server/production-store";

export async function GET(request:Request,{params}:{params:Promise<{productId:string}>}){
  const {productId}=await params;
  if(!productId||productId.length>120)return NextResponse.json({error:"A valid product ID is required."},{status:400});
  const product=await getRegistryProductById(productId);
  if(!product)return NextResponse.json({error:"Product not found."},{status:404});
  const destination=commerceDestination(product);
  if(destination.state!=="EXACT_AVAILABLE"||!destination.url)return NextResponse.json({error:"This exact product has no available shopping destination.",state:destination.state},{status:404});
  const requestedPostId=new URL(request.url).searchParams.get("sourcePostId")??"";
  let sourcePostId: string|undefined;
  if(requestedPostId&&requestedPostId.length<=100){const post=await getPublicCommunityPost(requestedPostId);if(post?.garments.some(garment=>garment.verifiedProduct?.registryProductId===productId))sourcePostId=post.id;}
  await recordPrivacySafeCommerceEvent(productId,sourcePostId);
  return NextResponse.redirect(destination.url,307);
}
