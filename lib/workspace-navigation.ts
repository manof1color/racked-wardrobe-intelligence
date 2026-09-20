import type { Role } from "./types.ts";

export function workspaceHome(role:Role) {
  return role==="consumer"?"/consumer":"/brand";
}

export function consumerViewPath(view:"home"|"looks"|"closet"|"outfits") {
  return view==="home"?"/consumer":`/consumer?view=${view}`;
}

export function brandViewPath(view:"overview"|"catalog"|"looks") {
  return view==="overview"?"/brand":`/brand?view=${view}`;
}
