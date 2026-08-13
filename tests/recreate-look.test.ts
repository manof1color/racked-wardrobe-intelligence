import test from "node:test";
import assert from "node:assert/strict";
import { recreateLook } from "../lib/recreate-look.ts";
import type { PublicOutfitGarment } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const target=(overrides:Partial<PublicOutfitGarment>={}):PublicOutfitGarment=>({publicGarmentId:"public-top",name:"White cotton tee",category:"top",subtype:"t-shirt",color:"white",pattern:"solid",style:["casual","minimal"],material:"cotton",image:"/api/community/images/post/public-top",resolutionState:"GENERIC_UNVERIFIED",...overrides});
const owned=(overrides:Partial<WardrobeItem>={}):WardrobeItem=>({id:"owned-top",name:"My white tee",category:"top",subtype:"t-shirt",color:"white",pattern:"solid",material:"cotton",style:["casual","minimal"],season:"all-season",wearCount:3,lastWornDays:2,source:"ai-confirmed",art:"photo",...overrides});

test("same authorized registry product is exact owned",()=>{
  const garment=target({resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:"product-1",sku:"SKU-1",name:"Catalog tee",brand:"Test Brand",brandSlug:"test-brand"}});
  const result=recreateLook("post-1",[garment],[owned({identityStatus:"verified",registryProductId:"product-1",brand:"Test Brand",sku:"SKU-1"})]);
  assert.equal(result.coveragePercentage,100);
  assert.equal(result.pieces[0].state,"EXACT_OWNED");
  assert.equal(result.pieces[0].components[0].key,"registry");
});

test("visual similarity can create an explainable substitute but never exact ownership",()=>{
  const garment=target({resolutionState:"AI_ESTIMATED_PRODUCT",verifiedProduct:undefined});
  const result=recreateLook("post-2",[garment],[owned({identityStatus:"suggested",registryProductId:null})]);
  assert.equal(result.pieces[0].state,"STRONG_SUBSTITUTE");
  assert.notEqual(result.pieces[0].state,"EXACT_OWNED");
  assert.equal(result.pieces[0].components.reduce((sum,component)=>sum+component.weight,0),1);
  assert.match(result.methodology,/registry product ID/i);
});

test("cross-category items are missing rather than misleading substitutes",()=>{
  const result=recreateLook("post-3",[target()],[owned({id:"owned-shoe",category:"shoe",subtype:"sneakers"})]);
  assert.equal(result.coveragePercentage,0);
  assert.equal(result.pieces[0].state,"MISSING");
  assert.equal(result.pieces[0].ownedItem,null);
  assert.match(result.pieces[0].reasons[0],/cross-category/i);
});

test("one owned piece cannot cover two public outfit targets",()=>{
  const targets=[target(),target({publicGarmentId:"public-top-2",name:"Second tee"})];
  const result=recreateLook("post-4",targets,[owned()]);
  assert.equal(result.coveredPieces,1);
  assert.equal(result.pieces[0].state,"STRONG_SUBSTITUTE");
  assert.equal(result.pieces[1].state,"MISSING");
});

test("candidate tie-breaking is deterministic and exposes no private storage key",()=>{
  const result=recreateLook("post-5",[target()],[owned({id:"b",imageKey:"wardrobe/private/b.png"}),owned({id:"a",imageKey:"wardrobe/private/a.png"})]);
  assert.equal(result.pieces[0].ownedItem?.id,"a");
  assert.doesNotMatch(JSON.stringify(result),/imageKey|wardrobe\/private/);
});
