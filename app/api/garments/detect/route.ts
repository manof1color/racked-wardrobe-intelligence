import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, UploadValidationError } from "@/lib/garment-analysis";
import { detectGarmentsInLook, type NormalizedBounds } from "@/lib/look-garment-detection";
import { prepareDetectedGarmentCutout } from "@/lib/garment-cutout";
import { removeGarmentBackground } from "@/lib/ai-background-removal";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { privateImageUrl, ProductionConfigurationError, putPrivateImage, signGarmentConfirmation } from "@/lib/server/production-store";

export const runtime="nodejs";

const allowedTypes=new Set(["image/jpeg","image/png","image/webp"]);

function pixelCrop(bounds:NormalizedBounds,imageWidth:number,imageHeight:number) {
  const horizontalPadding=bounds.width*imageWidth*0.04;
  const verticalPadding=bounds.height*imageHeight*0.04;
  const left=Math.max(0,Math.floor((bounds.x*imageWidth)-horizontalPadding));
  const top=Math.max(0,Math.floor((bounds.y*imageHeight)-verticalPadding));
  const right=Math.min(imageWidth,Math.ceil(((bounds.x+bounds.width)*imageWidth)+horizontalPadding));
  const bottom=Math.min(imageHeight,Math.ceil(((bounds.y+bounds.height)*imageHeight)+verticalPadding));
  return {left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
}

export async function POST(request:Request) {
  const session=await getSession();
  if(!session)return NextResponse.json({error:"Sign in is required."},{status:401});
  if(session.role!=="consumer")return NextResponse.json({error:"Only Consumer accounts can scan a look into a wardrobe."},{status:403});
  const limit=consumeRateLimit(`look-detect:${session.subject}`,RATE_LIMIT_RULES.lookDetect);
  if(!limit.allowed)return NextResponse.json({error:"Too many look scans. Try again in a few minutes."},{status:429,headers:{"retry-after":String(limit.retryAfterSeconds)}});
  if(Number(request.headers.get("content-length")??0)>MAX_UPLOAD_BYTES+1_000_000)return NextResponse.json({error:"The photo must be no more than 5 MB."},{status:413});
  try {
    const form=await request.formData();
    const file=form.get("photo");
    if(!(file instanceof File)||file.size===0)throw new UploadValidationError("Choose a photo containing the pieces you want to add.");
    if(!allowedTypes.has(file.type))throw new UploadValidationError("The look photo must be JPG, PNG, or WebP.");
    if(file.size>MAX_UPLOAD_BYTES)throw new UploadValidationError("The look photo must be no more than 5 MB.",413);
    if((process.env.AI_PROVIDER??"").toLowerCase()!=="bedrock")return NextResponse.json({error:"Multi-piece AI scanning is not configured. Add the private Amazon Bedrock provider configuration first."},{status:503});

    const prepared=await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true})
      .jpeg({quality:84,mozjpeg:true})
      .toBuffer({resolveWithObject:true});
    const detections=await detectGarmentsInLook({base64:prepared.data.toString("base64"),contentType:"image/jpeg"});
    if(detections.length===0)return NextResponse.json({error:"No distinct clothing pieces were detected. Try a clearer, well-lit photo where each piece is visible."},{status:422});

    const evidenceKey=await putPrivateImage(session.subject,"wardrobe",prepared.data,"image/jpeg","evidence");
    // A small batch keeps a full 16-piece look responsive without sending an
    // uncontrolled burst of image-model and S3 requests.
    for(let offset=0;offset<detections.length;offset+=4)await Promise.all(detections.slice(offset,offset+4).map(async detection=>{
        const crop=pixelCrop(detection.bounds,prepared.info.width,prepared.info.height);
        const cropBytes=await sharp(prepared.data).extract(crop).png().toBuffer();
        // Prefer model segmentation for a clean catalog-style cutout. The existing
        // conservative edge algorithm remains an honest availability fallback.
        const display=await removeGarmentBackground(cropBytes)??await prepareDetectedGarmentCutout(cropBytes);
        const key=await putPrivateImage(session.subject,"wardrobe",display.buffer,"image/png");
        detection.analysis.processedImage={
          key,
          url:(await privateImageUrl(key))!,
          width:display.width,
          height:display.height,
          confirmationToken:"",
          evidenceKey,
          cropped:true,
          backgroundRemoved:display.backgroundRemoved,
          backgroundRemovalMethod:display.method,
        };
        detection.analysis.processedImage.confirmationToken=signGarmentConfirmation(session.subject,key,detection.analysis);
      }));
    return NextResponse.json({
      detections,
      retention:"The source image and each isolated display cutout are private, encrypted at rest, and returned only through expiring links.",
      verification:"Detected brand text is editable suggestion evidence only; it never creates verified product identity.",
    });
  } catch(error) {
    if(error instanceof UploadValidationError)return NextResponse.json({error:error.message},{status:error.status});
    if(error instanceof ProductionConfigurationError)return NextResponse.json({error:error.message},{status:503});
    console.error("Multi-garment look detection failed",{name:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"Unknown provider failure"});
    return NextResponse.json({error:"AI could not separate the clothing in this photo. Try a clearer image with less overlap."},{status:502});
  }
}
