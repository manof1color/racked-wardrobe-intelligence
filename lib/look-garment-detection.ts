import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { parseModelJson } from "./bedrock-json.ts";
import { garmentTaxonomyPrompt, normalizeGarmentClassification } from "./garment-taxonomy.ts";
import type { GarmentAnalysis } from "./platform-types.ts";
import { BEDROCK_VISION_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";

export const MAX_LOOK_GARMENTS = 16;
export const DEFAULT_LOOK_DETECTION_MODEL = "amazon.nova-lite-v1:0";

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedLookGarment {
  id: string;
  bounds: NormalizedBounds;
  analysis: GarmentAnalysis;
}

interface DetectionProviderResult {
  garments?: unknown[];
}

interface CleanDetection {
  bounds: NormalizedBounds;
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

function normalizedNumber(value:unknown) {
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.min(1,number)):0;
}

function cleanBounds(value:unknown):NormalizedBounds|null {
  if(!value||typeof value!=="object")return null;
  const candidate=value as Record<string,unknown>;
  const x=normalizedNumber(candidate.x);
  const y=normalizedNumber(candidate.y);
  const width=Math.min(normalizedNumber(candidate.width),1-x);
  const height=Math.min(normalizedNumber(candidate.height),1-y);
  if(width<0.04||height<0.04||width*height<0.004)return null;
  return {x,y,width,height};
}

function intersectionOverUnion(a:NormalizedBounds,b:NormalizedBounds) {
  const left=Math.max(a.x,b.x);
  const top=Math.max(a.y,b.y);
  const right=Math.min(a.x+a.width,b.x+b.width);
  const bottom=Math.min(a.y+a.height,b.y+b.height);
  const intersection=Math.max(0,right-left)*Math.max(0,bottom-top);
  const union=(a.width*a.height)+(b.width*b.height)-intersection;
  return union>0?intersection/union:0;
}

function unionBounds(a:NormalizedBounds,b:NormalizedBounds):NormalizedBounds {
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
export function parseLookGarmentDetections(value:unknown):DetectedLookGarment[] {
  const root=value&&typeof value==="object"?value as DetectionProviderResult:{};
  const raw=Array.isArray(root.garments)?root.garments:[];
  const cleaned:CleanDetection[]=[];
  for(const entry of raw.slice(0,MAX_LOOK_GARMENTS*4)) {
    if(!entry||typeof entry!=="object")continue;
    const candidate=entry as Record<string,unknown>;
    const bounds=cleanBounds(candidate.bounds);
    if(!bounds)continue;
    const classification=normalizeGarmentClassification(String(candidate.category??""),String(candidate.subtype??candidate.name??""));
    if(classification.category==="unknown")continue;
    const pairId=classification.category==="shoe"?cleanText(candidate.pairId,"",64)||null:null;
    cleaned.push({
      bounds,
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
  return `Inspect the ENTIRE image systematically from top to bottom and left to right. Detect every distinct visible clothing, footwear, bag, jewelry, and wearable accessory wardrobe unit, including partially obscured pieces when enough shape is visible to classify them. Do not identify or describe people, bodies, age, gender, ethnicity, or ownership. Ignore furniture, shelves, hangers, laundry baskets, containers, and background objects.

FOOTWEAR PAIR RULE: a matching left and right shoe together are ONE wardrobe unit, not two garments. Return one footwear object with wearableUnit "pair" and one tight bounds rectangle enclosing both shoes. Never return separate detections for the two shoes in a pair. Do not combine adjacent shoes with different designs, colors, construction, or visible branding. If you must emit the two sides separately because of overlap, give both exactly the same nonempty pairId so the server can combine them. If only one unmatched shoe is visibly present, use wearableUnit "single" and an empty pairId.

After the first pass, perform a coverage check of every row, shelf, image edge, and partially hidden region, adding any missed wearable units. Do not emit the same physical item or pair twice. Use this controlled taxonomy: ${garmentTaxonomyPrompt()}. Return only JSON with {"garments":[...]}. Each garment must contain: name, category, subtype, wearableUnit (single or pair), pairId (shared only by two sides of one footwear pair, otherwise empty), color, pattern, material, style (array), confidence (integer 0-95), visibleBrandText (only text genuinely visible, otherwise empty), visibleEvidence (array), and bounds {x,y,width,height} as 0-1 fractions of the full image. Bounds must tightly contain the complete garment or complete footwear pair. Return at most ${MAX_LOOK_GARMENTS} wardrobe units and use an empty array when no wearable item is clearly visible.`;
}

export async function detectGarmentsInLook(input:{base64:string;contentType:"image/jpeg"|"image/png"|"image/webp";model?:string;region?:string}) {
  const client=new BedrockRuntimeClient({region:input.region??process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
  const prompt=buildLookDetectionPrompt();
  const request:ConverseCommandInput={
    modelId:input.model??process.env.AI_MODEL??DEFAULT_LOOK_DETECTION_MODEL,
    system:[{text:"You are a clothing-instance detector. Return structured visible evidence only. Never infer personal traits or claim product verification."}],
    messages:[{role:"user",content:[
      {image:{format:input.contentType.split("/")[1] as "jpeg"|"png"|"webp",source:{bytes:Buffer.from(input.base64,"base64")}}},
      {text:prompt},
    ]}] as ConverseCommandInput["messages"],
    inferenceConfig:{maxTokens:3600,temperature:0},
  };
  const response=await client.send(new ConverseCommand(request),bedrockRequestOptions(BEDROCK_VISION_TIMEOUT_MS));
  const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
  if(!raw)throw new Error("The image model returned no garment detections.");
  return parseLookGarmentDetections(parseModelJson(raw));
}
