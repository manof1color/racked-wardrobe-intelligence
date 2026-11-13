import type { Role } from "./types.ts";
import type { IconName } from "../components/icons.tsx";

export function workspaceHome(role:Role) {
  return role==="consumer"?"/consumer":"/brand";
}

export function consumerViewPath(view:"home"|"looks"|"closet"|"outfits") {
  return view==="home"?"/consumer":`/consumer?view=${view}`;
}

export function brandViewPath(view:"overview"|"catalog"|"looks") {
  return view==="overview"?"/brand":`/brand?view=${view}`;
}

/** The consumer views, in tab order. Shared by the desktop tab row, the phone tab bar and the Community page. */
export const CONSUMER_TABS:ReadonlyArray<{id:"home"|"looks"|"closet"|"outfits";label:string;icon:IconName}>=[
  {id:"home",label:"Today",icon:"today"},
  {id:"looks",label:"Looks",icon:"looks"},
  {id:"closet",label:"Closet",icon:"closet"},
  {id:"outfits",label:"Outfits",icon:"outfits"},
];

/** The brand views, in tab order. */
export const BRAND_TABS:ReadonlyArray<{id:"overview"|"catalog"|"looks";label:string;icon:IconName}>=[
  {id:"overview",label:"Overview",icon:"overview"},
  {id:"catalog",label:"Catalog",icon:"catalog"},
  {id:"looks",label:"Brand Looks",icon:"looks"},
];
