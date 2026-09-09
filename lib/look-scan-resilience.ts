import sharp from "sharp";
import { removeGarmentBackground, type AiBackgroundRemoval } from "./ai-background-removal.ts";
import { prepareDetectedGarmentCutout, type GarmentCutout } from "./garment-cutout.ts";
import { type GarmentIsolation } from "./garment-isolation.ts";
import { activeSegmenter } from "./garment-segmenter.ts";
import { WHOLE_FRAME } from "./detection-bounds.ts";
import { detectGarmentsInLook, type DetectedLookGarment } from "./look-garment-detection.ts";

type DisplayResult = AiBackgroundRemoval | GarmentIsolation | GarmentCutout;

interface DisplayDependencies {
  skipAi?:boolean;
  removeBackground?: (input:Buffer)=>Promise<AiBackgroundRemoval|null>;
  isolate?: (input:Buffer)=>Promise<GarmentIsolation|null>;
  edgeFallback?: (input:Buffer)=>Promise<GarmentCutout>;
}

interface DetectionInput {
  base64:string;
  contentType:"image/jpeg"|"image/png"|"image/webp";
  model?:string;
  region?:string;
  image?:{width:number;height:number};
}

interface DetectionDependencies {
  detect?: (input:DetectionInput)=>Promise<DetectedLookGarment[]>;
}

/**
 * Transparent display images are only accepted when they retain a meaningful amount
 * of clearly visible subject. This catches the particularly confusing failure where a
 * light garment on a light background survives as a few faint, almost transparent
 * pixels. The ordinary bounded crop is always safer than displaying an erased item.
 */
export async function hasPlausibleVisibleSubject(result:DisplayResult):Promise<boolean> {
  if(!result.backgroundRemoved)return true;
  const raw=await sharp(result.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels=raw.info.width*raw.info.height;
  if(pixels===0)return false;
  let visible=0;
  let solid=0;
  const channels=raw.info.channels;
  const alphaChannel=channels-1;
  for(let index=alphaChannel;index<raw.data.length;index+=channels) {
    const alpha=raw.data[index];
    if(alpha>=32)visible++;
    if(alpha>=192)solid++;
  }
  const visibleRatio=visible/pixels;
  const solidRatio=solid/pixels;
  return visibleRatio>=0.06&&solidRatio>=0.025&&solid/Math.max(1,visible)>=0.45;
}

/**
 * Last-resort display preparation. The bytes have already been decoded and bounded by
 * the server, so retaining the ordinary photo is safer than rejecting a real garment
 * merely because an optional isolation pass was uncertain or unavailable.
 */
export async function prepareSimpleLookDisplay(input:Buffer):Promise<GarmentCutout> {
  const output=await sharp(input)
    .rotate()
    .resize({width:700,height:900,fit:"inside",withoutEnlargement:true})
    .ensureAlpha()
    .png({compressionLevel:9})
    .toBuffer({resolveWithObject:true});
  return {buffer:output.data,width:output.info.width,height:output.info.height,backgroundRemoved:false,removedPixelRatio:0,method:"none"};
}

/**
 * Optional image isolation must never be a gate on wardrobe intake. Each increasingly
 * conservative method is tried independently; even an unexpected exception in one
 * method still reaches the next method and finally the ordinary bounded photo.
 */
export async function prepareResilientLookDisplay(input:Buffer,dependencies:DisplayDependencies={}):Promise<DisplayResult> {
  const methods=[
    ...(dependencies.skipAi?[]:[dependencies.removeBackground??removeGarmentBackground]),
    dependencies.isolate??((bytes:Buffer)=>activeSegmenter().segment(bytes)),
    dependencies.edgeFallback??prepareDetectedGarmentCutout,
  ] as Array<(bytes:Buffer)=>Promise<DisplayResult|null>>;
  for(const method of methods) {
    try {
      const result=await method(input);
      if(result&&await hasPlausibleVisibleSubject(result))return result;
      if(result?.backgroundRemoved)console.warn("Rejected an over-erased garment display; trying a safer crop",{method:result.method});
    } catch(error) {
      console.error("Optional garment display preparation failed",{name:error instanceof Error?error.name:"UnknownError"});
    }
  }
  return prepareSimpleLookDisplay(input);
}

export function manualReviewLookCandidate(reason:"no-detection"|"provider-failure"="no-detection"):DetectedLookGarment {
  const providerFailed=reason==="provider-failure";
  return {
    id:crypto.randomUUID(),
    bounds:WHOLE_FRAME,
    exactBounds:false,
    analysis:{
      provider:"manual-review",
      fallback:true,
      confidence:0,
      dataSufficiency:"partial",
      garment:{name:"Unrecognized piece",category:"unknown",subtype:"other-garment",wearableUnit:"single",color:"unknown",pattern:"unknown",style:[],construction:[],material:"unknown",alternatives:[]},
      label:{brand:"Brand not verified",sku:"UNVERIFIED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
      evidence:[{view:"front",findings:[providerFailed?"The image-recognition service did not complete; no garment attributes were inferred.":"AI did not return a confident detection for this photo."]}],
      warnings:[providerFailed
        ? "The image service could not complete this scan, but your photo is still usable. Set the category and name yourself, or try AI recognition again later."
        : "AI could not classify this photo. Set the category and name yourself before saving, or retake the photo with the piece laid flat and fully in frame."],
    },
  };
}

/** A provider outage or malformed model response becomes an honest editable item. */
export async function detectLookOrManualReview(input:DetectionInput,dependencies:DetectionDependencies={}):Promise<{detections:DetectedLookGarment[];providerFailed:boolean}> {
  try {
    const detections=await (dependencies.detect??detectGarmentsInLook)(input);
    return {detections:detections.length?detections:[manualReviewLookCandidate()],providerFailed:false};
  } catch(error) {
    console.error("Whole-look recognition unavailable",{name:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"Unknown provider failure"});
    return {detections:[manualReviewLookCandidate("provider-failure")],providerFailed:true};
  }
}
