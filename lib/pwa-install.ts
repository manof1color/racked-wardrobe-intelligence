export type PwaInstallPlatform="ios"|"android"|"desktop";
export type IosBrowser="safari"|"chrome"|"firefox"|"edge"|"other";
export type InAppBrowser="TikTok"|"Instagram"|"Facebook"|"Snapchat"|"LinkedIn"|null;

export interface PwaInstallGuidance {
  title:string;
  steps:string[];
}

/**
 * Runs in the document head, before React hydrates. Chrome can announce that the app is
 * installable before the install control mounts; keeping the event here means that control
 * can still open the real install dialog instead of falling back to written steps.
 */
export const INSTALL_PROMPT_CAPTURE="window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();window.__rackedInstallPrompt=event;window.dispatchEvent(new Event('racked:installable'));});window.addEventListener('appinstalled',function(){window.__rackedInstallPrompt=null;});";

export function detectPwaInstallPlatform(userAgent:string,maxTouchPoints=0):PwaInstallPlatform {
  const value=userAgent.toLowerCase();
  // Modern iPadOS can identify itself as macOS, so touch capability is needed
  // to keep the Home Screen directions accurate on those devices.
  if(/iphone|ipad|ipod/.test(value)||(value.includes("macintosh")&&maxTouchPoints>1))return "ios";
  if(value.includes("android"))return "android";
  return "desktop";
}

/** Which iPhone browser is showing the page, because each puts Add to Home Screen somewhere else. */
export function detectIosBrowser(userAgent:string):IosBrowser {
  const value=userAgent.toLowerCase();
  if(value.includes("crios"))return "chrome";
  if(value.includes("fxios"))return "firefox";
  if(value.includes("edgios"))return "edge";
  if(value.includes("version/")&&value.includes("safari"))return "safari";
  return "other";
}

/**
 * Apps that open links in their own built-in browser. None of those browsers can add anything
 * to a Home Screen, so the only useful step is to reopen the page in the phone's real browser.
 */
export function detectInAppBrowser(userAgent:string):InAppBrowser {
  const value=userAgent.toLowerCase();
  if(/musical_ly|bytedancewebview|tiktok/.test(value))return "TikTok";
  if(value.includes("instagram"))return "Instagram";
  if(/fban|fbav|fb_iab/.test(value))return "Facebook";
  if(value.includes("snapchat"))return "Snapchat";
  if(value.includes("linkedinapp"))return "LinkedIn";
  return null;
}

/**
 * A link that asks the phone to reopen this exact page in its real browser. iOS understands
 * x-safari-https from most in-app browsers (Meta's apps block it, so the steps stay visible);
 * Android understands an intent addressed to Chrome. Only ever built from an https page.
 */
export function externalBrowserUrl(href:string,platform:PwaInstallPlatform):string|null {
  let url:URL;
  try{url=new URL(href);}catch{return null;}
  if(url.protocol!=="https:")return null;
  if(platform==="ios")return `x-safari-https://${url.host}${url.pathname}${url.search}`;
  if(platform==="android")return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`;
  return null;
}

export function pwaInstallGuidance(platform:PwaInstallPlatform,browser:IosBrowser="safari"):PwaInstallGuidance {
  if(platform==="ios"&&browser==="chrome")return {
    title:"Add Racked from Chrome on iPhone",
    steps:["Tap the Share button in Chrome's address bar.","Scroll down and tap Add to Home Screen.","Tap Add."],
  };
  if(platform==="ios"&&browser!=="safari")return {
    title:"Add Racked on iPhone or iPad",
    steps:["Open this page in Safari, where adding to the Home Screen is simplest.","Tap ⋯ beside the address bar, then Share.","Tap Add to Home Screen, keep Open as Web App on, then tap Add."],
  };
  if(platform==="ios")return {
    title:"Add Racked on iPhone or iPad",
    steps:["In Safari, tap ⋯ beside the address bar, then Share. On older iOS, tap the Share button (the square with an upward arrow).","Scroll down and tap Add to Home Screen.","Keep Open as Web App on, then tap Add."],
  };
  if(platform==="android")return {
    title:"Add Racked on Android",
    steps:["Open the browser menu (⋮).","Tap Install app or Add to Home screen.","Confirm Install."],
  };
  return {
    title:"Install Racked on this computer",
    steps:["Look for the install icon in the address bar.","Or open the browser menu and choose Install Racked.","Confirm Install."],
  };
}
