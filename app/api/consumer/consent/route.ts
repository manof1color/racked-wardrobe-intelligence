import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConsumerBrandDataConsent, setConsumerBrandDataConsent } from "@/lib/server/demo-store";

// Judge note: separate from the one-time consent checkbox at login (required just to enter
// the Consumer workspace at all). This is the ongoing, revocable, purpose-specific consent —
// "include my (fictional) wear data in brand-facing cohorts" — and it is wired to actually
// change Brand-side output: see getLiveConsumerProfile() in lib/server/demo-store.ts.
export async function GET() {
  const session=await getSession();
  if (!session || session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  return NextResponse.json({brandDataSharing:getConsumerBrandDataConsent()});
}

export async function PATCH(request:Request) {
  const session=await getSession();
  if (!session || session.role!=="consumer") return NextResponse.json({error:"Consumer role required."},{status:403});
  const body=await request.json().catch(()=>({})) as {brandDataSharing?:boolean};
  if (typeof body.brandDataSharing!=="boolean") return NextResponse.json({error:"brandDataSharing must be a boolean."},{status:400});
  return NextResponse.json({brandDataSharing:setConsumerBrandDataConsent(body.brandDataSharing)});
}
