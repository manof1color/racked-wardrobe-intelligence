"use client";

import Link from "next/link";
import type { Role } from "@/lib/types";
import { brandViewPath, consumerViewPath } from "@/lib/workspace-navigation";
import { Icon, type IconName } from "./icons";

export type ConsumerWorkspaceView="home"|"looks"|"closet"|"outfits";
export type BrandWorkspaceView="overview"|"catalog"|"looks"|"product";
export type BrandTabView=Exclude<BrandWorkspaceView,"product">;

export const consumerTabs:Array<{id:ConsumerWorkspaceView;label:string;icon:IconName}>=[
  {id:"home",label:"Today",icon:"today"},
  {id:"looks",label:"Looks",icon:"looks"},
  {id:"closet",label:"Closet",icon:"closet"},
  {id:"outfits",label:"Outfits",icon:"outfits"},
];

// Brand tabs used to be anchor jumps into one long page: tapping "Products" scrolled, but never
// changed what was on screen. They now switch views, the way the consumer tabs always have.
const brandTabs:Array<{id:BrandTabView;label:string;icon:IconName}>=[
  {id:"overview",label:"Overview",icon:"overview"},
  {id:"catalog",label:"Catalog",icon:"catalog"},
  {id:"looks",label:"Looks",icon:"looks"},
];

export function WorkspaceMobileNav({role,active,onConsumerView,onBrandView,onAdd}:{role:Role;active?:ConsumerWorkspaceView|BrandTabView|"community"|"brand";onConsumerView?:(view:ConsumerWorkspaceView)=>void;onBrandView?:(view:BrandTabView)=>void;onAdd?:()=>void}){
  if(role==="brand")return <nav className="mobile-tab-bar brand-mobile-nav" aria-label="Mobile brand navigation">
    {brandTabs.map(tab=>onBrandView
      ? <button type="button" key={tab.id} className={active===tab.id?"active":""} onClick={()=>onBrandView(tab.id)}><Icon name={tab.icon}/><small>{tab.label}</small></button>
      : <Link key={tab.id} className={active===tab.id?"active":""} href={brandViewPath(tab.id)}><Icon name={tab.icon}/><small>{tab.label}</small></Link>)}
    <Link className={active==="community"?"active":""} href="/community"><Icon name="community"/><small>Community</small></Link>
  </nav>;

  return <nav className="mobile-tab-bar consumer-mobile-nav" aria-label="Mobile consumer navigation">
    {consumerTabs.map(tab=>onConsumerView
      ? <button type="button" key={tab.id} className={active===tab.id?"active":""} onClick={()=>onConsumerView(tab.id)}><Icon name={tab.icon}/><small>{tab.label}</small></button>
      : <Link key={tab.id} className={active===tab.id?"active":""} href={consumerViewPath(tab.id)}><Icon name={tab.icon}/><small>{tab.label}</small></Link>)}
    <Link className={active==="community"?"active":""} href="/community"><Icon name="community"/><small>Community</small></Link>
    {onAdd?<button type="button" onClick={onAdd}><Icon name="add"/><small>Add</small></button>:<Link href="/consumer?add=1"><Icon name="add"/><small>Add</small></Link>}
  </nav>;
}
