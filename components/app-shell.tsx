"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/lib/types";

export function AppShell({ role, children }: { role:Role; children:ReactNode }) {
  async function logout() { await fetch("/api/auth/logout", { method:"POST" }); window.location.assign("/"); }
  return <div className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/">RACKED<span>.</span></Link>
      <div className={`mode-badge ${role}`}><i /> {role === "consumer" ? "CONSUMER MODE" : "BRAND MODE"}</div>
      <nav aria-label="Workspace navigation">
        <Link href={role === "consumer" ? "/consumer" : "/brand"}>Overview</Link>
        <Link href="/community">Community</Link>
        <Link href="/partners/clothing">Partners</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/privacy">Privacy</Link>
        <Link className="switch-link" href="/login">Account</Link>
        <button className="text-button" onClick={logout}>Sign out</button>
      </nav>
    </header>
    {children}
  </div>;
}
