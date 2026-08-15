import type { Role } from "./types.ts";

export interface WorkspaceMenuItem {
  href:string;
  label:string;
  description:string;
}

export function workspaceHome(role:Role) {
  return role==="consumer"?"/consumer":"/brand";
}

export function consumerViewPath(view:"home"|"looks"|"closet"|"outfits") {
  return view==="home"?"/consumer":`/consumer?view=${view}`;
}

export function workspaceMenuItems(role:Role):WorkspaceMenuItem[] {
  if(role==="brand")return [
    {href:"/brand",label:"Dashboard",description:"Wear and community intelligence"},
    {href:"/brand#products",label:"Products",description:"Enroll and review products"},
    {href:"/brand#brand-looks",label:"Brand Looks",description:"Build looks from enrolled products"},
    {href:"/community",label:"Community",description:"See published consumer and brand looks"},
  ];
  return [
    {href:"/consumer",label:"Today",description:"Your wardrobe overview"},
    {href:"/consumer?view=looks",label:"Build a Look",description:"Create an outfit from what you own"},
    {href:"/consumer?view=closet",label:"Closet",description:"Review every tracked piece"},
    {href:"/consumer?view=outfits",label:"Saved Outfits",description:"Repeat and record saved looks"},
    {href:"/consumer?add=1",label:"Add Clothing",description:"Scan a look or verify one item"},
    {href:"/community",label:"Community",description:"Discover and recreate published looks"},
  ];
}
