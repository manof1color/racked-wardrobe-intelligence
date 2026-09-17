"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { detectInAppBrowser, detectIosBrowser, detectPwaInstallPlatform, externalBrowserUrl, pwaInstallGuidance, type InAppBrowser, type IosBrowser, type PwaInstallPlatform } from "@/lib/pwa-install";

interface InstallPromptEvent extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:"accepted"|"dismissed"}>;
}

type InstallWindow=Window&{__rackedInstallPrompt?:InstallPromptEvent|null};

/** The iOS Share glyph, so the steps point at the icon people actually see. */
function ShareGlyph(){
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M7 11H5v10h14V11h-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function PwaInstall() {
  const [prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const [platform,setPlatform]=useState<PwaInstallPlatform>("desktop");
  const [browser,setBrowser]=useState<IosBrowser>("safari");
  const [inApp,setInApp]=useState<InAppBrowser>(null);
  const [openUrl,setOpenUrl]=useState<string|null>(null);
  const [hidden,setHidden]=useState(true);
  const [helpOpen,setHelpOpen]=useState(false);
  const [installing,setInstalling]=useState(false);

  useEffect(()=>{
    let refreshing=false;
    const hadController="serviceWorker" in navigator&&Boolean(navigator.serviceWorker.controller);
    const refreshForUpdate=()=>{if(hadController&&!refreshing){refreshing=true;window.location.reload();}};
    if ("serviceWorker" in navigator&&window.isSecureContext){
      if (process.env.NODE_ENV==="production"){
        navigator.serviceWorker.addEventListener("controllerchange",refreshForUpdate);
        navigator.serviceWorker.register("/sw.js").then(registration=>registration.update()).catch(()=>undefined);
      } else {
        // Development chunk names are not content-hashed, so a cache-first worker would keep
        // serving code from before the last edit. Only production builds get the worker.
        navigator.serviceWorker.getRegistrations().then(registrations=>registrations.forEach(registration=>void registration.unregister())).catch(()=>undefined);
      }
    }
    if (window.matchMedia("(display-mode: standalone)").matches) return ()=>navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);
    const navigatorWithStandalone=navigator as Navigator&{standalone?:boolean};
    if (navigatorWithStandalone.standalone) return ()=>navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);
    const installWindow=window as InstallWindow;
    // Chrome can announce installability before React hydrates. The root layout keeps that
    // event, so a real one-tap install is never downgraded to written steps.
    const adopt=()=>{const early=installWindow.__rackedInstallPrompt;if(early){setPrompt(early);setHidden(false);}};
    adopt();
    // Some browsers never emit beforeinstallprompt: every iPhone browser, and the built-in
    // browsers inside apps. Keep Add Racked actionable with the shortest honest path instead.
    const revealTimer=window.setTimeout(()=>{
      const detected=detectPwaInstallPlatform(navigator.userAgent,navigator.maxTouchPoints);
      const app=detectInAppBrowser(navigator.userAgent);
      setPlatform(detected);
      setBrowser(detectIosBrowser(navigator.userAgent));
      setInApp(app);
      setOpenUrl(app?externalBrowserUrl(window.location.href,detected):null);
      setHidden(false);
    },500);
    const capture=(event:Event)=>{event.preventDefault();installWindow.__rackedInstallPrompt=event as InstallPromptEvent;setPrompt(event as InstallPromptEvent);setHidden(false);};
    const installed=()=>{installWindow.__rackedInstallPrompt=null;setHidden(true);setHelpOpen(false);setPrompt(null);};
    window.addEventListener("racked:installable",adopt);
    window.addEventListener("beforeinstallprompt",capture);
    window.addEventListener("appinstalled",installed);
    return ()=>{window.removeEventListener("racked:installable",adopt);window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",installed);navigator.serviceWorker?.removeEventListener("controllerchange",refreshForUpdate);window.clearTimeout(revealTimer);};
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
      // Declining is an answer: it is not followed by instructions for what was just declined.
      if(choice.outcome==="accepted")setHidden(true);
      // A prompt can be shown once; the browser issues a fresh one if the page stays installable.
      (window as InstallWindow).__rackedInstallPrompt=null;
      setPrompt(null);
    }finally{setInstalling(false);}
  }

  if (hidden) return null;
  const guidance=pwaInstallGuidance(platform,browser);
  const inAppOnly=Boolean(inApp)&&!prompt;
  const realBrowser=platform==="ios"?"Safari":"Chrome";
  const title=prompt?"Install Racked":inAppOnly?`Open Racked in ${realBrowser}`:"Add Racked to your Home Screen";
  const detail=prompt
    ?"One tap adds it to this device like an app."
    :inAppOnly
      ?`${inApp}'s built-in browser can't add apps to your Home Screen.`
      :platform==="ios"
        ?"It takes two taps in Safari's Share menu. We'll show you where."
        :"Your browser menu can install it. We'll show you where.";
  const inAppSteps=[`Tap ⋯ in the corner of ${inApp??"this app"}.`,`Choose Open in browser${platform==="ios"?" or Open in Safari":""}.`,"Then tap Add Racked again."];
  return <>
    <aside className="pwa-install" aria-label="Install Racked on this device">
      <Image src="/icon-192.png" alt="" width={44} height={44}/>
      <div><strong>{title}</strong><span>{detail}</span></div>
      {inAppOnly&&openUrl
        ? <a className="pwa-install-action" href={openUrl}>{`Open in ${realBrowser}`}</a>
        : <button type="button" className="pwa-install-action" onClick={install} disabled={installing}>{installing?"Opening…":prompt?"Install":"Show me"}</button>}
      <button type="button" className="pwa-dismiss" aria-label="Dismiss installation tip" onClick={()=>setHidden(true)}>×</button>
    </aside>
    {helpOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setHelpOpen(false);}}>
      <section className="modal pwa-install-help" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
        <button type="button" className="modal-close" aria-label="Close installation steps" onClick={()=>setHelpOpen(false)}>×</button>
        <div className="eyebrow">HOME SCREEN APP</div>
        <h2 id="pwa-install-title">{inAppOnly?`Open Racked in ${realBrowser} first`:guidance.title}</h2>
        <p>{platform==="ios"?"Apple only lets Safari's own Share menu add apps to the Home Screen, so Racked can't do this last step for you.":"Your browser shows the final install confirmation, so Racked can't press it for you."}</p>
        {platform==="ios"&&browser==="safari"&&!inAppOnly&&<div className="pwa-glyphs" aria-hidden="true"><span>⋯</span><i>→</i><span><ShareGlyph/> Share</span><i>→</i><span>Add to Home Screen</span></div>}
        <ol>{(inAppOnly?inAppSteps:guidance.steps).map((step,index)=><li key={step}><span>{index+1}</span><strong>{step}</strong></li>)}</ol>
        <button type="button" className="button button-accent" onClick={()=>setHelpOpen(false)}>Got it</button>
      </section>
    </div>}
  </>;
}
