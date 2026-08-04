import { catalog, savedOutfits, wardrobe } from "./demo-data.ts";
import { scoreProduct } from "./matching.ts";
import type { AgentReply } from "./platform-types.ts";

export function runConsumerStylistAgent(input:{ occasion?:string; weather?:string }): AgentReply {
  const occasion = input.occasion?.trim() || "everyday plans";
  const weather = input.weather?.trim() || "mild weather";
  const top = wardrobe.filter((item)=>item.category === "top").sort((a,b)=>b.wearCount-a.wearCount)[0];
  const bottom = wardrobe.filter((item)=>item.category === "bottom").sort((a,b)=>b.wearCount-a.wearCount)[0];
  const shoe = wardrobe.filter((item)=>item.category === "shoe").sort((a,b)=>b.wearCount-a.wearCount)[0];
  const layer = wardrobe.find((item)=>item.category === "outerwear");
  const chosen = [top,bottom,shoe,layer].filter(Boolean);
  return {
    agent:"consumer-stylist",confidence:"high",toolsUsed:["wardrobe.search","wears.rank","outfits.check","weather.context"],
    message:`For ${occasion} in ${weather}, start with ${top.name}, ${bottom.name}, and ${shoe.name}${layer ? `; add ${layer.name} as the optional layer` : ""}.`,
    evidence:[`${chosen.reduce((sum,item)=>sum+(item?.wearCount ?? 0),0)} combined recorded wears`,`${savedOutfits.length} saved outfits checked`,"No new purchase required"],
    actions:[
      {label:"Record this outfit",type:"record-outfit",payload:{itemIds:chosen.map((item)=>item!.id).join(",")}},
      {label:"Share to community",type:"share-outfit",payload:{title:`${occasion} rotation`,itemIds:chosen.map((item)=>item!.id).join(",")}},
    ],
  };
}

export function runBrandWearAgent(productId:string): AgentReply {
  const product = catalog.find((item)=>item.id===productId) ?? catalog[0];
  const match = scoreProduct(product,wardrobe);
  const actualWear = product.id === "p1" ? 74 : Math.max(28,Math.min(81,match.score-14));
  return {
    agent:"brand-wear-intelligence",confidence:"high",toolsUsed:["wears.aggregate","products.lookup","segments.threshold","matches.explain"],
    message:`${product.name} has a ${actualWear}% 60-day actual-wear rate in the fictional opted-in cohort. Pairing strength is the clearest opportunity; duplicate risk should remain in the campaign brief.`,
    evidence:[`${actualWear}% of matched owners recorded a wear in 60 days`,`${match.score}/100 wardrobe-fit score`,`${match.reasons[0]}`],
    actions:[
      {label:"Build wear-led campaign",type:"campaign",payload:{productId:product.id}},
      {label:"Review low-wear cohort",type:"segment",payload:{productId:product.id,segment:"low-wear"}},
    ],
  };
}
