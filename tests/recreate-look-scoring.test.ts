import test from "node:test";
import assert from "node:assert/strict";
import { RECREATE_APPEARANCE_WEIGHTS, recreateLook, scoreGarmentAppearance, type GarmentAppearance } from "../lib/recreate-look.ts";
import type { PublicOutfitGarment } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

/**
 * The scoring rules behind "Recreate with my wardrobe", exercised through their behaviour rather
 * than their shape. This is the engine the judge path leads with, so every band, tie-break, and
 * uncertainty rule it can take is stated here as an expected number.
 */

const target=(overrides:Partial<PublicOutfitGarment>={}):PublicOutfitGarment=>({publicGarmentId:"public-top",name:"White cotton tee",category:"top",subtype:"t-shirt",color:"white",pattern:"solid",style:["casual","minimal"],material:"cotton",image:"/api/community/images/post/public-top",resolutionState:"GENERIC_UNVERIFIED",...overrides});
const owned=(overrides:Partial<WardrobeItem>={}):WardrobeItem=>({id:"owned-top",name:"My white tee",category:"top",subtype:"t-shirt",color:"white",pattern:"solid",material:"cotton",style:["casual","minimal"],season:"all-season",wearCount:3,lastWornDays:2,source:"ai-confirmed",art:"photo",...overrides});
const verifiedProduct={registryProductId:"product-1",sku:"SKU-1",name:"Catalog tee",brand:"Test Brand",brandSlug:"test-brand"};
const componentScore=(targetSide:GarmentAppearance,ownedSide:GarmentAppearance,key:string)=>
  scoreGarmentAppearance(targetSide,ownedSide).components.find((component)=>component.key===key)!.score;
const firstPiece=(item:Partial<WardrobeItem>)=>recreateLook("post",[target()],[owned(item)]).pieces[0];

test("colour scoring separates an exact match, a spelling variant, two neutrals, and a clash",()=>{
  assert.equal(componentScore({category:"top",color:"white"},{category:"top",color:"white"},"color"),100);
  assert.equal(componentScore({category:"top",color:"gray"},{category:"top",color:"grey"},"color"),100,"one colour, two spellings");
  assert.equal(componentScore({category:"top",color:"grey"},{category:"top",color:"gray"},"color"),100);
  assert.equal(componentScore({category:"top",color:"black"},{category:"top",color:"navy"},"color"),70,"two neutrals are a plausible stand-in");
  assert.equal(componentScore({category:"top",color:"red"},{category:"top",color:"green"},"color"),0);
  assert.equal(componentScore({category:"top",color:"unknown"},{category:"top",color:"red"},"color"),50,"unknown is uncertainty, not a clash");
  assert.equal(componentScore({category:"top"},{category:"top",color:"red"},"color"),50);
});

test("an unknown attribute scores as uncertainty, and subtype uncertainty is worth less",()=>{
  assert.equal(componentScore({category:"top",subtype:"unknown"},{category:"top",subtype:"t-shirt"},"subtype"),45,"a missing subtype is the least certain of all");
  assert.equal(componentScore({category:"top",pattern:"unknown"},{category:"top",pattern:"solid"},"pattern"),50);
  assert.equal(componentScore({category:"top",material:"cotton"},{category:"top"},"material"),50);
  assert.equal(componentScore({category:"top",subtype:"t-shirt"},{category:"top",subtype:"t-shirt"},"subtype"),100);
  assert.equal(componentScore({category:"top",subtype:"t-shirt"},{category:"top",subtype:"hoodie"},"subtype"),0);
});

test("style overlap is proportional, and an unlabelled target style is uncertainty",()=>{
  assert.equal(componentScore({category:"top",style:["casual","minimal"]},{category:"top",style:["casual","minimal"]},"style"),100);
  assert.equal(componentScore({category:"top",style:["casual","minimal"]},{category:"top",style:["casual"]},"style"),50,"one of the two styles is shared");
  assert.equal(componentScore({category:"top",style:["casual"]},{category:"top",style:["formal"]},"style"),0);
  assert.equal(componentScore({category:"top",style:[]},{category:"top",style:["casual"]},"style"),50);
  assert.equal(componentScore({category:"top"},{category:"top"},"style"),50);
});

test("substitute bands follow the weighted score, with the numbers stated",()=>{
  const strong=firstPiece({});
  assert.equal(strong.state,"STRONG_SUBSTITUTE");
  assert.equal(strong.score,100);

  // Category and pattern still match; the subtype does not, and white against black is
  // neutral-to-neutral rather than a clash.
  const acceptable=firstPiece({subtype:"hoodie",color:"black"});
  assert.equal(acceptable.score,69);
  assert.equal(acceptable.state,"ACCEPTABLE_SUBSTITUTE");

  // Only the category survives.
  const weak=firstPiece({subtype:"hoodie",color:"red",pattern:"striped",style:["formal"],material:"denim"});
  assert.equal(weak.score,30);
  assert.equal(weak.state,"WEAK_SUBSTITUTE");
});

test("coverage credits each state differently, and an empty look is zero",()=>{
  assert.equal(recreateLook("post",[],[]).coveragePercentage,0,"no pieces cannot be a full wardrobe");
  const exact=recreateLook("post",[target({resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct})],[owned({identityStatus:"verified",registryProductId:"product-1"})]);
  assert.equal(exact.coveragePercentage,100);
  assert.equal(recreateLook("post",[target()],[owned()]).coveragePercentage,85,"a strong substitute is not a whole piece");
  assert.equal(recreateLook("post",[target()],[owned({subtype:"hoodie",color:"black"})]).coveragePercentage,60);
  assert.equal(recreateLook("post",[target()],[owned({subtype:"hoodie",color:"red",pattern:"striped",style:["formal"],material:"denim"})]).coveragePercentage,25);
  assert.equal(recreateLook("post",[target()],[]).coveragePercentage,0);
});

// REGRESSION: the identity boundary, seen from the Recreate side. Appearance and an unverified
// label can both look convincing; neither may become ownership of a registry product.
test("REGRESSION: only a verified registry match is exact ownership",()=>{
  const garment=target({resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct});
  const unverifiedLabel=recreateLook("post",[garment],[owned({identityStatus:"suggested",registryProductId:"product-1"})]).pieces[0];
  assert.notEqual(unverifiedLabel.state,"EXACT_OWNED","an unverified label is not ownership");
  const differentProduct=recreateLook("post",[garment],[owned({identityStatus:"verified",registryProductId:"product-2"})]).pieces[0];
  assert.notEqual(differentProduct.state,"EXACT_OWNED");
  assert.equal(differentProduct.components[0].key,"category","it falls through to appearance scoring");
});

test("ties resolve by a stable id order, so two runs never disagree",()=>{
  const twins=[owned({id:"owned-b"}),owned({id:"owned-a"})];
  assert.equal(recreateLook("post",[target()],twins).pieces[0].ownedItem?.id,"owned-a");
  assert.equal(recreateLook("post",[target()],[...twins].reverse()).pieces[0].ownedItem?.id,"owned-a");

  const verifiedTwins=[owned({id:"verified-b",identityStatus:"verified",registryProductId:"product-1"}),owned({id:"verified-a",identityStatus:"verified",registryProductId:"product-1"})];
  const exact=recreateLook("post",[target({resolutionState:"EXACT_VERIFIED_PRODUCT",verifiedProduct})],verifiedTwins).pieces[0];
  assert.equal(exact.ownedItem?.id,"verified-a");
  assert.equal(exact.components[0].weight,1,"an exact match rests on the registry alone");
});

test("reasons quote the two strongest components with their evidence",()=>{
  const piece=firstPiece({subtype:"hoodie",color:"black"});
  assert.equal(piece.reasons.length,2);
  assert.equal(piece.reasons[0],"Broad category: top vs top (100/100).");
  assert.equal(piece.reasons[1],"Color: white vs black (70/100).");
});

test("summaries carry only the fields the closet and the post actually have",()=>{
  const sparse=recreateLook("post",[target({subtype:undefined,color:undefined})],[owned({subtype:undefined,imageUrl:undefined})]).pieces[0];
  assert.equal("subtype" in sparse.target,false);
  assert.equal("color" in sparse.target,false);
  assert.equal("subtype" in sparse.ownedItem!,false);
  assert.equal("imageUrl" in sparse.ownedItem!,false);
  const withImage=firstPiece({imageUrl:"https://example.test/piece.png"});
  assert.equal(withImage.ownedItem?.imageUrl,"https://example.test/piece.png");
});

test("the stated methodology matches the weights the engine applies",()=>{
  const {methodology}=recreateLook("post",[target()],[owned()]);
  const total=Object.values(RECREATE_APPEARANCE_WEIGHTS).reduce((sum,weight)=>sum+weight,0);
  assert.equal(Number(total.toFixed(2)),1,"weights must be a whole, not a rounding story");
  for(const [key,weight] of Object.entries(RECREATE_APPEARANCE_WEIGHTS)){
    assert.ok(methodology.includes(`${key} ${Math.round(weight*100)}%`),`the methodology must state ${key}`);
  }
});
