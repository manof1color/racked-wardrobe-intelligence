export type PwaInstallPlatform="ios"|"android"|"desktop";

export interface PwaInstallGuidance {
  title:string;
  steps:string[];
}

export function detectPwaInstallPlatform(userAgent:string,maxTouchPoints=0):PwaInstallPlatform {
  const value=userAgent.toLowerCase();
  // Modern iPadOS can identify itself as macOS, so touch capability is needed
  // to keep the Home Screen directions accurate on those devices.
  if(/iphone|ipad|ipod/.test(value)||(value.includes("macintosh")&&maxTouchPoints>1))return "ios";
  if(value.includes("android"))return "android";
  return "desktop";
}

export function pwaInstallGuidance(platform:PwaInstallPlatform):PwaInstallGuidance {
  if(platform==="ios")return {
    title:"Add Racked on iPhone or iPad",
    steps:["Open Racked in Safari.","Tap the Share button (the square with an upward arrow).","Scroll to Add to Home Screen, then tap Add."],
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
