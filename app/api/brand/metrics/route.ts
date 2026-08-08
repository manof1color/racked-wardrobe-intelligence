import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { catalog } from "@/lib/demo-data";
import { calculateBrandMetrics } from "@/lib/metrics";
import { getLiveConsumerProfile, recordAggregateQuery, wouldExceedEnumerationBudget } from "@/lib/server/demo-store";

// Judge note: this computation used to run client-side in components/brand-dashboard.tsx,
// which meant the population/cohort data it depends on shipped in the browser's JS bundle —
// readable in devtools regardless of what the rendered UI chose to display. Moving the
// computation here means only the (possibly suppressed) final numbers ever reach the client.
export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="brand") return NextResponse.json({error:"Brand role required."},{status:403});
  const body=await request.json().catch(()=>({})) as {productId?:string};
  if ((body.productId?.length??0)>40) return NextResponse.json({error:"Product ID is invalid."},{status:400});
  const product = catalog.find((item)=>item.id===body.productId) ?? catalog[0];
  if (wouldExceedEnumerationBudget(session.subject, product.id)) {
    return NextResponse.json({error:"Too many distinct product segments were requested in a short window. This anti-enumeration limit prevents reconstructing a small cohort by querying many SKUs in sequence — try again shortly."},{status:429});
  }
  const metrics = calculateBrandMetrics(product, getLiveConsumerProfile());
  recordAggregateQuery(session.subject, product.id);
  return NextResponse.json({metrics});
}
