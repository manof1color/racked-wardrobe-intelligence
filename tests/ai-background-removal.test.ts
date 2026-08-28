import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DEFAULT_BACKGROUND_REMOVAL_MODEL, removeGarmentBackground } from "../lib/ai-background-removal.ts";

test("Bedrock background removal returns a trimmed transparent product cutout",async()=>{
  const resultImage=await sharp({create:{width:300,height:300,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await sharp({create:{width:100,height:180,channels:4,background:{r:40,g:50,b:60,alpha:1}}}).png().toBuffer(),left:100,top:60}])
    .png().toBuffer();
  let request:Record<string,unknown>|undefined;
  const client={send:async(command:InvokeModelCommand)=>{
    assert.equal(command.input.modelId,DEFAULT_BACKGROUND_REMOVAL_MODEL);
    assert.equal(typeof command.input.body,"string");
    request=JSON.parse(command.input.body as string) as Record<string,unknown>;
    return {body:Buffer.from(JSON.stringify({images:[resultImage.toString("base64")]}))};
  }};
  const input=await sharp({create:{width:500,height:300,channels:3,background:{r:250,g:250,b:250}}}).png().toBuffer();
  const result=await removeGarmentBackground(input,{client});
  assert.ok(result);
  assert.equal(result.method,"ai-segmentation");
  assert.equal(result.backgroundRemoved,true);
  assert.equal(request?.output_format,"png");
  assert.equal(typeof request?.image,"string");
  assert.ok(result.width<300,"transparent margins are trimmed before the item is stored");
  assert.ok(result.height<300,"transparent margins are trimmed before the item is stored");
  assert.equal((await sharp(result.buffer).metadata()).hasAlpha,true);
});

test("an opaque provider response is rejected instead of claiming background removal",async()=>{
  const opaque=await sharp({create:{width:200,height:200,channels:3,background:{r:220,g:220,b:220}}}).png().toBuffer();
  const client={send:async()=>({body:Buffer.from(JSON.stringify({images:[opaque.toString("base64")]}))})};
  const result=await removeGarmentBackground(opaque,{client});
  assert.equal(result,null);
});

test("provider failure returns null so the deterministic crop can remain available",async()=>{
  const input=await sharp({create:{width:100,height:100,channels:3,background:{r:255,g:255,b:255}}}).png().toBuffer();
  const client={send:async()=>{throw new Error("provider unavailable");}};
  assert.equal(await removeGarmentBackground(input,{client}),null);
});
