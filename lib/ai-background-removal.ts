import { BedrockRuntimeClient, InvokeModelCommand, type InvokeModelCommandInput } from "@aws-sdk/client-bedrock-runtime";
import sharp from "sharp";
import { BEDROCK_IMAGE_TIMEOUT_MS, bedrockRequestOptions } from "./bedrock-timeout.ts";

export const DEFAULT_BACKGROUND_REMOVAL_MODEL="us.stability.stable-image-remove-background-v1:0";
const INPUT_SIZE=1024;
const MAX_OUTPUT_WIDTH=700;
const MAX_OUTPUT_HEIGHT=900;

interface BedrockInvoker {
  send(command:InvokeModelCommand,options?:{abortSignal?:AbortSignal}):Promise<{body?:Uint8Array}>;
}
interface BackgroundRemovalOptions {
  client?:BedrockInvoker;
  model?:string;
}

export interface AiBackgroundRemoval {
  buffer:Buffer;
  width:number;
  height:number;
  backgroundRemoved:true;
  removedPixelRatio:number;
  method:"ai-segmentation";
}

function transparentBounds(data:Buffer,width:number,height:number) {
  let left=width,top=height,right=-1,bottom=-1,transparent=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const alpha=data[((y*width+x)*4)+3];
    if(alpha<245)transparent++;
    if(alpha>12){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  return {left,top,right,bottom,transparentPixelRatio:transparent/(width*height)};
}

/**
 * Uses Bedrock only for foreground segmentation. It does not generate or restyle
 * the garment: the returned pixels come from the user's private crop. The US
 * inference profile keeps routing within the documented US geography.
 */
export async function removeGarmentBackground(input:Buffer,options:BackgroundRemovalOptions={}):Promise<AiBackgroundRemoval|null>{
  const prepared=await sharp(input)
    .rotate()
    .resize(INPUT_SIZE,INPUT_SIZE,{fit:"contain",background:{r:255,g:255,b:255,alpha:1},withoutEnlargement:true})
    .png()
    .toBuffer();
  const model=options.model??process.env.AI_BACKGROUND_REMOVAL_MODEL??DEFAULT_BACKGROUND_REMOVAL_MODEL;
  const request:InvokeModelCommandInput={
    modelId:model,
    contentType:"application/json",
    accept:"application/json",
    body:JSON.stringify({image:prepared.toString("base64"),output_format:"png"}),
  };
  const client=options.client??new BedrockRuntimeClient({region:process.env.AWS_REGION??"us-east-2"});
  try {
    const response=await client.send(new InvokeModelCommand(request),bedrockRequestOptions(BEDROCK_IMAGE_TIMEOUT_MS));
    if(!response.body)return null;
    const payload=JSON.parse(Buffer.from(response.body).toString("utf8")) as {images?:unknown[]};
    const encoded=typeof payload.images?.[0]==="string"?payload.images[0]:"";
    if(!encoded)return null;
    const decoded=Buffer.from(encoded,"base64");
    const metadata=await sharp(decoded).metadata();
    if(metadata.format!=="png"||!metadata.hasAlpha)return null;
    const raster=await sharp(decoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const bounds=transparentBounds(raster.data,raster.info.width,raster.info.height);
    if(bounds.right<bounds.left||bounds.bottom<bounds.top||bounds.transparentPixelRatio<0.01||bounds.transparentPixelRatio>0.98)return null;
    const width=bounds.right-bounds.left+1,height=bounds.bottom-bounds.top+1;
    const padding=Math.max(12,Math.round(Math.max(width,height)*0.045));
    const output=await sharp(decoded)
      .extract({left:bounds.left,top:bounds.top,width,height})
      .extend({top:padding,bottom:padding,left:padding,right:padding,background:{r:0,g:0,b:0,alpha:0}})
      .resize({width:MAX_OUTPUT_WIDTH,height:MAX_OUTPUT_HEIGHT,fit:"inside",withoutEnlargement:true})
      .png({compressionLevel:9})
      .toBuffer({resolveWithObject:true});
    return {
      buffer:output.data,
      width:output.info.width,
      height:output.info.height,
      backgroundRemoved:true,
      removedPixelRatio:Number(bounds.transparentPixelRatio.toFixed(4)),
      method:"ai-segmentation",
    };
  } catch(error) {
    console.error("Bedrock garment background removal failed",{
      name:error instanceof Error?error.name:"UnknownError",
      message:error instanceof Error?error.message:"Unknown provider failure",
      model,
      imageBytes:prepared.byteLength,
    });
    return null;
  }
}
