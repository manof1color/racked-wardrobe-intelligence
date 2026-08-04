import type { MetadataRoute } from "next";

export default function manifest():MetadataRoute.Manifest {
  return {
    name:"Racked Wardrobe Intelligence",
    short_name:"Racked",
    description:"Consumer wardrobe, outfit avatar, wear tracking, and brand-linked garment scanning.",
    start_url:"/consumer",
    display:"standalone",
    background_color:"#f5f2ea",
    theme_color:"#171914",
    orientation:"portrait-primary",
    icons:[{src:"/icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any"}],
  };
}
