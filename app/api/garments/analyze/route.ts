import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { analyzeGarmentImages, MAX_UPLOAD_BYTES, UploadValidationError, validateThreeViewUpload, type InMemoryGarmentImage } from "@/lib/garment-analysis";
import { prepareWardrobeImages } from "@/lib/garment-crop";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { listRegistryProducts, putPrivateImage, privateImageUrl, ProductionConfigurationError, signGarmentConfirmation } from "@/lib/server/production-store";
import type { GarmentView, UploadDescriptor } from "@/lib/platform-types";

export const runtime = "nodejs";

async function prepareFile(view:GarmentView,file:File):Promise<{part:UploadDescriptor;image:InMemoryGarmentImage}> {
  const bytes=await file.arrayBuffer();
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  const optimized=await sharp(Buffer.from(bytes)).rotate().resize({width:1568,height:1568,fit:"inside",withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer();
  return {
    part:{view,fileName:file.name,contentType:file.type,size:file.size,sha256:Buffer.from(hash).toString("hex")},
    image:{view,contentType:"image/jpeg",base64:optimized.toString("base64")},
  };
}

export async function POST(request:Request) {
  const session=await getSession();
  if (!session) return NextResponse.json({error:"Sign in is required."},{status:401});
  if (session.role!=="consumer") return NextResponse.json({error:"Only Consumer accounts can analyze wardrobe images."},{status:403});
  const limit=consumeRateLimit(`garment-analyze:${session.subject}`,RATE_LIMIT_RULES.garmentAnalyze);
  if(!limit.allowed)return NextResponse.json({error:"Too many analysis requests. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
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
    validateThreeViewUpload(parts);
    const labelText=String(form.get("labelText") ?? "").slice(0,1000);
    const registry=await listRegistryProducts();
    const analysis=await analyzeGarmentImages(parts,prepared.map((item)=>item.image),{registry,labelText});
    const front=prepared.find((entry)=>entry.image.view==="front");
    if(!front)throw new UploadValidationError("A front image is required.");
    // The prepared front photo (orientation-corrected, resized, unmodified framing) is
    // preserved as private evidence; the display version gets the tighter auto-crop
    // and falls back to the original framing when the crop is unsafe.
    const evidenceBytes=Buffer.from(front.image.base64,"base64");
    const {evidence,display}=await prepareWardrobeImages(evidenceBytes);
    const evidenceKey=await putPrivateImage(session.subject,"wardrobe",evidence.buffer,evidence.contentType,"evidence");
    const key=await putPrivateImage(session.subject,"wardrobe",display.buffer,"image/png");
    if(display.fallbackReason)analysis.warnings=[...analysis.warnings,"Automatic garment cropping was not confident on this photo, so the original framing is shown."];
    analysis.processedImage={key,url:(await privateImageUrl(key))!,width:display.width,height:display.height,confirmationToken:"",evidenceKey,cropped:display.cropped};
    analysis.processedImage.confirmationToken=signGarmentConfirmation(session.subject,key,analysis);
    return NextResponse.json({analysis,retention:"The cropped display image and the unmodified evidence photo are stored privately and returned through one-hour signed links."});
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof ProductionConfigurationError) return NextResponse.json({error:error.message},{status:503});
    return NextResponse.json({error:"The garment image set could not be analyzed."},{status:500});
  }
}
