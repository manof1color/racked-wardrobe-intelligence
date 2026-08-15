import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { parseModelJson } from "./bedrock-json.ts";
import { garmentTaxonomyPrompt, normalizeGarmentClassification } from "./garment-taxonomy.ts";
import type { GarmentAnalysis } from "./platform-types.ts";

export const MAX_LOOK_GARMENTS = 8;
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
  const detections:DetectedLookGarment[]=[];
  for(const entry of raw) {
    if(!entry||typeof entry!=="object")continue;
    const candidate=entry as Record<string,unknown>;
    const bounds=cleanBounds(candidate.bounds);
    if(!bounds)continue;
    const classification=normalizeGarmentClassification(String(candidate.category??""),String(candidate.subtype??candidate.name??""));
    if(classification.category==="unknown")continue;
    if(detections.some(existing=>intersectionOverUnion(existing.bounds,bounds)>0.88))continue;
    const brand=visibleBrand(candidate.visibleBrandText);
    const confidence=Math.max(0,Math.min(95,Math.round(Number(candidate.confidence)||0)));
    const visibleEvidence=cleanStringArray(candidate.visibleEvidence,8,140);
    detections.push({
      id:crypto.randomUUID(),
      bounds,
      analysis:{
        provider:"multimodal",
        fallback:false,
        confidence,
        dataSufficiency:"partial",
        garment:{
          name:cleanText(candidate.name,classification.subtype,100),
          ...classification,
          color:cleanText(candidate.color,"unknown",60),
          pattern:cleanText(candidate.pattern,"unknown",60),
          style:cleanStringArray(candidate.style,8,60),
          construction:visibleEvidence,
          material:cleanText(candidate.material,"unknown",100),
          alternatives:[],
        },
        label:{
          brand:brand??"Brand not verified",
          sku:"UNVERIFIED",
          brandSlug:null,
          matched:false,
          suggested:Boolean(brand),
          registryProductId:null,
          matchMethod:brand?"ai-label-text":"none",
        },
        evidence:[{view:"front",findings:visibleEvidence.length?visibleEvidence:["Garment detected as a distinct visible piece"]}],
        warnings:[brand?`“${brand}” was read from visible image evidence. Confirm or edit it; it is not verified product identity.`:"No verified brand or SKU evidence was supplied. Add or edit your own label if known."],
      },
    });
    if(detections.length>=MAX_LOOK_GARMENTS)break;
  }
  return detections;
}

export async function detectGarmentsInLook(input:{base64:string;contentType:"image/jpeg"|"image/png"|"image/webp";model?:string;region?:string}) {
  const client=new BedrockRuntimeClient({region:input.region??process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
  const prompt=`Detect every distinct visible clothing, shoe, bag, jewelry, and wearable accessory item in this image. Do not identify or describe people, bodies, age, gender, ethnicity, or ownership. Ignore furniture, hangers, and background objects. Do not emit the same physical item twice. Use this controlled taxonomy: ${garmentTaxonomyPrompt()}. Return only JSON with {"garments":[...]}. Each garment must contain: name, category, subtype, color, pattern, material, style (array), confidence (integer 0-95), visibleBrandText (only text genuinely visible, otherwise empty), visibleEvidence (array), and bounds {x,y,width,height} as 0-1 fractions of the full image. Bounds must tightly contain only that piece. Return at most ${MAX_LOOK_GARMENTS} pieces and use an empty array when no wearable item is clearly visible.`;
  const request:ConverseCommandInput={
    modelId:input.model??process.env.AI_MODEL??DEFAULT_LOOK_DETECTION_MODEL,
    system:[{text:"You are a clothing-instance detector. Return structured visible evidence only. Never infer personal traits or claim product verification."}],
    messages:[{role:"user",content:[
      {image:{format:input.contentType.split("/")[1] as "jpeg"|"png"|"webp",source:{bytes:Buffer.from(input.base64,"base64")}}},
      {text:prompt},
    ]}] as ConverseCommandInput["messages"],
    inferenceConfig:{maxTokens:1800,temperature:0},
  };
  const response=await client.send(new ConverseCommand(request));
  const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
  if(!raw)throw new Error("The image model returned no garment detections.");
  return parseLookGarmentDetections(parseModelJson(raw));
}
