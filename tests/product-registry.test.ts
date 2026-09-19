import assert from "node:assert/strict";
import test from "node:test";
import { createBrandProductRegistration, matchBrandProduct, suggestMajorBrand } from "../lib/product-registry.ts";
import { listBrandProducts, registerBrandProduct, resetDemoStore } from "../lib/server/demo-store.ts";
import type { GarmentView, UploadDescriptor } from "../lib/platform-types.ts";

const parts:UploadDescriptor[]=( ["front","back","label"] as GarmentView[]).map((view)=>({view,fileName:`real-shirt-${view}.jpg`,contentType:"image/jpeg",size:1200,sha256:`hash-${view}`}));

// REGRESSION: an identical image file, or a matching file name, used to verify a product. Neither
// is evidence that a person owns a garment; only a GTIN or a brand with its style code is.
test("REGRESSION: an identical image file or file name never verifies a product",()=>{
  const product=createBrandProductRegistration({ownerSubject:"brand@example.test",name:"Archive Shirt",brand:"Example Brand",aliases:["Example"],sku:"EX-100",gtin:"00123456789012",category:"top",labelText:"EXAMPLE BRAND EX-100",parts});
  assert.equal(matchBrandProduct([{...parts[2],fileName:"phone-photo.jpg"}],"",[product]),null,"a byte-identical label photo is not ownership");
  assert.equal(matchBrandProduct(parts,"",[product]),null,"the brand's own file names are not ownership");
});

test("label identity requires a brand alias with the SKU",()=>{
  const product=createBrandProductRegistration({ownerSubject:"brand@example.test",name:"Archive Shirt",brand:"Example Brand",aliases:["Example"],sku:"EX-100",category:"top",labelText:"EXAMPLE BRAND EX-100",parts});
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
