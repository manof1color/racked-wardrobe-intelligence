import { NextResponse } from "next/server";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { rankSimilarRegistryProducts } from "@/lib/similar-products";
import { getPublicCommunityPost, listRegistryProducts } from "@/lib/server/production-store";
export async function GET(request:Request){
  const limit=consumeRateLimit(`similar-products:${clientIdentifier(request)}`,RATE_LIMIT_RULES.similarProducts);
  if(!limit.allowed)return NextResponse.json({error:"Too many similar-product requests. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  const url=new URL(request.url),postId=url.searchParams.get("postId")??"",garmentId=url.searchParams.get("garmentId")??"";
  if(!postId||postId.length>100||!garmentId||garmentId.length>120)return NextResponse.json({error:"A valid public post and garment ID are required."},{status:400});
  const post=await getPublicCommunityPost(postId);
  if(!post)return NextResponse.json({error:"Public outfit not found."},{status:404});
  const source=post.garments.find(garment=>garment.publicGarmentId===garmentId);
  if(!source)return NextResponse.json({error:"Published garment not found."},{status:404});
  const registry=await listRegistryProducts();
  return NextResponse.json({similar:rankSimilarRegistryProducts(source,registry)});
}

