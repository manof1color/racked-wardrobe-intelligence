import test from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { analyzeFrontFirstSet, analyzeThreeViewSet, MAX_UPLOAD_BYTES, UploadValidationError, validateFrontFirstUpload, validateThreeViewUpload } from "../lib/garment-analysis.ts";
import type { UploadDescriptor } from "../lib/platform-types.ts";

const parts:UploadDescriptor[]=[
  {view:"front",fileName:"northstar-overshirt-front.png",contentType:"image/png",size:statSync("public/test-uploads/northstar-overshirt-front.png").size},
  {view:"back",fileName:"northstar-overshirt-back.png",contentType:"image/png",size:statSync("public/test-uploads/northstar-overshirt-back.png").size},
  {view:"label",fileName:"northstar-overshirt-label.png",contentType:"image/png",size:statSync("public/test-uploads/northstar-overshirt-label.png").size},
];

test("checked-in front, back, and label fixtures satisfy upload policy",()=>{assert.equal(validateThreeViewUpload(parts),true);assert.ok(parts.every((part)=>part.size<MAX_UPLOAD_BYTES));});
test("three-view analysis links the label SKU to its brand page",()=>{const result=analyzeThreeViewSet(parts);assert.equal(result.evidence.length,3);assert.equal(result.label.sku,"NA-OW-1042");assert.equal(result.label.brandSlug,"northstar-atelier");assert.equal(result.label.matched,true);assert.equal(result.label.matchMethod,"catalog-image-set");assert.equal(result.confidence,98);});
test("missing, duplicate, invalid-type, and oversized views fail closed",()=>{assert.throws(()=>validateThreeViewUpload(parts.slice(0,2)),UploadValidationError);assert.throws(()=>validateThreeViewUpload([...parts,parts[0]]),UploadValidationError);assert.throws(()=>validateThreeViewUpload(parts.map((part,index)=>index===0?{...part,contentType:"text/plain"}:part)),UploadValidationError);assert.throws(()=>validateThreeViewUpload(parts.map((part,index)=>index===1?{...part,size:MAX_UPLOAD_BYTES+1}:part)),UploadValidationError);});
test("front-only quick scan classifies without claiming a brand identity",()=>{const front=[parts[0]];assert.equal(validateFrontFirstUpload(front),true);const result=analyzeFrontFirstSet(front);assert.equal(result.dataSufficiency,"partial");assert.equal(result.evidence.length,1);assert.equal(result.label.matched,false);assert.equal(result.label.sku,"UNVERIFIED");assert.ok(result.confidence<90);});
