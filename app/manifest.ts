import type { MetadataRoute } from "next";

export default function manifest():MetadataRoute.Manifest {
  return {
    name:"Racked Wardrobe Intelligence",
    short_name:"Racked",
    description:"Consumer wardrobe, outfit looks, wear tracking, and brand-linked garment scanning.",
    id:"/consumer",
    start_url:"/consumer",
    scope:"/",
    display:"standalone",
    background_color:"#f5f2ea",
    theme_color:"#171914",
    orientation:"portrait-primary",
    categories:["lifestyle","shopping","utilities"],
    icons:[
      {src:"/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
      {src:"/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
      {src:"/icon-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
    ],
    shortcuts:[
      {name:"My wardrobe",short_name:"Wardrobe",url:"/consumer",icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"}]},
      {name:"Outfit community",short_name:"Community",url:"/community",icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"}]},
    ],
  };
}
