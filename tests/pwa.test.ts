import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import manifest from "../app/manifest.ts";
import { detectPwaInstallPlatform, pwaInstallGuidance } from "../lib/pwa-install.ts";

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

test("Home Screen guidance recognizes iPhone and modern iPad user agents",()=>{
  assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"),"ios");
  assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",5),"ios");
  assert.equal(detectPwaInstallPlatform("Mozilla/5.0 (Linux; Android 16)"),"android");
});

test("every non-native install path gives complete browser-specific steps",()=>{
  const ios=pwaInstallGuidance("ios");
  const android=pwaInstallGuidance("android");
  const component=readFileSync(new URL("../components/pwa-install.tsx",import.meta.url),"utf8");
  assert.match(ios.steps.join(" "),/Safari.*Share.*Add to Home Screen/);
  assert.match(android.steps.join(" "),/browser menu.*Install app.*Confirm Install/);
  assert.match(component,/if\(!prompt\)\{setHelpOpen\(true\);return;\}/,"the Add Racked button must open guidance when a native prompt is unavailable");
  assert.doesNotMatch(component,/\{prompt&&<button/,"the actionable Add Racked button must not disappear on iPhone");
});
