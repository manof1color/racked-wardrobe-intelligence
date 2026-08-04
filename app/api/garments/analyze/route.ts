import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { analyzeThreeViewSet, MAX_UPLOAD_BYTES, UploadValidationError } from "@/lib/garment-analysis";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime = "nodejs";

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Only Consumer accounts can analyze wardrobe images."},{status:403});
  const contentLength=Number(request.headers.get("content-length") ?? 0);
  const maximumSetBytes=(MAX_UPLOAD_BYTES*3)+1_000_000;
  if (contentLength>maximumSetBytes) return NextResponse.json({error:"The complete three-view upload must be no more than 16 MB."},{status:413});
  try {
    const form=await request.formData();
    const views:GarmentView[]=["front","back","label"];
    const parts:UploadDescriptor[]=views.map((view)=>{
      const value=form.get(view);
      if (!(value instanceof File)) throw new UploadValidationError(`Exactly one ${view} image is required.`);
      return {view,fileName:value.name,contentType:value.type,size:value.size};
    });
    return NextResponse.json({analysis:analyzeThreeViewSet(parts),retention:"Images were validated in memory and were not persisted by the demo adapter."});
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({error:error.message},{status:error.status});
    return NextResponse.json({error:"The three-view set could not be analyzed."},{status:500});
  }
}
