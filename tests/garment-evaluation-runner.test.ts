import test from "node:test";
import assert from "node:assert/strict";
import { evaluationPredictionFromAnalysis } from "../lib/garment-evaluation-runner.ts";
import type { GarmentAnalysis } from "../lib/platform-types.ts";

function analysis(overrides:Partial<GarmentAnalysis>={}):GarmentAnalysis {
  return {
    provider:"multimodal",fallback:false,confidence:88,dataSufficiency:"complete",
    garment:{name:"Tan boots",category:"shoe",subtype:"boots",color:"tan",pattern:"solid",style:["workwear"],construction:["lug sole"],material:"leather",alternatives:[]},
    label:{brand:"Example",sku:"UNVERIFIED",brandSlug:null,matched:false,suggested:true,registryProductId:null,matchMethod:"ai-label-text"},
    evidence:[{view:"front",findings:["boot silhouette"]}],warnings:[],...overrides,
  };
}

test("production analysis maps to an unverified benchmark prediction",()=>{
  assert.deepEqual(evaluationPredictionFromAnalysis("case-1",analysis()),{
    externalId:"case-1",providerStatus:"ok",category:"shoe",subtype:"boots",brandLabel:"Example",confidence:88,verified:false,
  });
});

test("manual fallback is counted as provider failure instead of invented accuracy",()=>{
  const prediction=evaluationPredictionFromAnalysis("case-2",analysis({provider:"manual-review",fallback:true}));
  assert.deepEqual(prediction,{externalId:"case-2",providerStatus:"failed",verified:false});
});

test("generic unverified placeholders are not scored as OCR output",()=>{
  const value=analysis({label:{brand:"Brand not verified",sku:"UNVERIFIED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"}});
  assert.equal(evaluationPredictionFromAnalysis("case-3",value).brandLabel,undefined);
});
