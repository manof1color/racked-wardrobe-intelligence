"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/lib/types";
import { workspaceHome } from "@/lib/workspace-navigation";

export function AppShell({ role, children }: { role:Role; children:ReactNode }) {
  const [menuOpen,setMenuOpen]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    function closeFromOutside(event:PointerEvent){if(menuRef.current&&!menuRef.current.contains(event.target as Node))setMenuOpen(false);}
    function closeFromKeyboard(event:KeyboardEvent){if(event.key==="Escape")setMenuOpen(false);}
    document.addEventListener("pointerdown",closeFromOutside);
    document.addEventListener("keydown",closeFromKeyboard);
    return ()=>{document.removeEventListener("pointerdown",closeFromOutside);document.removeEventListener("keydown",closeFromKeyboard);};
  },[]);
  async function logout() {
    if(signingOut)return;
    setSigningOut(true);
    try {
      const response=await fetch("/api/auth/logout", { method:"POST" });
      if(!response.ok)throw new Error("Sign out failed");
      window.location.assign("/");
    } catch { setSigningOut(false); }
  }
  return <div className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href={workspaceHome(role)} aria-label={`Racked ${role} home`}>RACKED<span>.</span></Link>
      <div className={`mode-badge ${role}`}><i /> {role === "consumer" ? "CONSUMER MODE" : "BRAND MODE"}</div>
      <nav aria-label="Workspace navigation">
        <Link href={workspaceHome(role)}>Workspace</Link>
        <Link href="/community">Community</Link>
        <button className="text-button" onClick={logout}>Sign out</button>
      </nav>
      <div className="app-menu" ref={menuRef}>
        <button type="button" className="app-menu-trigger" aria-label={menuOpen?"Close account menu":"Open account menu"} aria-expanded={menuOpen} aria-controls="authenticated-account-menu" onClick={()=>setMenuOpen(open=>!open)}><span className="account-dot"/><span className="account-dot"/><span className="account-dot"/></button>
        {menuOpen&&<nav className="app-menu-popover account-menu-popover" id="authenticated-account-menu" aria-label={`${role} account menu`}>
          <div className="app-menu-heading"><small>SIGNED IN</small><strong>{role==="consumer"?"Consumer account":"Brand account"}</strong></div>
          <p className="account-menu-note">Use the bottom tabs to move around Racked. This menu is only for your session.</p>
          <button type="button" className="app-menu-signout" disabled={signingOut} onClick={logout}><strong>{signingOut?"Signing out…":"Sign out"}</strong><small>End this session on this device</small></button>
        </nav>}
      </div>
    </header>
    {children}
  </div>;
}
