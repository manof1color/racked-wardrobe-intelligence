import type { Product, WardrobeItem } from "./types.ts";

export const wardrobe: WardrobeItem[] = [
  { id:"w1", name:"Ribbed white tee", category:"top", color:"white", style:["minimal","casual"], season:"all-season", wearCount:18, lastWornDays:2, source:"manual", art:"ivory" },
  { id:"w2", name:"Indigo straight jean", category:"bottom", color:"indigo", style:["classic","casual"], season:"all-season", wearCount:15, lastWornDays:4, source:"ai-confirmed", art:"denim" },
  { id:"w3", name:"Black wide-leg trouser", category:"bottom", color:"black", style:["modern","workwear"], season:"all-season", wearCount:11, lastWornDays:6, source:"manual", art:"ink" },
  { id:"w4", name:"Camel knit sweater", category:"knitwear", color:"camel", style:["classic","soft"], season:"winter", wearCount:9, lastWornDays:18, source:"ai-confirmed", art:"camel" },
  { id:"w5", name:"Navy poplin shirt", category:"top", color:"navy", style:["classic","workwear"], season:"all-season", wearCount:13, lastWornDays:3, source:"manual", art:"navy" },
  { id:"w6", name:"Olive utility jacket", category:"outerwear", color:"olive", style:["utility","casual"], season:"fall", wearCount:5, lastWornDays:42, source:"ai-confirmed", art:"olive" },
  { id:"w7", name:"Cream linen short", category:"bottom", color:"cream", style:["relaxed","minimal"], season:"summer", wearCount:7, lastWornDays:70, source:"manual", art:"sand" },
  { id:"w8", name:"Burgundy midi dress", category:"dress", color:"burgundy", style:["polished","feminine"], season:"fall", wearCount:3, lastWornDays:55, source:"ai-confirmed", art:"wine" },
  { id:"w9", name:"Grey running sneaker", category:"shoe", color:"grey", style:["sport","casual"], season:"all-season", wearCount:21, lastWornDays:1, source:"manual", art:"stone" },
  { id:"w10", name:"Black leather loafer", category:"shoe", color:"black", style:["classic","workwear"], season:"all-season", wearCount:10, lastWornDays:8, source:"manual", art:"charcoal" },
  { id:"w11", name:"Striped cotton tee", category:"top", color:"navy", style:["casual","coastal"], season:"summer", wearCount:8, lastWornDays:12, source:"ai-confirmed", art:"stripe" },
  { id:"w12", name:"Chocolate crossbody", category:"accessory", color:"brown", style:["minimal","classic"], season:"all-season", wearCount:16, lastWornDays:2, source:"manual", art:"cocoa" },
];

export const catalog: Product[] = [
  { id:"p1", sku:"NA-OW-1042", name:"Sienna Soft Overshirt", brand:"Northstar Atelier", category:"outerwear", color:"sienna", style:["minimal","casual"], season:"fall", price:128, pairsWith:["top","bottom","dress"], art:"coral" },
  { id:"p2", sku:"NA-KN-2038", name:"Cloud Merino Vest", brand:"Northstar Atelier", category:"knitwear", color:"cream", style:["minimal","workwear"], season:"winter", price:98, pairsWith:["top","bottom"], art:"cloud" },
  { id:"p3", sku:"NA-SH-7781", name:"Moss Court Sneaker", brand:"Northstar Atelier", category:"shoe", color:"olive", style:["sport","minimal"], season:"all-season", price:112, pairsWith:["bottom","dress"], art:"moss" },
  { id:"p4", sku:"NA-DR-4410", name:"Ink Column Dress", brand:"Northstar Atelier", category:"dress", color:"navy", style:["modern","polished"], season:"all-season", price:148, pairsWith:["outerwear","shoe"], art:"navy" },
  { id:"p5", sku:"NA-BT-9214", name:"Oat Pleated Trouser", brand:"Northstar Atelier", category:"bottom", color:"camel", style:["workwear","classic"], season:"all-season", price:118, pairsWith:["top","knitwear","shoe"], art:"oat" },
  { id:"p6", sku:"NA-TP-3117", name:"Juniper Rib Tank", brand:"Northstar Atelier", category:"top", color:"green", style:["minimal","casual"], season:"summer", price:54, pairsWith:["bottom","outerwear"], art:"juniper" },
  { id:"p7", sku:"NA-AC-6044", name:"Merlot Day Tote", brand:"Northstar Atelier", category:"accessory", color:"burgundy", style:["modern","workwear"], season:"all-season", price:88, pairsWith:["dress","outerwear"], art:"wine" },
  { id:"p8", sku:"NA-OW-1526", name:"Midnight Cropped Blazer", brand:"Northstar Atelier", category:"outerwear", color:"black", style:["polished","modern"], season:"all-season", price:168, pairsWith:["top","bottom","dress"], art:"ink" },
];

export const savedOutfits = [
  { id:"o1", name:"Monday reset", itemIds:["w1","w2","w9","w12"], wears:8 },
  { id:"o2", name:"Client day", itemIds:["w5","w3","w10","w12"], wears:6 },
  { id:"o3", name:"Cool weekend", itemIds:["w11","w2","w6","w9"], wears:4 },
];
