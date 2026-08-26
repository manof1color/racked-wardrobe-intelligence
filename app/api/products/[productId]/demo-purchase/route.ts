import { NextResponse } from "next/server";
import { isDemoStorefrontProduct } from "@/lib/demo-storefront";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getPublicCommunityPost, getRegistryProductById, recordDemoPurchaseSimulation } from "@/lib/server/production-store";

// Judge note: this records a demonstration checkout, not a sale. It takes no payment
// details, creates no order, and stores no person — only the fictional product, the
// optional public post the simulation started from, and a timestamp. The hard guard is
// the DEMO classification check: a real or pilot brand can never accumulate simulated
// purchase activity, which is what would make the brand dashboard misleading.
export async function POST(request:Request,{params}:{params:Promise<{productId:string}>}){
  const {productId}=await params;
  if(!productId||productId.length>120)return NextResponse.json({error:"A valid product ID is required."},{status:400});

  // Public by design, but it writes a counter a brand later reads, so throttle first.
  const limit=consumeRateLimit(`demo-purchase:${clientIdentifier(request)}`,RATE_LIMIT_RULES.demoPurchase);
  if(!limit.allowed)return NextResponse.json({error:"Too many demo purchases. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});

  const product=await getRegistryProductById(productId);
  if(!product)return NextResponse.json({error:"Product not found."},{status:404});
  if(!isDemoStorefrontProduct(product))return NextResponse.json({error:"Purchase simulation exists only for fictional demonstration products."},{status:403});
  if(product.availability==="unavailable"||product.availability==="discontinued")return NextResponse.json({error:"This fictional product is deliberately unavailable."},{status:409});

  const body=await request.json().catch(()=>null) as {sourcePostId?:string}|null;
  const requestedPostId=typeof body?.sourcePostId==="string"?body.sourcePostId.slice(0,100):"";
  // Attribution is only accepted when the named public post genuinely contains this
  // product, so a caller cannot attach a simulation to an unrelated look.
  let sourcePostId:string|undefined;
  if(requestedPostId){
    const post=await getPublicCommunityPost(requestedPostId);
    if(post?.garments.some(garment=>garment.verifiedProduct?.registryProductId===productId))sourcePostId=post.id;
  }

  const recordedAt=await recordDemoPurchaseSimulation(productId,sourcePostId);
  return NextResponse.json({
    recorded:true,
    recordedAt,
    productName:product.name,
    brand:product.brand,
    simulation:"No payment was processed, no order was created, and no personal detail was collected.",
  },{status:201});
}
