import assert from "node:assert/strict";
import test from "node:test";
import { createBrandProductRegistration, matchBrandProduct, suggestMajorBrand } from "../lib/product-registry.ts";
import { listBrandProducts, registerBrandProduct, resetDemoStore } from "../lib/server/demo-store.ts";
import type { GarmentView, UploadDescriptor } from "../lib/platform-types.ts";

const parts:UploadDescriptor[]=( ["front","back","label"] as GarmentView[]).map((view)=>({view,fileName:`real-shirt-${view}.jpg`,contentType:"image/jpeg",size:1200,sha256:`hash-${view}`}));

test("brand registration matches an exact enrolled label hash",()=>{
  const product=createBrandProductRegistration({ownerSubject:"brand@example.test",name:"Archive Shirt",brand:"Example Brand",aliases:["Example"],sku:"EX-100",gtin:"00123456789012",category:"top",labelText:"EXAMPLE BRAND EX-100",parts});
  const match=matchBrandProduct([{...parts[2],fileName:"phone-photo.jpg"}],"",[product]);
  assert.equal(match?.product.sku,"EX-100");
  assert.equal(match?.method,"label-image-hash");
});

test("label identity requires a brand alias with the SKU",()=>{
  const product=createBrandProductRegistration({ownerSubject:"brand@example.test",name:"Archive Shirt",brand:"Example Brand",aliases:["Example"],sku:"EX-100",category:"top",labelText:"EXAMPLE BRAND EX-100",parts});
  assert.equal(matchBrandProduct(parts,"EXAMPLE BRAND EX-100 100% COTTON",[product])?.method,"label-image-hash");
  const renamed=parts.map((part)=>({...part,fileName:`consumer-${part.view}.jpg`,sha256:undefined}));
  assert.equal(matchBrandProduct(renamed,"EXAMPLE BRAND EX-100 100% COTTON",[product])?.method,"brand-sku");
  assert.equal(matchBrandProduct(renamed,"UNRELATED BRAND EX-100",[product]),null);
});

test("brand registry listings are scoped to the authenticated owner subject",()=>{
  resetDemoStore();
  const product=createBrandProductRegistration({ownerSubject:"brand-b@example.test",name:"Second Shirt",brand:"Second Brand",aliases:[],sku:"SB-200",category:"top",labelText:"SECOND BRAND SB-200",parts});
  registerBrandProduct(product);
  assert.equal(listBrandProducts("brand-b@example.test").length,1);
  assert.equal(listBrandProducts("different-brand@example.test").length,0);
  assert.ok(listBrandProducts().length>=2);
});

test("major-brand recognition creates only an editable suggestion",()=>{
  assert.deepEqual(suggestMajorBrand("FILA SPORTSWEAR 100% COTTON"),{brand:"Fila",brandSlug:"fila"});
  assert.equal(suggestMajorBrand("UNLISTED SMALL LABEL"),null);
});
