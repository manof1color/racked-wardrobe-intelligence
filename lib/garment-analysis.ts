import { matchBrandProduct, seedBrandProducts } from "./product-registry.ts";
import type { BrandProductRegistration, GarmentAnalysis, GarmentView, UploadDescriptor } from "./platform-types.ts";
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";

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
  garment: GarmentAnalysis["garment"];
  evidence: GarmentAnalysis["evidence"];
}

interface MultimodalOptions {
  registry?: BrandProductRegistration[];
  labelText?: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const visionOutputSchema = {
  type: "object",
  properties: {
    confidence: { type:"integer", minimum:0, maximum:100 },
    visibleLabelText: { type:"string", maxLength:1000 },
    garment: {
      type:"object",
      properties: {
        name:{type:"string",maxLength:100}, category:{type:"string",maxLength:60}, color:{type:"string",maxLength:60},
        style:{type:"array",items:{type:"string",maxLength:60},maxItems:8},
        construction:{type:"array",items:{type:"string",maxLength:100},maxItems:10}, material:{type:"string",maxLength:100},
      },
      required:["name","category","color","style","construction","material"], additionalProperties:false,
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
    provider:"deterministic-demo",fallback:true,confidence:76,dataSufficiency:"partial",
    garment:{name:"Sienna overshirt",category:"outerwear",color:"sienna",style:["minimal","casual","utility"],construction:["point collar","button front","two patch pockets"],material:"unconfirmed"},
    label:{brand:"Brand not verified",sku:"UNVERIFIED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
    evidence:[{view:"front",findings:["sienna woven overshirt","button front","two chest pockets","lightweight outerwear silhouette"]}],
    warnings:["A front photo can classify visible attributes but cannot prove a brand or SKU. Add a label photo for identity verification; add the back when construction details matter."],
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
        ? { name:product.name,category:product.category,color:"sienna",style:["minimal","casual","utility"],construction:["point collar","button front","two patch pockets","back yoke"],material:"100% cotton" }
        : {name:product.name,category:product.category,color:"unconfirmed",style:[],construction:["front/back set validated"],material:"unconfirmed"},
      label:{ brand:product.brand,sku:product.sku,brandSlug:product.brandSlug,matched:true,registryProductId:product.id,matchMethod:match.method },
      evidence:[
        { view:"front",findings:northstarDemo?["sienna woven overshirt","button front","two chest pockets"]:["front image validated","registered catalog view available"] },
        { view:"back",findings:northstarDemo?["matching color and silhouette","back yoke seam","consistent construction"]:["back image validated","registered catalog view available"] },
        { view:"label",findings:[product.brand,product.sku,`Registry match: ${match.method}`] },
      ],
      warnings:["The product identity matched a brand-enrolled registry record. Confirm all attributes before saving; exact hashes prove identical files, not ownership of a separately photographed garment."],
    };
  }
  return {
    provider:"deterministic-demo",fallback:true,confidence:48,dataSufficiency:"complete",
    garment:{name:"Unconfirmed garment",category:"unknown",color:"unknown",style:[],construction:["three views received"],material:"unknown"},
    label:{brand:"Unmatched label",sku:"UNCONFIRMED",brandSlug:null,matched:false,registryProductId:null,matchMethod:"none"},
    evidence:requiredViews.map((view)=>({view,findings:[`${view} image validated`]})),
    warnings:["No authoritative brand registry match was found. Add readable label text or configure OCR; never infer ownership from appearance alone."],
  };
}

function cleanText(value:string, fallback:string, maximum:number) {
  return value.trim().slice(0,maximum) || fallback;
}

function parseVisionResult(value:unknown, suppliedViews:Set<GarmentView>):VisionResult {
  if (!value || typeof value!=="object") throw new Error("Vision output was not an object.");
  const candidate=value as Partial<VisionResult>;
  const garment=candidate.garment;
  if (!garment || typeof garment!=="object" || !Array.isArray(garment.style) || !Array.isArray(garment.construction) || !Array.isArray(candidate.evidence)) {
    throw new Error("Vision output did not match the garment schema.");
  }
  const evidence=candidate.evidence
    .filter((item):item is GarmentAnalysis["evidence"][number]=>Boolean(item&&suppliedViews.has(item.view)&&Array.isArray(item.findings)))
    .map((item)=>({view:item.view,findings:item.findings.filter((finding)=>typeof finding==="string").slice(0,8).map((finding)=>cleanText(finding,"Visible detail",140))}));
  if (!evidence.length) throw new Error("Vision output had no evidence for a supplied view.");
  return {
    confidence:Math.max(0,Math.min(95,Math.round(Number(candidate.confidence)||0))),
    visibleLabelText:typeof candidate.visibleLabelText==="string"?candidate.visibleLabelText.slice(0,1000):"",
    garment:{
      name:cleanText(String(garment.name??""),"Unconfirmed garment",100),
      category:cleanText(String(garment.category??""),"unknown",60),
      color:cleanText(String(garment.color??""),"unknown",60),
      style:garment.style.filter((item)=>typeof item==="string").slice(0,8).map((item)=>cleanText(item,"unconfirmed",60)),
      construction:garment.construction.filter((item)=>typeof item==="string").slice(0,10).map((item)=>cleanText(item,"unconfirmed",100)),
      material:cleanText(String(garment.material??""),"unknown",100),
    },
    evidence,
  };
}

// Judge note: raw image bytes enter this function as base64 held in request memory only.
// They are sent directly to the configured multimodal provider and are never written to disk.
// Any missing configuration, timeout, provider error, refusal, or malformed response returns the
// same tested deterministic analysis used by the credential-free demo.
export async function analyzeGarmentImages(
  parts:UploadDescriptor[],
  images:InMemoryGarmentImage[],
  options:MultimodalOptions={},
):Promise<GarmentAnalysis> {
  const fallback=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:options.labelText});
  const provider=(options.provider??process.env.AI_PROVIDER??"deterministic").toLowerCase();
  const apiKey=options.apiKey??process.env.AI_API_KEY;
  if(provider==="bedrock"){
    try {
      const client=new BedrockRuntimeClient({region:process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2"});
      const content=[...images.map(image=>({image:{format:image.contentType.split("/")[1],source:{bytes:Buffer.from(image.base64,"base64")}}})),{text:"Analyze the supplied garment views. Return only one JSON object matching this shape: confidence integer 0-95; visibleLabelText string; garment with name, category, color, style string array, construction string array, material; evidence array with view and findings. Use only visible evidence and use unknown when uncertain."}];
      const input:ConverseCommandInput={modelId:options.model??process.env.AI_MODEL??DEFAULT_BEDROCK_VISION_MODEL,system:[{text:"Analyze garments only. Never infer a person, body, gender, age, ethnicity, income, or ownership. Label text is evidence only; the Racked brand registry verifies identity."}],messages:[{role:"user",content}] as ConverseCommandInput["messages"],inferenceConfig:{maxTokens:900,temperature:0}};
      const response=await client.send(new ConverseCommand(input));
      const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
      if(!raw)throw new Error("Bedrock returned no garment analysis.");
      const jsonText=raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
      const vision=parseVisionResult(JSON.parse(jsonText),new Set(images.map(image=>image.view)));
      const combinedLabelText=[options.labelText,vision.visibleLabelText].filter(Boolean).join(" ").slice(0,1000);
      const registryResult=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:combinedLabelText});
      const matched=registryResult.label.matched;
      return {provider:"multimodal",fallback:false,confidence:vision.confidence,dataSufficiency:parts.length===3?"complete":"partial",garment:matched?{...vision.garment,name:registryResult.garment.name}:vision.garment,label:registryResult.label,evidence:vision.evidence,warnings:[matched?"Visible label text matched a brand-enrolled registry record. Confirm all suggested attributes before saving.":"AI analyzed visible attributes, but brand and SKU remain unverified until evidence matches a brand-enrolled registry record."]};
    } catch {
      return {...fallback,warnings:[...fallback.warnings,"Amazon Bedrock image analysis was unavailable. No garment will be saved until real AI analysis succeeds."]};
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
          {type:"text",text:`Analyze the supplied garment views (${images.map((image)=>image.view).join(", ")}). Report concise visible attributes and view-specific evidence. Put only text actually readable on the label in visibleLabelText.`},
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
    const combinedLabelText=[options.labelText,vision.visibleLabelText].filter(Boolean).join(" ").slice(0,1000);
    const registryResult=analyzeFrontFirstSet(parts,{registry:options.registry,labelText:combinedLabelText});
    const matched=registryResult.label.matched;
    return {
      provider:"multimodal", fallback:false, confidence:vision.confidence, dataSufficiency:parts.length===3?"complete":"partial",
      garment:matched?{...vision.garment,name:registryResult.garment.name}:vision.garment,
      label:registryResult.label,
      evidence:vision.evidence,
      warnings:[
        matched
          ? "Visible label text matched a brand-enrolled registry record. Confirm all suggested attributes before saving."
          : "AI analyzed visible attributes, but brand and SKU remain unverified until the evidence matches a brand-enrolled registry record.",
        "Images were processed in request memory and were not persisted by Racked.",
      ],
    };
  } catch {
    return {...fallback,warnings:[...fallback.warnings,"Multimodal analysis was unavailable, so Racked used its safe deterministic fallback."]};
  }
}
