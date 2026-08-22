import test from "node:test";
import assert from "node:assert/strict";
import { buildLookDetectionPrompt, MAX_LOOK_GARMENTS, parseLookGarmentDetections } from "../lib/look-garment-detection.ts";

test("look detection creates separate controlled garment candidates",()=>{
  const results=parseLookGarmentDetections({garments:[
    {name:"Navy bomber",category:"outerwear",subtype:"bomber jacket",color:"navy",pattern:"solid",material:"nylon",style:["casual"],confidence:91,visibleBrandText:"",visibleEvidence:["ribbed collar","zip front"],bounds:{x:.08,y:.05,width:.4,height:.52}},
    {name:"White sneakers",category:"shoe",subtype:"sneakers",color:"white",pattern:"solid",material:"leather",style:["casual"],confidence:87,visibleBrandText:"",visibleEvidence:["low top","rubber sole"],bounds:{x:.18,y:.72,width:.55,height:.2}},
  ]});
  assert.equal(results.length,2);
  assert.deepEqual(results.map(result=>[result.analysis.garment.category,result.analysis.garment.subtype]),[["outerwear","bomber-jacket"],["shoe","sneakers"]]);
  assert.equal(results[0].analysis.processedImage,undefined);
});

test("a photographed left/right shoe set is one wardrobe pair",()=>{
  const results=parseLookGarmentDetections({garments:[{
    name:"Tan work boots",category:"shoe",subtype:"boots",wearableUnit:"pair",pairId:"tan-boots-1",color:"tan",pattern:"solid",material:"leather",style:["workwear"],confidence:92,visibleBrandText:"",visibleEvidence:["matching construction"],bounds:{x:.48,y:.02,width:.4,height:.32},
  }]});
  assert.equal(results.length,1);
  assert.equal(results[0].analysis.garment.wearableUnit,"pair");
  assert.equal(results[0].analysis.garment.category,"shoe");
});

test("separate model boxes sharing a footwear pair id are merged without making doubles",()=>{
  const results=parseLookGarmentDetections({garments:[
    {name:"Black hiking boots",category:"shoe",subtype:"boots",wearableUnit:"single",pairId:"keen-pair",color:"black",pattern:"solid",material:"leather",style:["outdoor"],confidence:88,visibleBrandText:"",visibleEvidence:["left boot"],bounds:{x:.05,y:.05,width:.18,height:.3}},
    {name:"Black hiking boots",category:"shoe",subtype:"boots",wearableUnit:"single",pairId:"keen-pair",color:"black",pattern:"solid",material:"leather",style:["outdoor"],confidence:90,visibleBrandText:"",visibleEvidence:["right boot"],bounds:{x:.22,y:.05,width:.18,height:.3}},
    {name:"Other black boots",category:"shoe",subtype:"boots",wearableUnit:"pair",pairId:"other-pair",color:"black",pattern:"solid",material:"leather",style:["outdoor"],confidence:84,visibleBrandText:"",visibleEvidence:["different sole"],bounds:{x:.55,y:.05,width:.35,height:.3}},
  ]});
  assert.equal(results.length,2,"two physical pairs must remain two wardrobe units");
  assert.equal(results[0].analysis.garment.wearableUnit,"pair");
  assert.ok(results[0].bounds.width>.34,"the merged crop must contain both shoes");
  assert.match(results[0].analysis.garment.construction.join(" "),/grouped as one wearable pair/i);
});

test("the provider prompt requires full-image coverage and pair-aware footwear counting",()=>{
  const prompt=buildLookDetectionPrompt();
  assert.match(prompt,/ENTIRE image/);
  assert.match(prompt,/matching left and right shoe together are ONE wardrobe unit/i);
  assert.match(prompt,/coverage check of every row, shelf, image edge/i);
  assert.match(prompt,new RegExp(`at most ${MAX_LOOK_GARMENTS} wardrobe units`));
});

test("AI brand text remains suggestion-only and can never verify a product",()=>{
  const [result]=parseLookGarmentDetections({garments:[{
    name:"Logo tee",category:"top",subtype:"t-shirt",color:"black",pattern:"graphic",material:"cotton",style:["casual"],confidence:94,visibleBrandText:"Example Brand",visibleEvidence:["visible chest logo"],bounds:{x:.1,y:.1,width:.7,height:.7},
  }]});
  assert.equal(result.analysis.label.brand,"Example Brand");
  assert.equal(result.analysis.label.suggested,true);
  assert.equal(result.analysis.label.matched,false);
  assert.equal(result.analysis.label.registryProductId,null);
  assert.equal(result.analysis.label.matchMethod,"ai-label-text");
});

test("invalid, unknown, duplicate, and excessive detections are bounded",()=>{
  const valid=Array.from({length:MAX_LOOK_GARMENTS+4},(_,index)=>({
    name:`Piece ${index}`,category:"accessory",subtype:"belt",color:"black",pattern:"solid",material:"leather",style:[],confidence:70,visibleBrandText:"",visibleEvidence:[],bounds:{x:(index%4)*.24,y:Math.floor(index/4)*.24,width:.18,height:.18},
  }));
  const results=parseLookGarmentDetections({garments:[
    {name:"Person",category:"unknown",subtype:"other-garment",bounds:{x:0,y:0,width:1,height:1}},
    {name:"Tiny noise",category:"top",subtype:"t-shirt",bounds:{x:.1,y:.1,width:.01,height:.01}},
    valid[0],
    {...valid[0],name:"Duplicate box"},
    ...valid.slice(1),
  ]});
  assert.equal(results.length,MAX_LOOK_GARMENTS);
  assert.equal(results.some(result=>result.analysis.garment.name==="Duplicate box"),false);
  assert.equal(results.every(result=>result.analysis.label.matched===false),true);
});
