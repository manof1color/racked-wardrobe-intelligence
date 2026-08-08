"use client";

import Link from "next/link";
import { useState } from "react";
import type { Role } from "@/lib/types";

type AuthMode="signin"|"create";

export function LoginPanel() {
  const [mode,setMode]=useState<AuthMode>("signin");
  const [role,setRole]=useState<Role>("consumer");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [brandName,setBrandName]=useState("");
  const [consent,setConsent]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit() {
    setBusy(true);setError("");
    try {
      const endpoint=mode==="create"?"/api/auth/register":"/api/auth/login";
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password,role,displayName,brandName,consent})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"Account access failed.");
      window.location.assign(data.destination);
    } catch(reason){setError(reason instanceof Error?reason.message:"Account access failed.");setBusy(false);}
  }

  return <main className="auth-shell">
    <Link className="wordmark auth-logo" href="/">RACKED<span>.</span></Link>
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="eyebrow">PRIVATE WARDROBE INTELLIGENCE</div>
      <h1 id="auth-title">{mode==="signin"?"Welcome back.":"Create your Racked account."}</h1>
      <p>{mode==="signin"?"Sign in to your wardrobe or brand workspace.":"Choose the workspace that matches how you will use Racked."}</p>
      <div className="role-switch" role="group" aria-label="Account action">
        <button className={mode==="signin"?"active":""} onClick={()=>{setMode("signin");setError("");}}>Sign in</button>
        <button className={mode==="create"?"active":""} onClick={()=>{setMode("create");setError("");}}>Create account</button>
      </div>
      {mode==="create"&&<div className="role-switch" role="group" aria-label="Account type">
        <button className={role==="consumer"?"active":""} onClick={()=>setRole("consumer")}>Consumer</button>
        <button className={role==="brand"?"active":""} onClick={()=>setRole("brand")}>Brand</button>
      </div>}
      <div className="auth-fields">
        {mode==="create"&&<label><span>Your name</span><input autoComplete="name" value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder="Alex Morgan"/></label>}
        {mode==="create"&&role==="brand"&&<label><span>Brand name</span><input autoComplete="organization" value={brandName} onChange={event=>setBrandName(event.target.value)} placeholder="Your registered brand"/></label>}
        <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com"/></label>
        <label><span>Password</span><input type="password" autoComplete={mode==="create"?"new-password":"current-password"} value={password} onChange={event=>setPassword(event.target.value)} placeholder={mode==="create"?"12+ characters":"Your password"}/></label>
      </div>
      {mode==="create"&&role==="consumer"&&<label className="consent-row"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span><strong>I consent to wardrobe image processing.</strong><small>My photos and wear history remain private. Brands receive only qualifying anonymous aggregates when I separately enable sharing.</small></span></label>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button className="button button-accent button-full" disabled={busy||!email||!password||(mode==="create"&&(!displayName||(role==="brand"&&!brandName)||(role==="consumer"&&!consent)))} onClick={submit}>{busy?"Please wait…":mode==="signin"?"Sign in →":"Create account →"}</button>
      <p className="auth-fineprint">Passwords are salted and hashed. Sessions use secure HTTP-only cookies; private photos are never placed in the public website directory.</p>
    </section>
  </main>;
}
