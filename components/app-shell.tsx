"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/lib/types";
import { workspaceHome } from "@/lib/workspace-navigation";

export function AppShell({ role, children }: { role:Role; children:ReactNode }) {
  async function logout() { await fetch("/api/auth/logout", { method:"POST" }); window.location.assign("/"); }
  return <div className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href={workspaceHome(role)} aria-label={`Racked ${role} home`}>RACKED<span>.</span></Link>
      <div className={`mode-badge ${role}`}><i /> {role === "consumer" ? "CONSUMER MODE" : "BRAND MODE"}</div>
      <nav aria-label="Workspace navigation">
        <Link href={workspaceHome(role)}>Workspace</Link>
        <Link href="/community">Community</Link>
        <button className="text-button" onClick={logout}>Sign out</button>
      </nav>
    </header>
    {children}
  </div>;
}
