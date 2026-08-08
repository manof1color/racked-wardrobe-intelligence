import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBrandDataSharing, setBrandDataSharing } from "@/lib/server/production-store";
export async function GET(){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});return NextResponse.json({brandDataSharing:await getBrandDataSharing(session.subject)});}
export async function PATCH(request:Request){const session=await getSession();if(!session||session.role!=="consumer")return NextResponse.json({error:"Consumer account required."},{status:403});const body=await request.json().catch(()=>null) as {brandDataSharing?:boolean}|null;if(typeof body?.brandDataSharing!=="boolean")return NextResponse.json({error:"brandDataSharing must be a boolean."},{status:400});return NextResponse.json({brandDataSharing:await setBrandDataSharing(session.subject,body.brandDataSharing)});}
