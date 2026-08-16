import test from "node:test";
import assert from "node:assert/strict";
import { publishedImageKey, toPublicOutfitPost } from "../lib/community-post.ts";

const stored = {
  id:"post-1",ownerId:"private-account-uuid",sourceOutfitId:"private-outfit-id",imageKey:"wardrobe/private-account-uuid/photo.png",
  PK:"COMMUNITY",SK:"POST#2026-08-09#post-1",GSI1PK:"SHOULD-NEVER-SHIP",handle:"@casual_stylist",outfitTitle:"Weekend rotation",caption:"Synthetic test post",createdAt:"2026-08-09T12:00:00.000Z",likes:4,sourceType:"consumer" as const,
  publishedGarments:[
    {publicGarmentId:"public-top",name:"Test Rotation Tee",category:"top",subtype:"t-shirt",color:"white",imageKey:"wardrobe/private-account-uuid/top.png",resolutionState:"EXACT_VERIFIED_PRODUCT" as const,verifiedProduct:{registryProductId:"product-1",sku:"RTA-TEE-001",name:"Test Rotation Tee",brand:"Racked Test Atelier",brandSlug:"racked-test-atelier"},internalNote:"private"},
    {publicGarmentId:"public-bottom",name:"Black trousers",category:"bottom",subtype:"dress-pants",imageKey:"wardrobe/private-account-uuid/bottom.png",resolutionState:"GENERIC_UNVERIFIED" as const,unverifiedBrandLabel:"User-entered label",wardrobeItemId:"private-garment-id"},
  ],
};

test("public community posts contain only the allowlisted outfit fields",()=>{
  const post=toPublicOutfitPost(stored);
  assert.deepEqual(Object.keys(post).sort(),["caption","createdAt","garments","handle","id","image","likes","outfitTitle","products","sourceType"]);
  assert.equal(post.image,"/api/community/images/post-1/public-top");
  assert.equal(post.garments.length,2);
});

test("private identity, outfit IDs, wardrobe IDs, and S3 keys never survive sanitization",()=>{
  const serialized=JSON.stringify(toPublicOutfitPost(stored));
  assert.doesNotMatch(serialized,/private-account-uuid|private-outfit-id|private-garment-id|imageKey|ownerId|GSI1PK|SHOULD-NEVER-SHIP|internalNote|wardrobe\//);
  assert.doesNotMatch(serialized,/"PK"|"SK"/);
});

test("only exact verified products produce brand-link projections",()=>{
  const post=toPublicOutfitPost(stored);
  assert.deepEqual(post.products,[{sku:"RTA-TEE-001",name:"Test Rotation Tee",brand:"Racked Test Atelier",brandSlug:"racked-test-atelier",category:"top"}]);
  assert.equal(post.garments[0].resolutionState,"EXACT_VERIFIED_PRODUCT");
  assert.equal(post.garments[1].resolutionState,"GENERIC_UNVERIFIED");
  assert.equal(post.garments[1].verifiedProduct,undefined);
});

test("external stored image URLs are not reflected and defaults remain safe",()=>{
  const minimal=toPublicOutfitPost({id:"p2",image:"https://signed.example/private.png?token=secret"});
  assert.equal(minimal.image,"");
  assert.equal(minimal.sourceType,"consumer");
  assert.deepEqual(minimal.garments,[]);
  assert.deepEqual(minimal.products,[]);
  assert.equal("fictional" in minimal,false);
  assert.equal(toPublicOutfitPost({id:"p3",fictional:true}).fictional,true);
});

test("the image proxy resolves only explicitly published garment IDs",()=>{
  assert.equal(publishedImageKey(stored,"public-top"),"wardrobe/private-account-uuid/top.png");
  assert.equal(publishedImageKey(stored,"not-published"),undefined);
});

test("fictional DEMO posts use only curated public product photography",()=>{
  const demo=toPublicOutfitPost({...stored,fictional:true,dataClassification:"DEMO" as const,publishedGarments:stored.publishedGarments.map((garment,index)=>index===0?{...garment,verifiedProduct:{...garment.verifiedProduct!,sku:"RTA-001"}}:garment)});
  assert.equal(demo.garments[0].image,"/demo-products/RTA-001.webp");
  assert.equal(demo.garments[1].image,"/api/community/images/post-1/public-bottom","unverified pieces keep the post-scoped proxy");
});
