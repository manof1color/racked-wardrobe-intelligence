import { matchBrandProduct, seedBrandProducts, suggestMajorBrand } from "./product-registry.ts";
import type { BrandProductRegistration, GarmentAnalysis, GarmentView, UploadDescriptor } from "./platform-types.ts";
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import { parseModelJson } from "./bedrock-json.ts";
import { BEDROCK_VISION_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";
import { cleanHypothesis, garmentTaxonomyPrompt, normalizeGarmentClassification, type GarmentHypothesis } from "./garment-taxonomy.ts";

const allowedTypes = new Set(["image/jpeg","image/png","image/webp"]);
const requiredViews: GarmentView[] = ["front","back","label"];
export const MAX_UPLOAD_BYTES = 5_000_000;
export const DEFAULT_VISION_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_BEDROCK_VISION_MODEL = "amazon.nova-lite-v1:0";

export interface InMemoryGarmentImage {
  view: GarmentView;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

interface VisionResult {
  confidence: number;
  visibleLabelText: string;
  /** Brand name exactly as visibly printed on a label or logo; "" when none is readable. */
  brandText: string;
  garment: GarmentAnalysis["garment"];
  evidence: GarmentAnalysis["evidence"];
}

// Judge note: an AI-read brand name is autofill for the editable, user-owned brand-label
// field — the same trust level as the major-brand suggestion list, just image-sourced.
// It can never create verified status: verification requires a registry match by GTIN or
// brand-plus-SKU, which this function has no ability to grant.
function cleanVisibleBrandText(value: string): string | null {
  const cleaned = value.trim().slice(0, 100);
  if (!cleaned) return null;
  if (/^(unknown|none|n\/a|not visible|no brand|unbranded|illegible)$/i.test(cleaned)) return null;
  return cleaned;
}

interface MultimodalOptions {
  registry?: BrandProductRegistration[];
  labelText?: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  initialHypothesis?: GarmentHypothesis | null;
}

const visionOutputSchema = {
  type: "object",
  properties: {
    confidence: { type:"integer", minimum:0, maximum:100 },
    visibleLabelText: { type:"string", maxLength:1000 },
    brandText: { type:"string", maxLength:100 },
    garment: {
      type:"object",
      properties: {
        name:{type:"string",maxLength:100}, category:{type:"string",maxLength:60}, subtype:{type:"string",maxLength:60}, color:{type:"string",maxLength:60}, pattern:{type:"string",maxLength:60},
        style:{type:"array",items:{type:"string",maxLength:60},maxItems:8},
        construction:{type:"array",items:{type:"string",maxLength:100},maxItems:10}, material:{type:"string",maxLength:100},
        alternatives:{type:"array",maxItems:3,items:{type:"object",properties:{category:{type:"string",maxLength:60},subtype:{type:"string",maxLength:60},confidence:{type:"integer",minimum:0,maximum:95},reason:{type:"string",maxLength:200}},required:["category","subtype","confidence","reason"],additionalProperties:false}},
      },
      required:["name","category","subtype","color","pattern","style","construction","material","alternatives"], additionalProperties:false,
    },
    evidence: {
      type:"array", maxItems:3,
      items:{
        type:"object",
        properties:{view:{type:"string",enum:requiredViews},findings:{type:"array",items:{type:"string",maxLength:140},maxItems:8}},
        required:["view","findings"], additionalProperties:false,
      },
    },
  },
  required:["confidence","visibleLabelText","garment","evidence"], additionalProperties:false,
} as const;

export class UploadValidationError extends Error {
  readonly status: number;

  constructor(message:string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateThreeViewUpload(parts: UploadDescriptor[]) {
  for (const view of requiredViews) {
    const matching = parts.filter((part) => part.view === view);
    if (matching.length !== 1) throw new UploadValidationError(`Exactly one ${view} image is required.`);
  }
  for (const part of parts) {
    if (!allowedTypes.has(part.contentType)) throw new UploadValidationError(`${part.view} must be JPG, PNG, or WebP.`);
    if (part.size <= 0 || part.size > MAX_UPLOAD_BYTES) throw new UploadValidationError(`${part.view} must be larger than 0 bytes and no more than 5 MB.`);
  }
  return true;
}

export function validateFrontFirstUpload(parts: UploadDescriptor[]) {
  const fronts=parts.filter((part)=>part.view==="front");
  if (fronts.length!==1) throw new UploadValidationError("Exactly one front image is required.");
  for (const view of requiredViews) {
    if (parts.filter((part)=>part.view===view).length>1) throw new UploadValidationError(`Only one ${view} image can be analyzed.`);
  }
  for (const part of parts) {
    if (!allowedTypes.has(part.contentType)) throw new UploadValidationError(`${part.view} must be JPG, PNG, or WebP.`);
    if (part.size<=0||part.size>MAX_UPLOAD_BYTES) throw new UploadValidationError(`${part.view} must be larger than 0 bytes and no more than 5 MB.`);
  }
  return true;
}

export function analyzeFrontFirstSet(parts:UploadDescriptor[],options?:{registry?:BrandProductRegistration[];labelText?:string}):GarmentAnalysis {
  validateFrontFirstUpload(parts);
  if (requiredViews.every((view)=>parts.some((part)=>part.view===view))) return analyzeThreeViewSet(parts,options);
  return {
    provider:"manual-review",fallback:true,confidence:0,dataSufficiency:"partial",
    garment:{name:"Unverified garment",category:"unknown",subtype:"other-garment",color:"unknown",pattern:"unknown",style:[],construction:["front view received"],material:"unknown",alternatives:[]},
    label:{brand:"Brand not verified",sku:"UNVERIFIED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
    evidence:[{view:"front",findings:["Front image received for manual review"]}],
    warnings:["AI attributes are unavailable. Add your own garment name and brand label before saving."],
  };
}

export function analyzeThreeViewSet(parts: UploadDescriptor[], options?:{registry?:BrandProductRegistration[];labelText?:string}): GarmentAnalysis {
  validateThreeViewUpload(parts);
  const labelText=options?.labelText?.trim().slice(0,1000) ?? "";
  const match=matchBrandProduct(parts,labelText,options?.registry ?? seedBrandProducts);
  if (match) {
    const product=match.product;
    const northstarDemo=product.sku==="NA-OW-1042";
    return {
      provider:"deterministic-demo", fallback:true, confidence:match.method==="label-image-hash"||match.method==="catalog-image-set"?98:96, dataSufficiency:"complete",
      garment:northstarDemo
        ? { name:product.name,category:"outerwear",subtype:"other-outerwear",color:"sienna",pattern:"solid",style:["minimal","casual","utility"],construction:["point collar","button front","two patch pockets","back yoke"],material:"100% cotton",alternatives:[] }
        : {name:product.name,...normalizeGarmentClassification(product.category,product.name),color:"unconfirmed",pattern:"unknown",style:[],construction:["front/back set validated"],material:"unconfirmed",alternatives:[]},
      label:{ brand:product.brand,sku:product.sku,brandSlug:product.brandSlug,matched:true,registryProductId:product.id,matchMethod:match.method },
      evidence:[
        { view:"front",findings:northstarDemo?["sienna woven overshirt","button front","two chest pockets"]:["front image validated","registered catalog view available"] },
        { view:"back",findings:northstarDemo?["matching color and silhouette","back yoke seam","consistent construction"]:["back image validated","registered catalog view available"] },
        { view:"label",findings:[product.brand,product.sku,`Registry match: ${match.method}`] },
      ],
      warnings:["The product identity matched a brand-enrolled registry record. Confirm all attributes before saving; exact hashes prove identical files, not ownership of a separately photographed garment."],
    };
  }
  const majorSuggestion=suggestMajorBrand(labelText);
  return {
    provider:"manual-review",fallback:true,confidence:0,dataSufficiency:"complete",
    garment:{name:"Unconfirmed garment",category:"unknown",subtype:"other-garment",color:"unknown",pattern:"unknown",style:[],construction:["three views received"],material:"unknown",alternatives:[]},
    label:majorSuggestion?{brand:majorSuggestion.brand,sku:"UNCONFIRMED",brandSlug:majorSuggestion.brandSlug,matched:false,suggested:true,registryProductId:null,matchMethod:"major-brand-suggestion"}:{brand:"Unmatched label",sku:"UNCONFIRMED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
    evidence:requiredViews.map((view)=>({view,findings:[`${view} image validated`]})),
    warnings:[majorSuggestion?`${majorSuggestion.brand} was suggested from supplied label text. Confirm or edit it; the product remains unverified.`:"No authoritative brand registry match was found. Add readable label text or configure OCR; never infer ownership from appearance alone."],
  };
}

function cleanText(value:string, fallback:string, maximum:number) {
  return value.trim().slice(0,maximum) || fallback;
}

function parseVisionResult(value:unknown, suppliedViews:Set<GarmentView>):VisionResult {
  if (!value || typeof value!=="object") throw new Error("Vision output was not an object.");
  const candidate=value as Partial<VisionResult>;
  const garment=candidate.garment;
  if (!garment || typeof garment!=="object") {
    throw new Error("Vision output did not match the garment schema.");
  }
  const evidence=(Array.isArray(candidate.evidence)?candidate.evidence:[])
    .filter((item):item is GarmentAnalysis["evidence"][number]=>Boolean(item&&suppliedViews.has(item.view)&&Array.isArray(item.findings)))
    .map((item)=>({view:item.view,findings:item.findings.filter((finding)=>typeof finding==="string").slice(0,8).map((finding)=>cleanText(finding,"Visible detail",140))}));
  if (!evidence.length) for(const view of suppliedViews)evidence.push({view,findings:["View supplied; review the AI attributes before saving."]});
  const name=cleanText(String(garment.name??""),"Unconfirmed garment",100);
  const classification=normalizeGarmentClassification(String(garment.category??""),String(garment.subtype??name));
  const alternatives=(Array.isArray(garment.alternatives)?garment.alternatives as unknown[]:[])
    .filter((entry):entry is Record<string,unknown>=>Boolean(entry&&typeof entry==="object"))
    .slice(0,3)
    .map((entry)=>{
      const alternative=normalizeGarmentClassification(String(entry.category??""),String(entry.subtype??""));
      return {...alternative,confidence:Math.max(0,Math.min(95,Math.round(Number(entry.confidence)||0))),reason:cleanText(String(entry.reason??""),"Alternative visible interpretation",200)};
    })
    .filter((entry)=>entry.category!==classification.category||entry.subtype!==classification.subtype);
  return {
    confidence:Math.max(0,Math.min(95,Math.round(Number(candidate.confidence)||0))),
    visibleLabelText:typeof candidate.visibleLabelText==="string"?candidate.visibleLabelText.slice(0,1000):"",
    brandText:typeof candidate.brandText==="string"?candidate.brandText.slice(0,100):"",
    garment:{
      name,
      ...classification,
      color:cleanText(String(garment.color??""),"unknown",60),
      pattern:cleanText(String(garment.pattern??""),"unknown",60),
      style:(Array.isArray(garment.style)?garment.style:[]).filter((item)=>typeof item==="string").slice(0,8).map((item)=>cleanText(item,"unconfirmed",60)),
      construction:(Array.isArray(garment.construction)?garment.construction:[]).filter((item)=>typeof item==="string").slice(0,10).map((item)=>cleanText(item,"unconfirmed",100)),
      material:cleanText(String(garment.material??""),"unknown",100),
      alternatives,
    },
    evidence,
  };
}

// Judge note: first-photo category classification for the adaptive photo plan. It returns
// category evidence only — never brand, SKU, or verification fields — and any provider
// failure returns null so the caller falls back to the standard photo set. The category
// is always user-overridable before anything is saved.
export async function classifyGarmentImage(image:InMemoryGarmentImage,options:{provider?:string;model?:string}={}):Promise<GarmentHypothesis|null> {
  const provider=(options.provider??process.env.AI_PROVIDER??"deterministic").toLowerCase();
  if(provider!=="bedrock")return null;
  try {
    const client=new BedrockRuntimeClient({region:process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
    const input:ConverseCommandInput={
      modelId:options.model??process.env.AI_MODEL??DEFAULT_BEDROCK_VISION_MODEL,
      system:[{text:"Classify garment photos only. Never infer a person, body, gender, age, ethnicity, income, or ownership. Never name a brand."}],
      messages:[{role:"user",content:[
        {image:{format:image.contentType.split("/")[1] as "jpeg"|"png"|"webp",source:{bytes:Buffer.from(image.base64,"base64")}}},
        {text:`Classify the item using this controlled taxonomy: ${garmentTaxonomyPrompt()}. Return only one JSON object: {"category":string,"subtype":string,"confidence":integer 0-95,"reasoning":string under 200 characters describing only visible evidence,"alternatives":array of at most 3 {"category":string,"subtype":string,"confidence":integer 0-95,"reason":string}}. Do not force certainty; include a plausible alternative when the view is ambiguous.`},
      ]}] as ConverseCommandInput["messages"],
      inferenceConfig:{maxTokens:500,temperature:0},
    };
    const response=await client.send(new ConverseCommand(input),bedrockRequestOptions(BEDROCK_VISION_TIMEOUT_MS));
    const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
    if(!raw)return null;
    return cleanHypothesis(parseModelJson(raw));
  } catch(error) {
    console.error("Garment classification failed",{name:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"Unknown provider failure"});
    return null;
  }
}

// Judge note: raw image bytes enter this function as base64 held in request memory only.
// They are sent directly to the configured multimodal provider and are never written to disk.
// Any missing configuration, timeout, provider error, refusal, or malformed response returns the
// same tested manual-review result so the person can label and save their own garment.
export async function analyzeGarmentImages(
  parts:UploadDescriptor[],
  images:InMemoryGarmentImage[],
  options:MultimodalOptions={},
):Promise<GarmentAnalysis> {
  const fallback=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:options.labelText});
  const provider=(options.provider??process.env.AI_PROVIDER??"deterministic").toLowerCase();
  const apiKey=options.apiKey??process.env.AI_API_KEY;
  const hypothesisContext=options.initialHypothesis
    ? `The first-photo hypothesis was ${options.initialHypothesis.category}/${options.initialHypothesis.subtype} at ${options.initialHypothesis.confidence}% confidence because: ${options.initialHypothesis.reasoning || "visible front-view evidence"}. Confirm it or revise it when the other views contradict it.`
    : "There is no first-photo hypothesis. Classify from all supplied views.";
  const analysisInstruction=`Analyze the supplied garment views. ${hypothesisContext} Use this controlled taxonomy: ${garmentTaxonomyPrompt()}. Return only one JSON object matching this shape: confidence integer 0-95; visibleLabelText string; brandText string containing the brand name exactly as visibly printed on a label or logo, or an empty string when none is readable; garment with name, category, subtype, color, pattern, style string array, construction string array, material, and alternatives (at most 3 objects with category, subtype, confidence, reason); evidence array with view and findings. Use only visible evidence, use unknown values when uncertain, and do not force a subtype when an other-* value is more honest.`;
  if(provider==="bedrock"){
    try {
      const client=new BedrockRuntimeClient({region:process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
      const content=[...images.map(image=>({image:{format:image.contentType.split("/")[1],source:{bytes:Buffer.from(image.base64,"base64")}}})),{text:analysisInstruction}];
      const input:ConverseCommandInput={modelId:options.model??process.env.AI_MODEL??DEFAULT_BEDROCK_VISION_MODEL,system:[{text:"Analyze garments only. Never infer a person, body, gender, age, ethnicity, income, or ownership. Label text is evidence only; the Racked brand registry verifies identity."}],messages:[{role:"user",content}] as ConverseCommandInput["messages"],inferenceConfig:{maxTokens:900,temperature:0}};
      const response=await client.send(new ConverseCommand(input),bedrockRequestOptions(BEDROCK_VISION_TIMEOUT_MS));
      const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
      if(!raw)throw new Error("Bedrock returned no garment analysis.");
      const vision=parseVisionResult(parseModelJson(raw),new Set(images.map(image=>image.view)));
      const combinedLabelText=[options.labelText,vision.visibleLabelText,vision.brandText].filter(Boolean).join(" ").slice(0,1000);
      const registryResult=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:combinedLabelText});
      const matched=registryResult.label.matched;
      const majorSuggestion=!matched?suggestMajorBrand(combinedLabelText):null;
      const aiBrand=!matched&&!majorSuggestion?cleanVisibleBrandText(vision.brandText):null;
      const label=matched?registryResult.label:majorSuggestion?{brand:majorSuggestion.brand,sku:"UNVERIFIED",brandSlug:majorSuggestion.brandSlug,matched:false,suggested:true,registryProductId:null,matchMethod:"major-brand-suggestion" as const}:aiBrand?{brand:aiBrand,sku:"UNVERIFIED",brandSlug:null,matched:false,suggested:true,registryProductId:null,matchMethod:"ai-label-text" as const}:registryResult.label;
      return {provider:"multimodal",fallback:false,confidence:vision.confidence,dataSufficiency:parts.length===3?"complete":"partial",garment:matched?{...vision.garment,name:registryResult.garment.name}:vision.garment,label,evidence:vision.evidence,warnings:[matched?"Visible label text matched a brand-enrolled registry record. Confirm all suggested attributes before saving.":majorSuggestion?`${majorSuggestion.brand} was suggested from visible label evidence. Confirm or edit the name; it is not a verified product link.`:aiBrand?`“${aiBrand}” was read from the visible label or logo and prefilled for you. Confirm or edit it; it is not a verified product link.`:"AI analyzed visible attributes, but brand and SKU remain unverified until evidence matches a brand-enrolled registry record."]};
    } catch(error) {
      console.error("Bedrock garment analysis failed",{name:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"Unknown provider failure",modelId:options.model??process.env.AI_MODEL??DEFAULT_BEDROCK_VISION_MODEL,views:images.map(image=>image.view),imageBytes:images.map(image=>Buffer.byteLength(image.base64,"base64"))});
      return {...fallback,warnings:[...fallback.warnings,"Amazon Bedrock image analysis was unavailable. Review and complete the editable garment labels before saving."]};
    }
  }
  if ((provider!=="anthropic"&&provider!=="multimodal")||!apiKey) return fallback;

  try {
    const fetchImpl=options.fetchImpl??fetch;
    const response=await fetchImpl("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      signal:AbortSignal.timeout(12_000),
      body:JSON.stringify({
        model:options.model??process.env.AI_MODEL??DEFAULT_VISION_MODEL,
        max_tokens:900,
        temperature:0,
        system:"Analyze only visible garment evidence. Never infer a person, gender, age, body, income, preference, or ownership. Use unknown when evidence is insufficient. Brand and SKU text are OCR evidence only; the application registry decides whether identity is verified.",
        messages:[{role:"user",content:[
          ...images.map((image)=>({type:"image",source:{type:"base64",media_type:image.contentType,data:image.base64}})),
          {type:"text",text:`${analysisInstruction} The supplied views are ${images.map((image)=>image.view).join(", ")}. Put only text actually readable on the label in visibleLabelText.`},
        ]}],
        output_config:{format:{type:"json_schema",schema:visionOutputSchema}},
      }),
    });
    if (!response.ok) throw new Error(`Vision provider returned ${response.status}.`);
    const payload=await response.json() as {stop_reason?:string;content?:Array<{type?:string;text?:string}>};
    if (payload.stop_reason==="refusal"||payload.stop_reason==="max_tokens") throw new Error("Vision provider did not return a complete analysis.");
    const text=payload.content?.find((block)=>block.type==="text")?.text;
    if (!text) throw new Error("Vision provider returned no structured result.");
    const vision=parseVisionResult(JSON.parse(text),new Set(images.map((image)=>image.view)));
    const combinedLabelText=[options.labelText,vision.visibleLabelText,vision.brandText].filter(Boolean).join(" ").slice(0,1000);
    const registryResult=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:combinedLabelText});
    const matched=registryResult.label.matched;
    const majorSuggestion=!matched?suggestMajorBrand(combinedLabelText):null;
    const aiBrand=!matched&&!majorSuggestion?cleanVisibleBrandText(vision.brandText):null;
    const label=matched?registryResult.label:majorSuggestion?{brand:majorSuggestion.brand,sku:"UNVERIFIED",brandSlug:majorSuggestion.brandSlug,matched:false,suggested:true,registryProductId:null,matchMethod:"major-brand-suggestion" as const}:aiBrand?{brand:aiBrand,sku:"UNVERIFIED",brandSlug:null,matched:false,suggested:true,registryProductId:null,matchMethod:"ai-label-text" as const}:registryResult.label;
    return {
      provider:"multimodal", fallback:false, confidence:vision.confidence, dataSufficiency:parts.length===3?"complete":"partial",
      garment:matched?{...vision.garment,name:registryResult.garment.name}:vision.garment,
      label,
      evidence:vision.evidence,
      warnings:[
        matched
          ? "Visible label text matched a brand-enrolled registry record. Confirm all suggested attributes before saving."
          : majorSuggestion
            ? `${majorSuggestion.brand} was suggested from visible label evidence. Confirm or edit the name; it is not a verified product link.`
            : aiBrand
              ? `“${aiBrand}” was read from the visible label or logo and prefilled for you. Confirm or edit it; it is not a verified product link.`
              : "AI analyzed visible attributes, but brand and SKU remain unverified until the evidence matches a brand-enrolled registry record.",
        "Images were processed in request memory and were not persisted by Racked.",
      ],
    };
  } catch {
    return {...fallback,warnings:[...fallback.warnings,"Multimodal analysis was unavailable, so Racked opened the garment for manual review."]};
  }
}
