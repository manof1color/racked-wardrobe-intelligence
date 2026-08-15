import test from "node:test";
import assert from "node:assert/strict";
import { MAX_LOOK_GARMENTS, parseLookGarmentDetections } from "../lib/look-garment-detection.ts";

test("look detection creates separate controlled garment candidates",()=>{
  const results=parseLookGarmentDetections({garments:[
    {name:"Navy bomber",category:"outerwear",subtype:"bomber jacket",color:"navy",pattern:"solid",material:"nylon",style:["casual"],confidence:91,visibleBrandText:"",visibleEvidence:["ribbed collar","zip front"],bounds:{x:.08,y:.05,width:.4,height:.52}},
    {name:"White sneakers",category:"shoe",subtype:"sneakers",color:"white",pattern:"solid",material:"leather",style:["casual"],confidence:87,visibleBrandText:"",visibleEvidence:["low top","rubber sole"],bounds:{x:.18,y:.72,width:.55,height:.2}},
  ]});
  assert.equal(results.length,2);
  assert.deepEqual(results.map(result=>[result.analysis.garment.category,result.analysis.garment.subtype]),[["outerwear","bomber-jacket"],["shoe","sneakers"]]);
  assert.equal(results[0].analysis.processedImage,undefined);
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
