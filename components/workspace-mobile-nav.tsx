"use client";

import Link from "next/link";
import type { Role } from "@/lib/types";
import { consumerViewPath } from "@/lib/workspace-navigation";

export type ConsumerWorkspaceView="home"|"looks"|"closet"|"outfits";

const consumerTabs:Array<{id:ConsumerWorkspaceView;label:string;icon:string}>=[
  {id:"home",label:"Today",icon:"⌂"},
  {id:"looks",label:"Looks",icon:"◇"},
  {id:"closet",label:"Closet",icon:"▦"},
  {id:"outfits",label:"Outfits",icon:"◫"},
];

export function WorkspaceMobileNav({role,active,onConsumerView,onAdd}:{role:Role;active?:ConsumerWorkspaceView|"community"|"brand";onConsumerView?:(view:ConsumerWorkspaceView)=>void;onAdd?:()=>void}){
  if(role==="brand")return <nav className="mobile-tab-bar brand-mobile-nav" aria-label="Mobile brand navigation">
    <Link className={active==="brand"?"active":""} href="/brand"><span>⌂</span><small>Dashboard</small></Link>
    <Link href="/brand#products"><span>▦</span><small>Products</small></Link>
    <Link href="/brand#brand-looks"><span>◇</span><small>Looks</small></Link>
    <Link className={active==="community"?"active":""} href="/community"><span>◎</span><small>Community</small></Link>
  </nav>;

  return <nav className="mobile-tab-bar consumer-mobile-nav" aria-label="Mobile consumer navigation">
    {consumerTabs.map(tab=>onConsumerView
      ? <button type="button" key={tab.id} className={active===tab.id?"active":""} onClick={()=>onConsumerView(tab.id)}><span>{tab.icon}</span><small>{tab.label}</small></button>
      : <Link key={tab.id} className={active===tab.id?"active":""} href={consumerViewPath(tab.id)}><span>{tab.icon}</span><small>{tab.label}</small></Link>)}
    <Link className={active==="community"?"active":""} href="/community"><span>◎</span><small>Community</small></Link>
    {onAdd?<button type="button" onClick={onAdd}><span>＋</span><small>Add</small></button>:<Link href="/consumer?add=1"><span>＋</span><small>Add</small></Link>}
  </nav>;
}
