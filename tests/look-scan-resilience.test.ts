import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { WHOLE_FRAME } from "../lib/detection-bounds.ts";
import { detectLookOrManualReview, prepareResilientLookDisplay } from "../lib/look-scan-resilience.ts";

async function ordinaryPhonePhoto() {
  return sharp({create:{width:900,height:1200,channels:3,background:{r:176,g:168,b:158}}})
    .composite([{input:await sharp({create:{width:420,height:760,channels:3,background:{r:25,g:28,b:31}}}).png().toBuffer(),left:240,top:190}])
    .jpeg()
    .toBuffer();
}

test("optional crop failures retain a simple usable photo instead of rejecting intake",async()=>{
  const input=await ordinaryPhonePhoto();
  const fail=async()=>{throw new Error("optional method unavailable");};
  const result=await prepareResilientLookDisplay(input,{removeBackground:fail,isolate:fail,edgeFallback:fail});
  assert.equal(result.method,"none");
  assert.equal(result.backgroundRemoved,false);
  assert.ok(result.width<=700&&result.height<=900);
  const metadata=await sharp(result.buffer).metadata();
  assert.equal(metadata.format,"png");
  assert.equal(metadata.hasAlpha,true);
});

test("synchronous look intake never multiplies recognition into per-piece provider calls",async()=>{
  const input=await ordinaryPhonePhoto();
  let aiCalls=0;
  const result=await prepareResilientLookDisplay(input,{
    skipAi:true,
    removeBackground:async()=>{aiCalls++;throw new Error("must not run");},
    isolate:async()=>null,
  });
  assert.equal(aiCalls,0);
  assert.ok(["edge-fallback","none"].includes(result.method));
  // The live route now goes further and calls no removal pass at all; see bounded-crop-intake.test.ts.
  const route=readFileSync(new URL("../app/api/garments/detect/route.ts",import.meta.url),"utf8");
  assert.match(route,/prepareSimpleLookDisplay\(cropBytes\)/);
  assert.doesNotMatch(route,/removeGarmentBackground|skipAi:recognition\.providerFailed/);
});

test("an almost transparent garment is rejected in favor of a clearly visible fallback",async()=>{
  const input=await ordinaryPhonePhoto();
  const erased=await sharp({create:{width:500,height:500,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await sharp({create:{width:300,height:100,channels:4,background:{r:245,g:245,b:245,alpha:0.1}}}).png().toBuffer(),left:100,top:200}])
    .png().toBuffer();
  let saferMethodCalled=false;
  const result=await prepareResilientLookDisplay(input,{
    skipAi:true,
    isolate:async()=>({buffer:erased,width:500,height:500,backgroundRemoved:true,removedPixelRatio:0.88,method:"silhouette",bounds:{left:0,top:0,width:500,height:500},subjectPixelRatio:0.12,retainedComponentPixelRatio:0.12,hasSimilarNeighbour:false,discardedNeighbours:false}),
    edgeFallback:async()=>{saferMethodCalled=true;return {buffer:input,width:900,height:1200,backgroundRemoved:false,removedPixelRatio:0,method:"none"};},
  });
  assert.equal(saferMethodCalled,true,"the over-erased result must not end the fallback chain");
  assert.equal(result.backgroundRemoved,false);
  assert.equal(result.method,"none");
});

test("a healthy solid garment cutout remains eligible for transparent display",async()=>{
  const input=await ordinaryPhonePhoto();
  const healthy=await sharp({create:{width:500,height:500,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await sharp({create:{width:260,height:330,channels:4,background:{r:40,g:45,b:50,alpha:1}}}).png().toBuffer(),left:120,top:85}])
    .png().toBuffer();
  let fallbackCalled=false;
  const result=await prepareResilientLookDisplay(input,{
    skipAi:true,
    isolate:async()=>({buffer:healthy,width:500,height:500,backgroundRemoved:true,removedPixelRatio:0.65,method:"silhouette",bounds:{left:0,top:0,width:500,height:500},subjectPixelRatio:0.35,retainedComponentPixelRatio:0.35,hasSimilarNeighbour:false,discardedNeighbours:false}),
    edgeFallback:async()=>{fallbackCalled=true;return {buffer:input,width:900,height:1200,backgroundRemoved:false,removedPixelRatio:0,method:"none"};},
  });
  assert.equal(fallbackCalled,false);
  assert.equal(result.backgroundRemoved,true);
  assert.equal(result.method,"silhouette");
});

test("a recognition-provider exception becomes an honest editable wardrobe candidate",async()=>{
  const result=await detectLookOrManualReview({base64:"ignored",contentType:"image/jpeg"},{detect:async()=>{throw new Error("malformed provider response");}});
  assert.equal(result.providerFailed,true);
  assert.equal(result.detections.length,1);
  const candidate=result.detections[0];
  assert.equal(candidate.analysis.provider,"manual-review");
  assert.equal(candidate.analysis.confidence,0);
  assert.equal(candidate.analysis.garment.category,"unknown");
  assert.equal(candidate.analysis.label.matched,false);
  assert.deepEqual(candidate.bounds,WHOLE_FRAME);
  assert.match(candidate.analysis.warnings[0],/photo is still usable/i);
});

test("an empty recognition result also stays editable without inventing attributes",async()=>{
  const result=await detectLookOrManualReview({base64:"ignored",contentType:"image/jpeg"},{detect:async()=>[]});
  assert.equal(result.providerFailed,false);
  assert.equal(result.detections[0].analysis.fallback,true);
  assert.equal(result.detections[0].analysis.garment.name,"Unrecognized piece");
  assert.equal(result.detections[0].analysis.garment.color,"unknown");
});

test("the upload route no longer blames every provider or storage failure on the photo",()=>{
  const route=readFileSync(new URL("../app/api/garments/detect/route.ts",import.meta.url),"utf8");
  assert.match(route,/detectLookOrManualReview/);
  assert.match(route,/prepareSimpleLookDisplay/);
  assert.doesNotMatch(route,/Try a clearer image with less overlap/);
  assert.match(route,/could not store the private wardrobe image/);
  assert.match(route,/Your photo was not rejected/);
});
