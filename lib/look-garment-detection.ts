import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { parseModelJson } from "./bedrock-json.ts";
import { garmentTaxonomyPrompt, normalizeGarmentClassification } from "./garment-taxonomy.ts";
import type { GarmentAnalysis } from "./platform-types.ts";
import { BEDROCK_VISION_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";
import { boundsOrWholeFrame, type NormalizedBounds as Bounds } from "./detection-bounds.ts";

export const MAX_LOOK_GARMENTS = 16;
/**
 * Whole-look scans are the one vision task where a stronger model earns its cost:
 * it must count overlapping instances, keep adjacent footwear pairs separate, and
 * return usable boxes for every item. Routine single-garment analysis and Hanger
 * remain on the less expensive AI_MODEL (currently Nova Lite).
 *
 * The US geographic inference profile is valid from the production us-east-2 region
 * and keeps processing within the documented US destination regions.
 */
export const DEFAULT_LOOK_DETECTION_MODEL = "us.amazon.nova-pro-v1:0";
export const FALLBACK_LOOK_DETECTION_MODEL = "amazon.nova-lite-v1:0";

export type { NormalizedBounds } from "./detection-bounds.ts";

export interface DetectedLookGarment {
  id: string;
  bounds: Bounds;
  /** False when the model gave no usable box and the whole frame is standing in. */
  exactBounds: boolean;
  analysis: GarmentAnalysis;
}

interface DetectionProviderResult {
  garments?: unknown[];
}

interface CleanDetection {
  bounds: Bounds;
  exactBounds: boolean;
  name:string;
  category:GarmentAnalysis["garment"]["category"];
  subtype:GarmentAnalysis["garment"]["subtype"];
  wearableUnit:"single"|"pair";
  pairId:string|null;
  color:string;
  pattern:string;
  material:string;
  style:string[];
  confidence:number;
  brand:string|null;
  visibleEvidence:string[];
}

function cleanText(value:unknown,fallback:string,maximum:number) {
  const text=typeof value==="string"?value.trim():"";
  return text.slice(0,maximum)||fallback;
}

function cleanStringArray(value:unknown,maximumItems:number,maximumLength:number) {
  return (Array.isArray(value)?value:[])
    .filter((item):item is string=>typeof item==="string")
    .map(item=>item.trim().slice(0,maximumLength))
    .filter(Boolean)
    .slice(0,maximumItems);
}



function intersectionOverUnion(a:Bounds,b:Bounds) {
  const left=Math.max(a.x,b.x);
  const top=Math.max(a.y,b.y);
  const right=Math.min(a.x+a.width,b.x+b.width);
  const bottom=Math.min(a.y+a.height,b.y+b.height);
  const intersection=Math.max(0,right-left)*Math.max(0,bottom-top);
  const union=(a.width*a.height)+(b.width*b.height)-intersection;
  return union>0?intersection/union:0;
}

function unionBounds(a:Bounds,b:Bounds):Bounds {
  const x=Math.min(a.x,b.x);
  const y=Math.min(a.y,b.y);
  const right=Math.max(a.x+a.width,b.x+b.width);
  const bottom=Math.max(a.y+a.height,b.y+b.height);
  return {x,y,width:Math.min(1-x,right-x),height:Math.min(1-y,bottom-y)};
}

function visibleBrand(value:unknown) {
  const cleaned=cleanText(value,"",100);
  return !cleaned||/^(unknown|none|n\/a|not visible|unbranded|illegible)$/i.test(cleaned)?null:cleaned;
}

/**
 * Converts untrusted model output into bounded wardrobe candidates. AI-read brand text
 * is always suggestion-only; this path has no authority to create a registry match.
 */
export function parseLookGarmentDetections(value:unknown,image?:{width:number;height:number}):DetectedLookGarment[] {
  const root=value&&typeof value==="object"?value as DetectionProviderResult:{};
  const raw=Array.isArray(root.garments)?root.garments:[];
  const cleaned:CleanDetection[]=[];
  for(const entry of raw.slice(0,MAX_LOOK_GARMENTS*4)) {
    if(!entry||typeof entry!=="object")continue;
    const candidate=entry as Record<string,unknown>;
    const {bounds,exact}=boundsOrWholeFrame(candidate.bounds,image);
    const classification=normalizeGarmentClassification(
      String(candidate.category??""),
      String(candidate.subtype??candidate.name??""),
    );
    // "clothing", "apparel" and friends used to drop the detection outright. They now
    // survive as an explicitly unknown piece for the person to label.
    const named=cleanText(candidate.name,"",100)||classification.subtype;
    if(classification.category==="unknown"&&!named)continue;
    const pairId=classification.category==="shoe"?cleanText(candidate.pairId,"",64)||null:null;
    cleaned.push({
      bounds,
      exactBounds:exact,
      name:cleanText(candidate.name,classification.subtype,100),
      ...classification,
      wearableUnit:classification.category==="shoe"&&String(candidate.wearableUnit??"").toLowerCase()==="pair"?"pair":"single",
      pairId,
      color:cleanText(candidate.color,"unknown",60),
      pattern:cleanText(candidate.pattern,"unknown",60),
      material:cleanText(candidate.material,"unknown",100),
      style:cleanStringArray(candidate.style,8,60),
      confidence:Math.max(0,Math.min(95,Math.round(Number(candidate.confidence)||0))),
      brand:visibleBrand(candidate.visibleBrandText),
      visibleEvidence:cleanStringArray(candidate.visibleEvidence,8,140),
    });
  }

  // The provider is told to return one object per wearable pair. If it still emits
  // a left and right shoe separately, their shared pairId is a deterministic signal
  // that they belong to one wardrobe unit. We never merge merely because two shoes
  // look similar; adjacent pairs on a rack must remain separate.
  const grouped:CleanDetection[]=[];
  for(const candidate of cleaned) {
    const existing=candidate.pairId?grouped.find(item=>item.category==="shoe"&&item.pairId===candidate.pairId):undefined;
    if(existing) {
      existing.bounds=unionBounds(existing.bounds,candidate.bounds);
      existing.exactBounds=existing.exactBounds&&candidate.exactBounds;
      existing.wearableUnit="pair";
      existing.confidence=Math.round((existing.confidence+candidate.confidence)/2);
      existing.visibleEvidence=[...new Set([...existing.visibleEvidence,...candidate.visibleEvidence,"Matching left and right shoes grouped as one wearable pair"])].slice(0,8);
      if(!existing.brand&&candidate.brand)existing.brand=candidate.brand;
      continue;
    }
    grouped.push(candidate);
  }

  const detections:DetectedLookGarment[]=[];
  for(const candidate of grouped) {
    if(detections.some(existing=>intersectionOverUnion(existing.bounds,candidate.bounds)>0.88))continue;
    const visibleEvidence=candidate.visibleEvidence;
    detections.push({
      id:crypto.randomUUID(),
      bounds:candidate.bounds,
      exactBounds:candidate.exactBounds,
      analysis:{
        provider:"multimodal",
        fallback:false,
        confidence:candidate.confidence,
        dataSufficiency:"partial",
        garment:{
          name:candidate.name,
          category:candidate.category,
          subtype:candidate.subtype,
          wearableUnit:candidate.wearableUnit,
          color:candidate.color,
          pattern:candidate.pattern,
          style:candidate.style,
          construction:visibleEvidence,
          material:candidate.material,
          alternatives:[],
        },
        label:{
          brand:candidate.brand??"Brand not verified",
          sku:"UNVERIFIED",
          brandSlug:null,
          matched:false,
          suggested:Boolean(candidate.brand),
          registryProductId:null,
          matchMethod:candidate.brand?"ai-label-text":"none",
        },
        evidence:[{view:"front",findings:visibleEvidence.length?visibleEvidence:["Garment detected as a distinct visible piece"]}],
        warnings:[candidate.brand?`“${candidate.brand}” was read from visible image evidence. Confirm or edit it; it is not verified product identity.`:"No verified brand or SKU evidence was supplied. Add or edit your own label if known."],
      },
    });
    if(detections.length>=MAX_LOOK_GARMENTS)break;
  }
  return detections;
}

export function buildLookDetectionPrompt() {
  return `Inspect the ENTIRE image systematically from top to bottom and left to right. Before returning JSON, make an internal inventory by row or shelf, count every visible wardrobe unit in each region, and reconcile that inventory with the final garments array. Detect every distinct visible clothing, footwear, bag, jewelry, and wearable accessory wardrobe unit, including partially obscured pieces when enough shape is visible to classify them. Do not identify or describe people, bodies, age, gender, ethnicity, or ownership. Ignore furniture, shelves, hangers, laundry baskets, containers, and background objects.

FOOTWEAR PAIR RULE: a matching left and right shoe together are ONE wardrobe unit, not two garments. Return one footwear object with wearableUnit "pair" and one tight bounds rectangle enclosing both shoes. Never return separate detections for the two shoes in a pair. Do not combine adjacent shoes with different designs, colors, construction, sole shape, lacing, or visible branding. Use a unique stable pairId such as "row-2-pair-3" for every complete pair. If you must emit the two sides separately because of overlap, give both exactly the same nonempty pairId so the server can combine them. Never reuse one pairId for a neighboring pair. If only one unmatched shoe is visibly present, use wearableUnit "single" and an empty pairId.

After the first pass, perform a second coverage check of every row, shelf, image edge, and partially hidden region, adding any missed wearable units. On a shoe rack, the final count is the number of complete matching pairs plus the number of genuinely unmatched single shoes — never the raw number of visible shoe objects. Do not emit the same physical item or pair twice. Use this controlled taxonomy: ${garmentTaxonomyPrompt()}. SINGLE GARMENT: a photo containing exactly one garment is normal and expected. Return that one garment. Never return an empty array because there is only one item, because the item is folded, creased, or laid flat, or because you cannot read a brand.

Return only JSON with {"garments":[...]}. Each garment must contain: name, category, subtype, wearableUnit (single or pair), pairId (shared only by two sides of one footwear pair, otherwise empty), color, pattern, material, style (array), confidence (integer 0-95), visibleBrandText (only text genuinely visible, otherwise empty), visibleEvidence (array), and bounds. Give bounds as {"x":,"y":,"width":,"height":} where every value is a fraction of the full image between 0 and 1 — for example a garment filling the middle half of the photo is {"x":0.25,"y":0.25,"width":0.5,"height":0.5}. Bounds must tightly contain the complete garment or complete footwear pair. If you are unsure of the exact rectangle, still return the garment with your best estimate; a garment with an imprecise box is far more useful than a missing garment. Return at most ${MAX_LOOK_GARMENTS} wardrobe units, and return an empty array only when the image genuinely contains no wearable item at all.`;
}

export function lookDetectionModelCandidates(inputModel?:string,environment:{AI_LOOK_DETECTION_MODEL?:string;AI_MODEL?:string}={AI_LOOK_DETECTION_MODEL:process.env.AI_LOOK_DETECTION_MODEL,AI_MODEL:process.env.AI_MODEL}) {
  const primary=inputModel?.trim()||environment.AI_LOOK_DETECTION_MODEL?.trim()||DEFAULT_LOOK_DETECTION_MODEL;
  const fallback=environment.AI_MODEL?.trim()||FALLBACK_LOOK_DETECTION_MODEL;
  return [...new Set([primary,fallback].filter(Boolean))];
}

/**
 * A second model call is allowed only for an immediate model-selection/configuration
 * failure. A timeout or service failure must return to the route's honest manual-review
 * fallback instead of doubling mobile latency.
 */
export function mayTryLookDetectionFallback(error:unknown) {
  if(!(error instanceof Error))return false;
  const name=error.name.toLowerCase();
  const message=error.message.toLowerCase();
  if(name.includes("accessdenied")||name.includes("resourcenotfound"))return true;
  return name.includes("validation")&&/(model|inference|profile|throughput)/.test(message);
}

interface LookDetectionDependencies {
  invoke?: (modelId:string,request:ConverseCommandInput)=>Promise<{output?:{message?:{content?:Array<{text?:string}>}}}>;
}

export async function detectGarmentsInLook(input:{base64:string;contentType:"image/jpeg"|"image/png"|"image/webp";model?:string;region?:string;image?:{width:number;height:number}},dependencies:LookDetectionDependencies={}) {
  const client=new BedrockRuntimeClient({region:input.region??process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
  const prompt=buildLookDetectionPrompt();
  const models=lookDetectionModelCandidates(input.model);
  let finalError:unknown;
  for(const [index,modelId] of models.entries()) {
    const request:ConverseCommandInput={
      modelId,
      system:[{text:"You are a clothing-instance detector. Return structured visible evidence only. Never infer personal traits or claim product verification."}],
      messages:[{role:"user",content:[
        {image:{format:input.contentType.split("/")[1] as "jpeg"|"png"|"webp",source:{bytes:Buffer.from(input.base64,"base64")}}},
        {text:prompt},
      ]}] as ConverseCommandInput["messages"],
      inferenceConfig:{maxTokens:3600,temperature:0},
    };
    try {
      const response=dependencies.invoke
        ? await dependencies.invoke(modelId,request)
        : await client.send(new ConverseCommand(request),bedrockRequestOptions(BEDROCK_VISION_TIMEOUT_MS));
      const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
      if(!raw)throw new Error("The image model returned no garment detections.");
      return parseLookGarmentDetections(parseModelJson(raw),input.image);
    } catch(error) {
      finalError=error;
      const hasFallback=index<models.length-1;
      if(!hasFallback||!mayTryLookDetectionFallback(error))throw error;
      console.warn("Primary whole-look model unavailable; trying configured fallback",{modelId,name:error instanceof Error?error.name:"UnknownError"});
    }
  }
  throw finalError instanceof Error?finalError:new Error("The image model returned no garment detections.");
}
