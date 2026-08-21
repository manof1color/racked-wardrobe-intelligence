"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface InstallPromptEvent extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:"accepted"|"dismissed"}>;
}

export function PwaInstall() {
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [iosHelp,setIosHelp]=useState(false);
  const [hidden,setHidden]=useState(true);

  useEffect(()=>{
    let refreshing=false;
    const hadController="serviceWorker" in navigator&&Boolean(navigator.serviceWorker.controller);
    const refreshForUpdate=()=>{if(hadController&&!refreshing){refreshing=true;window.location.reload();}};
    if ("serviceWorker" in navigator&&window.isSecureContext){
      navigator.serviceWorker.addEventListener("controllerchange",refreshForUpdate);
      navigator.serviceWorker.register("/sw.js").then(registration=>registration.update()).catch(()=>undefined);
    }
    if (window.matchMedia("(display-mode: standalone)").matches) return ()=>navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);
    const navigatorWithStandalone=navigator as Navigator&{standalone?:boolean};
    if (navigatorWithStandalone.standalone) return ()=>navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);
    const isIos=/iPad|iPhone|iPod/.test(navigator.userAgent);
    const iosTimer=isIos?window.setTimeout(()=>{setIosHelp(true);setHidden(false);},0):null;
    const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent);setHidden(false);};
    window.addEventListener("beforeinstallprompt",capture);
    return ()=>{window.removeEventListener("beforeinstallprompt",capture);navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);if(iosTimer!==null)window.clearTimeout(iosTimer);};
  },[]);

  async function install(){
    if (!prompt) { setIosHelp(true); return; }
    await prompt.prompt();
    const choice=await prompt.userChoice;
    if (choice.outcome==="accepted") setHidden(true);
    setPrompt(null);
  }

  if (hidden) return null;
  return <aside className="pwa-install" aria-label="Install Racked on this device">
    <Image src="/icon-192.png" alt="" width={44} height={44}/>
    <div><strong>Add Racked to your Home Screen</strong><span>{iosHelp&&!prompt?"Tap Share, then Add to Home Screen.":"Open your wardrobe like a standalone mobile app."}</span></div>
    {prompt&&<button type="button" onClick={install}>Install</button>}
    <button type="button" className="pwa-dismiss" aria-label="Dismiss installation tip" onClick={()=>setHidden(true)}>×</button>
  </aside>;
}
