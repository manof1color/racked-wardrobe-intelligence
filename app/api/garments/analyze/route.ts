import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { analyzeGarmentImages, MAX_UPLOAD_BYTES, UploadValidationError, type InMemoryGarmentImage } from "@/lib/garment-analysis";
import { listBrandProducts } from "@/lib/server/demo-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime = "nodejs";

async function prepareFile(view:GarmentView,file:File):Promise<{part:UploadDescriptor;image:InMemoryGarmentImage}> {
  const bytes=await file.arrayBuffer();
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return {
    part:{view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")},
    image:{view,contentType:file.type as InMemoryGarmentImage["contentType"],base64:Buffer.from(bytes).toString("base64")},
  };
}

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
    const files=views.flatMap((view)=>{
      const value=form.get(view);
      return value instanceof File&&value.size>0?[{view,file:value}]:[];
    });
    const prepared=await Promise.all(files.map(({view,file})=>prepareFile(view,file)));
    const parts=prepared.map((item)=>item.part);
    const labelText=String(form.get("labelText") ?? "").slice(0,1000);
    const analysis=await analyzeGarmentImages(parts,prepared.map((item)=>item.image),{registry:listBrandProducts(),labelText});
    return NextResponse.json({analysis,retention:"Images were analyzed in request memory; raw consumer uploads were not persisted by Racked."});
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({error:error.message},{status:error.status});
    return NextResponse.json({error:"The garment image set could not be analyzed."},{status:500});
  }
}
