import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import manifest from "../app/manifest.ts";
import { INSTALL_PROMPT_CAPTURE, detectInAppBrowser, detectIosBrowser, detectPwaInstallPlatform, externalBrowserUrl, pwaInstallGuidance } from "../lib/pwa-install.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1";
const TIKTOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_40.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US BytedanceWebview/d8a21c6";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 380.0.0.30.73 (iPhone16,2; iOS 18_5; en_US; en; scale=3.00; 1290x2796; 740230394)";
const FACEBOOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.40.100;FBBV/712345678;FBDV/iPhone16,2]";

test("consumer app manifest supports standalone home-screen installation",()=>{
  const value=manifest();
  assert.equal(value.start_url,"/consumer");
  assert.equal(value.display,"standalone");
  assert.ok(value.icons?.some((icon)=>icon.sizes==="192x192"));
  assert.ok(value.icons?.some((icon)=>icon.sizes==="512x512"&&icon.purpose==="maskable"));
});

test("service worker never caches API or authenticated page responses",()=>{
  const worker=read("public/sw.js");
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
  const component=read("components/pwa-install.tsx");
  assert.match(ios.steps.join(" "),/Safari.*Share.*Add to Home Screen/);
  assert.match(android.steps.join(" "),/browser menu.*Install app.*Confirm Install/);
  assert.match(component,/if\(!prompt\)\{setHelpOpen\(true\);return;\}/,"the Add Racked button must open guidance when a native prompt is unavailable");
  assert.doesNotMatch(component,/\{prompt&&<button/,"the actionable Add Racked button must not disappear on iPhone");
});

// REGRESSION: Chrome can fire beforeinstallprompt before React hydrates. The listener lived only
// inside the component, so an installable browser could be shown written steps instead of the
// real one-tap install dialog.
test("REGRESSION: an install prompt fired before hydration is kept, not lost",()=>{
  const layout=read("app/layout.tsx");
  const component=read("components/pwa-install.tsx");
  assert.match(layout,/<Script id="capture-install-prompt" strategy="beforeInteractive">\{INSTALL_PROMPT_CAPTURE\}<\/Script>/);
  assert.match(INSTALL_PROMPT_CAPTURE,/beforeinstallprompt.*event\.preventDefault\(\);window\.__rackedInstallPrompt=event/);
  assert.match(component,/const early=installWindow\.__rackedInstallPrompt;if\(early\)\{setPrompt\(early\)/);
  assert.match(component,/window\.addEventListener\("racked:installable",adopt\)/);
  assert.match(component,/\?"Install":"Show me"/,"an available prompt is offered as a real install");
});

test("a declined install dialog is respected rather than answered with instructions",()=>{
  assert.doesNotMatch(read("components/pwa-install.tsx"),/else setHelpOpen\(true\)/);
});

test("iPhone steps match iOS 26 Safari, and other iPhone browsers get their own path",()=>{
  assert.equal(detectIosBrowser(SAFARI),"safari");
  assert.equal(detectIosBrowser(CHROME_IOS),"chrome");
  assert.match(pwaInstallGuidance("ios","safari").steps.join(" "),/⋯.*Share.*Add to Home Screen.*Open as Web App/);
  assert.match(pwaInstallGuidance("ios","chrome").steps.join(" "),/Share button in Chrome.*Add to Home Screen/);
});

test("apps' built-in browsers are recognised, because none of them can add to a Home Screen",()=>{
  assert.equal(detectInAppBrowser(TIKTOK),"TikTok");
  assert.equal(detectInAppBrowser(INSTAGRAM),"Instagram");
  assert.equal(detectInAppBrowser(FACEBOOK),"Facebook");
  assert.equal(detectInAppBrowser(SAFARI),null);
  assert.equal(detectInAppBrowser(CHROME_IOS),null);
});

test("the open-in-browser link reopens the same page in the phone's real browser, and only from https",()=>{
  assert.equal(externalBrowserUrl("https://main.example.app/login?next=1","ios"),"x-safari-https://main.example.app/login?next=1");
  assert.equal(externalBrowserUrl("https://main.example.app/login","android"),"intent://main.example.app/login#Intent;scheme=https;package=com.android.chrome;end");
  assert.equal(externalBrowserUrl("https://main.example.app/","desktop"),null);
  assert.equal(externalBrowserUrl("http://main.example.app/","ios"),null);
  assert.equal(externalBrowserUrl("javascript:alert(1)","ios"),null);
});

// REGRESSION: in development the cache-first worker served stale, unhashed chunks after an edit,
// crashing hydration in a reload loop. Only production builds, whose files are hashed, register it.
test("the service worker is registered only in production builds",()=>{
  const component=read("components/pwa-install.tsx");
  assert.match(component,/if \(process\.env\.NODE_ENV==="production"\)\{\s*navigator\.serviceWorker\.addEventListener\("controllerchange",refreshForUpdate\);\s*navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(component,/registration\.unregister\(\)/);
});
