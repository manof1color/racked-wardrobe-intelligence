import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listOutfits, listWardrobe } from "@/lib/server/production-store";
import type { AgentReply } from "@/lib/platform-types";

export async function POST(request:Request) {
  const session=await getSession();if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});if(session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});
  const body=await request.json().catch(()=>({})) as {occasion?:string;weather?:string};
  if((body.occasion?.length??0)>100||(body.weather?.length??0)>100)return NextResponse.json({error:"Occasion and weather must each be 100 characters or fewer."},{status:400});
  const [wardrobe,outfits]=await Promise.all([listWardrobe(session.subject),listOutfits(session.subject)]);
  if(wardrobe.length<2)return NextResponse.json({error:"Add at least two garments before asking the stylist to build an outfit."},{status:400});
  const priority=["top","bottom","shoe","outerwear","accessory"];
  const chosen=priority.map(category=>wardrobe.filter(item=>item.category===category).sort((a,b)=>a.wearCount-b.wearCount)[0]).filter(Boolean).slice(0,4);
  const names=chosen.map(item=>item.name);
  const reply:AgentReply={agent:"consumer-stylist",message:`For ${body.occasion?.trim()||"your plans"}${body.weather?.trim()?` in ${body.weather.trim()}`:""}, combine ${names.join(", ")}. This uses only pieces saved in your wardrobe.`,confidence:chosen.length>=3?"high":"medium",toolsUsed:["private wardrobe","wear history","saved outfits","occasion context"],actions:[{label:"Record this outfit",type:"record-outfit",payload:{itemIds:chosen.map(item=>item.id).join(",")}}],evidence:[`${wardrobe.length} owned garments checked`,`${outfits.length} saved outfits checked`,"Lower-wear compatible pieces were prioritized"]};
  return NextResponse.json({reply});
}
