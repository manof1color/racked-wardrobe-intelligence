import test from "node:test";
import assert from "node:assert/strict";
import { rankSimilarRegistryProducts } from "../lib/similar-products.ts";
import type { BrandProductRegistration, PublicOutfitGarment } from "../lib/platform-types.ts";
const source:PublicOutfitGarment={publicGarmentId:"g",name:"Tee",category:"top",subtype:"t-shirt",color:"white",pattern:"solid",style:["casual"],material:"cotton",image:"",resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct:{registryProductId:"source",sku:"S",name:"Tee",brand:"Demo",brandSlug:"demo"}};
const product=(overrides:Partial<BrandProductRegistration>={}):BrandProductRegistration=>({id:"candidate",ownerSubject:"brand",name:"Candidate",brand:"Fictional",brandSlug:"fictional",aliases:[],sku:"C",gtin:null,category:"top",subtype:"t-shirt",color:"white",pattern:"solid",style:["casual"],material:"cotton",labelText:"C",views:{} as BrandProductRegistration["views"],enrolledAt:"2026-08-14",source:"brand-enrolled",productUrl:"https://example.test/C",availability:"available",...overrides});
test("registry similarity is same-category, available, explainable, and never exact",()=>{
 const results=rankSimilarRegistryProducts(source,[product({id:"source"}),product({id:"shoe",category:"shoe"}),product({id:"archived",archived:true}),product({id:"gone",availability:"unavailable"}),product()]);
 assert.equal(results.length,1);assert.equal(results[0].registryProductId,"candidate");assert.equal(results[0].commerceState,"SIMILAR_AVAILABLE");assert.equal(results[0].score,100);assert.ok(results[0].reasons.length);assert.doesNotMatch(JSON.stringify(results),/EXACT_VERIFIED_PRODUCT|ownerSubject|views/);
});
test("unsafe or absent destinations are excluded",()=>{assert.deepEqual(rankSimilarRegistryProducts(source,[product({productUrl:undefined})]),[]);assert.deepEqual(rankSimilarRegistryProducts(source,[product({productUrl:"http://unsafe.test"})]),[]);});
test("ties are deterministic and different attributes score lower",()=>{const results=rankSimilarRegistryProducts({...source,verifiedProduct:undefined},[product({id:"b"}),product({id:"a"}),product({id:"partial",subtype:"polo",color:"red",pattern:"striped",style:["formal"],material:"wool"})]);assert.deepEqual(results.map(x=>x.registryProductId),["a","b","partial"]);assert.equal(results[2].score,30);});

