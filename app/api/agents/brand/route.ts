import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runBrandWearAgent } from "@/lib/agents";

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="brand") return NextResponse.json({error:"Brand role required."},{status:403});
  const body=await request.json().catch(()=>({})) as {productId?:string};
  if ((body.productId?.length??0)>40) return NextResponse.json({error:"Product ID is invalid."},{status:400});
  return NextResponse.json({reply:runBrandWearAgent(body.productId ?? "p1")});
}
