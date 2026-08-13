import type { BrandCommunityMetrics, OutfitPost } from "./platform-types.ts";

export interface PrivacySafeCommunityEvent {
  postId?: string;
  productId?: string;
  eventType: "recreate-look-request" | "product-click" | "outbound-product-click";
  createdAt: string;
}

function rankedCounts(values:string[]){
  const counts=new Map<string,number>();
  for(const value of values)counts.set(value,(counts.get(value)??0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}

export function buildBrandCommunityMetrics(productId:string,posts:OutfitPost[],events:PrivacySafeCommunityEvent[]):BrandCommunityMetrics{
  const appearances=posts.filter(post=>post.garments.some(garment=>garment.verifiedProduct?.registryProductId===productId));
  const appearanceIds=new Set(appearances.map(post=>post.id));
  const pairedGarments=appearances.flatMap(post=>post.garments.filter(garment=>garment.verifiedProduct?.registryProductId!==productId));
  const pairedProducts=new Map<string,{productId:string;name:string;brand:string;appearances:number}>();
  for(const garment of pairedGarments){
    const product=garment.verifiedProduct;
    if(!product)continue;
    const current=pairedProducts.get(product.registryProductId);
    pairedProducts.set(product.registryProductId,{productId:product.registryProductId,name:product.name,brand:product.brand,appearances:(current?.appearances??0)+1});
  }
  return {
    productId,
    publicOutfitAppearances:appearances.length,
    consumerOutfitAppearances:appearances.filter(post=>post.sourceType==="consumer").length,
    brandLookAppearances:appearances.filter(post=>post.sourceType==="brand").length,
    inspirationCount:appearances.reduce((sum,post)=>sum+post.likes,0),
    recreateLookRequests:events.filter(event=>event.eventType==="recreate-look-request"&&event.postId&&appearanceIds.has(event.postId)).length,
    outboundProductClicks:events.filter(event=>event.eventType==="outbound-product-click"&&(event.productId?event.productId===productId:Boolean(event.postId&&appearanceIds.has(event.postId)))).length,
    pairedCategories:rankedCounts(pairedGarments.map(garment=>garment.category)).slice(0,6).map(([category,count])=>({category,appearances:count})),
    pairedVerifiedProducts:[...pairedProducts.values()].sort((a,b)=>b.appearances-a.appearances||a.name.localeCompare(b.name)).slice(0,6),
    privacyBoundary:"PUBLIC_ACTIVITY_ONLY",
  };
}
