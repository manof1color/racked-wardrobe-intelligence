import test from "node:test";
import assert from "node:assert/strict";
import { buildBrandCommunityMetrics } from "../lib/brand-community-metrics.ts";
import type { OutfitPost } from "../lib/platform-types.ts";

const garment=(id:string,category:string,name=id)=>({publicGarmentId:`g-${id}`,name,category,image:"",resolutionState:"EXACT_VERIFIED_PRODUCT" as const,verifiedProduct:{registryProductId:id,sku:`SKU-${id}`,name,brand:"Synthetic Brand",brandSlug:"synthetic-brand"}});
const posts:OutfitPost[]=[
  {id:"post-1",handle:"@private_not_returned",outfitTitle:"One",caption:"",image:"",createdAt:"2026-08-13T00:00:00Z",likes:7,sourceType:"consumer",garments:[garment("target","top"),garment("shoe","shoes","Demo Sneaker")],products:[]},
  {id:"post-2",handle:"@also_private",outfitTitle:"Two",caption:"",image:"",createdAt:"2026-08-13T00:00:00Z",likes:3,sourceType:"brand",garments:[garment("target","top"),{publicGarmentId:"generic",name:"Jeans",category:"bottom",image:"",resolutionState:"GENERIC_UNVERIFIED"}],products:[]},
];

test("brand community metrics aggregate only public activity and preserve source distinctions",()=>{
  const metrics=buildBrandCommunityMetrics("target",posts,[{postId:"post-1",eventType:"recreate-look-request",createdAt:"2026-08-13T00:00:00Z"},{productId:"target",postId:"post-1",eventType:"outbound-product-click",createdAt:"2026-08-13T00:00:00Z"}]);
  assert.equal(metrics.publicOutfitAppearances,2);
  assert.equal(metrics.consumerOutfitAppearances,1);
  assert.equal(metrics.brandLookAppearances,1);
  assert.equal(metrics.inspirationCount,10);
  assert.equal(metrics.recreateLookRequests,1);
  assert.equal(metrics.outboundProductClicks,1);
  assert.deepEqual(metrics.pairedCategories,[{category:"bottom",appearances:1},{category:"shoes",appearances:1}]);
  assert.equal(metrics.privacyBoundary,"PUBLIC_ACTIVITY_ONLY");
  assert.doesNotMatch(JSON.stringify(metrics),/private_not_returned|also_private/);
});

test("unrelated posts and events do not enter a product aggregate",()=>{
  const metrics=buildBrandCommunityMetrics("other",posts,[{postId:"post-1",eventType:"recreate-look-request",createdAt:"2026-08-13T00:00:00Z"},{postId:"post-1",productId:"target",eventType:"outbound-product-click",createdAt:"2026-08-13T00:00:00Z"}]);
  assert.equal(metrics.publicOutfitAppearances,0);
  assert.equal(metrics.recreateLookRequests,0);
  assert.equal(metrics.outboundProductClicks,0);
  assert.deepEqual(metrics.pairedVerifiedProducts,[]);
});
