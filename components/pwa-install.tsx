"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { detectPwaInstallPlatform, pwaInstallGuidance, type PwaInstallPlatform } from "@/lib/pwa-install";

interface InstallPromptEvent extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:"accepted"|"dismissed"}>;
}

export function PwaInstall() {
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [platform,setPlatform]=useState<PwaInstallPlatform>("desktop");
  const [hidden,setHidden]=useState(true);
  const [helpOpen,setHelpOpen]=useState(false);
  const [installing,setInstalling]=useState(false);

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
    // Some browsers never emit beforeinstallprompt (notably every iPhone
    // browser). Keep Add Racked actionable by revealing a platform-specific
    // guided path instead of silently omitting the button.
    const revealTimer=window.setTimeout(()=>{
      setPlatform(detectPwaInstallPlatform(navigator.userAgent,navigator.maxTouchPoints));
      setHidden(false);
    },500);
    const capture=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPromptEvent);setHidden(false);};
    const installed=()=>{setHidden(true);setHelpOpen(false);setPrompt(null);};
    window.addEventListener("beforeinstallprompt",capture);
    window.addEventListener("appinstalled",installed);
    return ()=>{window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",installed);navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);window.clearTimeout(revealTimer);};
  },[]);

  useEffect(()=>{
    if(!helpOpen)return;
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setHelpOpen(false);};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[helpOpen]);

  async function install(){
    if(!prompt){setHelpOpen(true);return;}
    setInstalling(true);
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==="accepted")setHidden(true);
      else setHelpOpen(true);
      setPrompt(null);
    }finally{setInstalling(false);}
  }

  if (hidden) return null;
  const guidance=pwaInstallGuidance(platform);
  return <>
    <aside className="pwa-install" aria-label="Install Racked on this device">
      <Image src="/icon-192.png" alt="" width={44} height={44}/>
      <div><strong>Add Racked to your Home Screen</strong><span>{prompt?"Tap Add Racked to open the install prompt.":"Tap Add Racked for the steps on this device."}</span></div>
      <button type="button" onClick={install} disabled={installing}>{installing?"Opening…":"Add Racked"}</button>
      <button type="button" className="pwa-dismiss" aria-label="Dismiss installation tip" onClick={()=>setHidden(true)}>×</button>
    </aside>
    {helpOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setHelpOpen(false);}}>
      <section className="modal pwa-install-help" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button type="button" className="modal-close" aria-label="Close installation steps" onClick={()=>setHelpOpen(false)}>×</button>
        <div className="eyebrow">HOME SCREEN APP</div>
        <h2 id="pwa-install-title">{guidance.title}</h2>
        <p>Your browser controls the final Home Screen confirmation, so Racked cannot press it for you.</p>
        <ol>{guidance.steps.map((step,index)=><li key={step}><span>{index+1}</span><strong>{step}</strong></li>)}</ol>
        <button type="button" className="button button-accent" onClick={()=>setHelpOpen(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
