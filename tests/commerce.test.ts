import test from "node:test";
import assert from "node:assert/strict";
import { commerceDestination, normalizeCommerceUrl } from "../lib/commerce.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const product=(overrides:Partial<BrandProductRegistration>={}):BrandProductRegistration=>({id:"p1",ownerSubject:"brand-1",name:"Test product",brand:"Test Brand",brandSlug:"test-brand",aliases:[],sku:"SKU-1",gtin:null,category:"top",labelText:"TEST BRAND SKU-1",views:{} as BrandProductRegistration["views"],enrolledAt:"2026-08-13T00:00:00Z",source:"brand-enrolled",...overrides});

test("commerce destinations accept only public HTTPS and strip fragments",()=>{
  assert.equal(normalizeCommerceUrl("https://shop.example/product?ref=racked#private"),"https://shop.example/product?ref=racked");
  for(const value of ["javascript:alert(1)","http://shop.example/product","https://localhost/product","https://127.0.0.1/product","https://10.0.0.4/product","https://user:pass@shop.example/product","https://shop.example:8443/product"]){assert.throws(()=>normalizeCommerceUrl(value),/public HTTPS|valid HTTPS|public website host/);}
});

test("affiliate destination takes precedence while unavailable products never redirect",()=>{
  assert.deepEqual(commerceDestination(product({productUrl:"https://brand.example/p",affiliateUrl:"https://retailer.example/p",availability:"available"})),{state:"EXACT_AVAILABLE",url:"https://retailer.example/p"});
  assert.deepEqual(commerceDestination(product({productUrl:"https://brand.example/p",availability:"discontinued"})),{state:"EXACT_UNAVAILABLE"});
  assert.deepEqual(commerceDestination(product()),{state:"NO_DESTINATION"});
});
