import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGarmentImages, analyzeThreeViewSet, MAX_UPLOAD_BYTES, UploadValidationError, validateThreeViewUpload } from "../lib/garment-analysis.ts";
import type { UploadDescriptor } from "../lib/platform-types.ts";

const parts:UploadDescriptor[]=[
  {view:"front",fileName:"northstar-overshirt-front.png",contentType:"image/png",size:1024},
  {view:"back",fileName:"northstar-overshirt-back.png",contentType:"image/png",size:1024},
  {view:"label",fileName:"northstar-overshirt-label.png",contentType:"image/png",size:1024},
];

test("front, back, and label descriptors satisfy upload policy",()=>{assert.equal(validateThreeViewUpload(parts),true);assert.ok(parts.every((part)=>part.size<MAX_UPLOAD_BYTES));});
test("three-view analysis links the label SKU to its brand page",()=>{const result=analyzeThreeViewSet(parts);assert.equal(result.evidence.length,3);assert.equal(result.label.sku,"NA-OW-1042");assert.equal(result.label.brandSlug,"northstar-atelier");assert.equal(result.label.matched,true);assert.equal(result.label.matchMethod,"catalog-image-set");assert.equal(result.confidence,98);});
test("missing, duplicate, invalid-type, and oversized views fail closed",()=>{assert.throws(()=>validateThreeViewUpload(parts.slice(0,2)),UploadValidationError);assert.throws(()=>validateThreeViewUpload([...parts,parts[0]]),UploadValidationError);assert.throws(()=>validateThreeViewUpload(parts.map((part,index)=>index===0?{...part,contentType:"text/plain"}:part)),UploadValidationError);assert.throws(()=>validateThreeViewUpload(parts.map((part,index)=>index===1?{...part,size:MAX_UPLOAD_BYTES+1}:part)),UploadValidationError);});
test("consumer enrollment requires front, back, and label evidence",()=>{assert.throws(()=>validateThreeViewUpload([parts[0]]),/back image is required/i);});

test("multimodal analysis uses visible attributes but requires the registry to verify identity",async()=>{
  const ocrParts=parts.map((part)=>({...part,fileName:`phone-capture-${part.view}.png`}));
  const providerPayload={
    confidence:91,visibleLabelText:"NORTHSTAR ATELIER NA-OW-1042 100% COTTON",
    garment:{name:"Brown overshirt",category:"outerwear",color:"sienna",style:["casual","utility"],construction:["point collar","patch pockets"],material:"cotton"},
    evidence:[{view:"front",findings:["sienna woven overshirt"]},{view:"back",findings:["back yoke"]},{view:"label",findings:["Northstar Atelier","NA-OW-1042"]}],
  };
  const result=await analyzeGarmentImages(ocrParts,ocrParts.map((part)=>({view:part.view,contentType:"image/png" as const,base64:"aW4tbWVtb3J5"})),{
    provider:"anthropic",apiKey:"test-key",
    fetchImpl:async()=>new Response(JSON.stringify({stop_reason:"end_turn",content:[{type:"text",text:JSON.stringify(providerPayload)}]}),{status:200}),
  });
  assert.equal(result.provider,"multimodal");
  assert.equal(result.fallback,false);
  assert.equal(result.label.matched,true);
  assert.equal(result.label.matchMethod,"brand-sku");
  assert.equal(result.garment.name,"Sienna Soft Overshirt");
});

test("multimodal provider failures keep the three-view scan usable through manual review",async()=>{
  const consumerParts=parts.map(part=>({...part,fileName:`consumer-${part.view}.png`}));
  const result=await analyzeGarmentImages(consumerParts,consumerParts.map(part=>({view:part.view,contentType:"image/png" as const,base64:"aW4tbWVtb3J5"})),{
    provider:"anthropic",apiKey:"test-key",fetchImpl:async()=>new Response("unavailable",{status:503}),
  });
  assert.equal(result.provider,"manual-review");
  assert.equal(result.fallback,true);
  assert.match(result.warnings.at(-1)??"",/manual review/i);
});

test("major-brand label evidence becomes an editable suggestion, not a verified link",async()=>{
  const providerPayload={confidence:89,visibleLabelText:"FILA 100% COTTON",garment:{name:"Grey sweatshirt",category:"top",color:"grey",style:["casual"],construction:["crew neck"],material:"cotton"}};
  const result=await analyzeGarmentImages(parts,parts.map(part=>({view:part.view,contentType:"image/png" as const,base64:"aW4tbWVtb3J5"})),{registry:[],provider:"anthropic",apiKey:"test-key",fetchImpl:async()=>new Response(JSON.stringify({stop_reason:"end_turn",content:[{type:"text",text:JSON.stringify(providerPayload)}]}),{status:200})});
  assert.equal(result.label.brand,"Fila");
  assert.equal(result.label.suggested,true);
  assert.equal(result.label.matched,false);
  assert.equal(result.label.matchMethod,"major-brand-suggestion");
  assert.equal(result.evidence.length,3);
});
