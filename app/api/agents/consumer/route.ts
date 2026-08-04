import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runConsumerStylistAgent } from "@/lib/agents";

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const body=await request.json().catch(()=>({})) as {occasion?:string;weather?:string};
  if ((body.occasion?.length??0)>100 || (body.weather?.length??0)>100) return NextResponse.json({error:"Occasion and weather must each be 100 characters or fewer."},{status:400});
  return NextResponse.json({reply:runConsumerStylistAgent(body)});
}
