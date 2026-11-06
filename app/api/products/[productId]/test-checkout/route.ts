import { NextResponse } from "next/server";
import { clientIdentifier, consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { getRegistryProductById } from "@/lib/server/production-store";
import { publicOrigin } from "@/lib/site-origin";
import { createTestCheckoutSession, stripeTestKey, TestCheckoutError, testCheckoutRefusal } from "@/lib/test-checkout";

// Judge note: Stripe test mode on a fictional product (lib/test-checkout.ts). No money moves, no
// order is created, and nothing is stored. Takes no body: the price comes from the catalog here.
export async function POST(request:Request,{params}:{params:Promise<{productId:string}>}){
  const {productId}=await params;
  if(!productId||productId.length>120)return NextResponse.json({error:"A valid product ID is required."},{status:400});

  const key=stripeTestKey(process.env.STRIPE_SECRET_KEY);
  if(!key)return NextResponse.json({error:"Test checkout is not switched on."},{status:503});

  const limit=consumeRateLimit(`test-checkout:${clientIdentifier(request)}`,RATE_LIMIT_RULES.testCheckout);
  if(!limit.allowed)return NextResponse.json({error:"Too many test checkouts. Try again shortly."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});

  const product=await getRegistryProductById(productId);
  if(!product)return NextResponse.json({error:"Product not found."},{status:404});
  const refusal=testCheckoutRefusal(product);
  if(refusal)return NextResponse.json({error:refusal.error},{status:refusal.status});

  try{
    return NextResponse.json({url:await createTestCheckoutSession(product,{key,origin:publicOrigin()})},{status:201});
  }catch(error){
    console.error("Test checkout could not start.",{detail:error instanceof TestCheckoutError?error.message:"The request to Stripe failed."});
    return NextResponse.json({error:"Test checkout could not start. Try again shortly."},{status:502});
  }
}
