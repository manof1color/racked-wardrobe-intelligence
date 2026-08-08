import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { analyzeGarmentImages, MAX_UPLOAD_BYTES, UploadValidationError, type InMemoryGarmentImage } from "@/lib/garment-analysis";
import { listRegistryProducts, putPrivateImage, privateImageUrl, ProductionConfigurationError, signGarmentConfirmation } from "@/lib/server/production-store";
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
    const registry=await listRegistryProducts();
    const analysis=await analyzeGarmentImages(parts,prepared.map((item)=>item.image),{registry,labelText});
    if(analysis.fallback&&process.env.NODE_ENV==="production") return NextResponse.json({error:"AI image analysis is not configured yet. Add the private AI provider configuration before uploading wardrobe photos."},{status:503});
    const front=files.find((entry)=>entry.view==="front")?.file;
    if(!front)throw new UploadValidationError("A front image is required.");
    const normalized=await sharp(Buffer.from(await front.arrayBuffer())).rotate().trim({background:"#ffffff",threshold:18}).resize({width:700,height:900,fit:"inside",withoutEnlargement:true}).png({quality:90}).toBuffer({resolveWithObject:true});
    const key=await putPrivateImage(session.subject,"wardrobe",normalized.data,"image/png");
    analysis.processedImage={key,url:(await privateImageUrl(key))!,width:normalized.info.width,height:normalized.info.height,confirmationToken:""};
    analysis.processedImage.confirmationToken=signGarmentConfirmation(session.subject,key,analysis);
    return NextResponse.json({analysis,retention:"The normalized wardrobe image is stored privately and returned through a one-hour signed link."});
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    return NextResponse.json({error:"The garment image set could not be analyzed."},{status:500});
  }
}
