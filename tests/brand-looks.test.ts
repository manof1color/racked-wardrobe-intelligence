import test from "node:test";
import assert from "node:assert/strict";
import { createBrandLook } from "../lib/brand-looks.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const owned=(id:string,ownerSubject="brand-1"):BrandProductRegistration=>({id,ownerSubject,name:`Product ${id}`,brand:"Test Brand",brandSlug:"test-brand",aliases:[],sku:`SKU-${id}`,gtin:null,category:"top",labelText:`TEST ${id}`,views:{} as BrandProductRegistration["views"],enrolledAt:"2026-08-13T00:00:00Z",source:"brand-enrolled"});

test("a Brand Look is explicitly brand-created and contains only unique owned products",()=>{
  const look=createBrandLook({ownerSubject:"brand-1",brand:"Test Brand",brandSlug:"test-brand",title:"Weekend edit",caption:"A complete test look.",productIds:["p1","p2","p1"],published:true},[owned("p1"),owned("p2")]);
  assert.equal(look.sourceType,"brand");
  assert.deepEqual(look.productIds,["p1","p2"]);
  assert.equal(look.published,true);
});

test("a Brand account cannot claim another brand account's product",()=>{
  assert.throws(()=>createBrandLook({ownerSubject:"brand-1",brand:"Test Brand",brandSlug:"test-brand",title:"Invalid look",caption:"Must not save.",productIds:["foreign"],published:true},[owned("foreign","brand-2")]),/belong to this brand account/i);
});
