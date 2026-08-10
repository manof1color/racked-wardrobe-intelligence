import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import manifest from "../app/manifest.ts";

test("consumer app manifest supports standalone home-screen installation",()=>{
  const value=manifest();
  assert.equal(value.start_url,"/consumer");
  assert.equal(value.display,"standalone");
  assert.ok(value.icons?.some((icon)=>icon.sizes==="192x192"));
  assert.ok(value.icons?.some((icon)=>icon.sizes==="512x512"&&icon.purpose==="maskable"));
});

test("service worker never caches API or authenticated page responses",()=>{
  const worker=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.match(worker,/pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker,/request\.mode==="navigate"/);
  assert.doesNotMatch(worker,/cache\.put\(request,copy\)[\s\S]*navigate/);
});
