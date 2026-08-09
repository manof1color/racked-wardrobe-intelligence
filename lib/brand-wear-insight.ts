import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { parseModelJson } from "./bedrock-json.ts";

export interface BrandWearAggregate {
  productName: string;
  segmentSize: number;
  actualWears: number;
  activeOwners: number;
  repeatWearRate: number;
}

export interface BrandWearInsight {
  summary: string;
  recommendation: string;
  campaignTheme: string;
}

function clean(value:unknown,fallback:string,maximum=400) {
  return (typeof value==="string"?value.trim():"").slice(0,maximum)||fallback;
}

export function buildBrandWearPrompt(aggregate:BrandWearAggregate) {
  return `Analyze this privacy-thresholded aggregate product-wear record. Do not infer customer identities, demographics, bodies, preferences, or individual behavior. Do not invent numbers. Return only JSON with summary, recommendation, and campaignTheme strings. Aggregate: ${JSON.stringify(aggregate)}`;
}

export function parseBrandWearInsight(text:string):BrandWearInsight {
  const value=parseModelJson<Partial<BrandWearInsight>>(text);
  return {
    summary:clean(value.summary,"The aggregate wear record is available, but the AI summary was incomplete."),
    recommendation:clean(value.recommendation,"Use the confirmed aggregate wear rate as the campaign evidence."),
    campaignTheme:clean(value.campaignTheme,"Actual wear, clearly measured",120),
  };
}

export async function generateBrandWearInsight(aggregate:BrandWearAggregate):Promise<BrandWearInsight|null> {
  if((process.env.AI_PROVIDER??"").toLowerCase()!=="bedrock") return null;
  const region=process.env.AWS_REGION??process.env.AWS_DEFAULT_REGION??"us-east-2";
  const modelId=process.env.AI_BRAND_MODEL??process.env.AI_MODEL??"amazon.nova-lite-v1:0";
  try {
    const client=new BedrockRuntimeClient({region});
    const response=await client.send(new ConverseCommand({
      modelId,
      system:[{text:"You are Racked's brand wear analyst. Use only supplied anonymous aggregate values. Never claim causation, sales lift, identity, demographics, or individual customer behavior."}],
      messages:[{role:"user",content:[{text:buildBrandWearPrompt(aggregate)}]}],
      inferenceConfig:{maxTokens:420,temperature:0},
    }));
    const raw=response.output?.message?.content?.find(block=>"text" in block)?.text;
    if(!raw)throw new Error("Bedrock returned no brand wear analysis.");
    return parseBrandWearInsight(raw);
  } catch(error) {
    console.error("Bedrock brand wear analysis failed",{name:error instanceof Error?error.name:"UnknownError",message:error instanceof Error?error.message:"Unknown provider failure",region,modelId});
    return null;
  }
}
