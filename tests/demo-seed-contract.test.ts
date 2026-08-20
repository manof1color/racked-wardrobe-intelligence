import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {createBrandProductRegistration,matchBrandProduct} from "../lib/product-registry.ts";
import type {GarmentView} from "../lib/platform-types.ts";

test("demo seed uses the canonical shoe category for the Recreate substitute",()=>{
  const seed=readFileSync(new URL("../scripts/seed-test-cohort.mjs",import.meta.url),"utf8");
  assert.match(seed,/categories:Array\(10\)\.fill\("shoe"\)/);
  assert.doesNotMatch(seed,/fill\("shoes"\)/);
  assert.match(seed,/product\.category==="shoe"\?"sneakers"/);
});

test("three fictional catalogs resolve brand plus SKU to the right brand, never a neighbor",()=>{
  const fixtures=[["Racked Test Atelier","RTA-001"],["Synthetic Stride Lab","SSL-001"],["Lumen Test Objects","LTO-001"]] as const;
  const registry=fixtures.map(([brand,sku])=>createBrandProductRegistration({ownerSubject:brand,name:`${brand} hero`,brand,aliases:[],sku,category:sku.startsWith("SSL")?"shoe":sku.startsWith("LTO")?"jewelry":"top",labelText:`${brand} ${sku}`,parts:(["front","back","label"] as GarmentView[]).map(view=>({view,fileName:`${sku}-${view}.png`,contentType:"image/png",size:100,sha256:`${sku}-${view}`}))}));
  for(const product of registry){const consumerParts=(["front","back","label"] as GarmentView[]).map(view=>({view,fileName:`consumer-${view}.jpg`,contentType:"image/jpeg",size:500}));const match=matchBrandProduct(consumerParts,`${product.brand} ${product.sku}`,registry);assert.equal(match?.product.id,product.id);assert.equal(match?.product.brand,product.brand);assert.equal(match?.method,"brand-sku");}
});
