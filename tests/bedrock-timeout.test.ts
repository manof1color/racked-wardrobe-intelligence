import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  BEDROCK_CHAT_TIMEOUT_MS,
  BEDROCK_IMAGE_TIMEOUT_MS,
  BEDROCK_VISION_TIMEOUT_MS,
  bedrockRequestOptions,
} from "../lib/bedrock-timeout.ts";
import { removeGarmentBackground } from "../lib/ai-background-removal.ts";

test("a Bedrock request option carries an abort signal that fires on its own deadline",async()=>{
  const options=bedrockRequestOptions(40);
  assert.ok(options.abortSignal instanceof AbortSignal);
  assert.equal(options.abortSignal.aborted,false,"the signal must not be spent before the request starts");
  await new Promise((resolve)=>setTimeout(resolve,120));
  assert.equal(options.abortSignal.aborted,true,"a stalled provider must be abandoned rather than waited on");
});

test("every Bedrock timeout is bounded well inside a normal request budget",()=>{
  for(const timeout of [BEDROCK_CHAT_TIMEOUT_MS,BEDROCK_VISION_TIMEOUT_MS,BEDROCK_IMAGE_TIMEOUT_MS]){
    assert.ok(timeout>=5_000,"a timeout short enough to cut off healthy calls would cause false fallbacks");
    assert.ok(timeout<=25_000,"a timeout longer than this outlives the hosting request budget it exists to protect");
  }
});

test("background removal hands its abort signal to the provider call",async()=>{
  let received:unknown;
  const cutout=await sharp({create:{width:120,height:120,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:await sharp({create:{width:40,height:60,channels:4,background:{r:30,g:30,b:30,alpha:1}}}).png().toBuffer(),left:40,top:30}])
    .png().toBuffer();
  const client={send:async(...args:unknown[])=>{
    received=(args[1] as {abortSignal?:AbortSignal}|undefined)?.abortSignal;
    return {body:Buffer.from(JSON.stringify({images:[cutout.toString("base64")]}))};
  }};
  const input=await sharp({create:{width:200,height:200,channels:3,background:{r:250,g:250,b:250}}}).png().toBuffer();
  await removeGarmentBackground(input,{client:client as never});
  assert.ok(received instanceof AbortSignal,"the image call must be cancellable");
});

test("an aborted provider call falls back instead of surfacing a hang",async()=>{
  const client={send:async()=>{
    const error=new Error("Request aborted");
    error.name="TimeoutError";
    throw error;
  }};
  const input=await sharp({create:{width:100,height:100,channels:3,background:{r:255,g:255,b:255}}}).png().toBuffer();
  assert.equal(await removeGarmentBackground(input,{client:client as never}),null,"the deterministic cutout path stays available");
});

// Guards the reason this module exists: the AWS SDK applies no default request timeout,
// so a Bedrock call added without one can silently hold a Racked request open.
test("no Bedrock call site sends a command without a timeout",()=>{
  const callSites=[
    "lib/ai-background-removal.ts",
    "lib/brand-wear-insight.ts",
    "lib/garment-analysis.ts",
    "lib/hanger-conversation.ts",
    "lib/look-garment-detection.ts",
  ];
  let checked=0;
  for(const file of callSites){
    const source=readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
    const sends=source.match(/\.send\(\s*new (?:ConverseCommand|InvokeModelCommand)\([\s\S]*?\)\s*(?:,\s*bedrockRequestOptions\([A-Z_]+\))?\s*\)/g)??[];
    assert.ok(sends.length>0,`${file} should contain at least one Bedrock command`);
    for(const send of sends){
      assert.match(send,/bedrockRequestOptions\(/,`${file} sends a Bedrock command with no request timeout`);
      checked++;
    }
  }
  assert.equal(checked,6,"all six Bedrock call sites are covered");
});

// SES is the other AWS call awaited inside a request. Delivery is deliberately
// best-effort so password-reset responses stay enumeration-safe, but "best effort"
// still has to end.
test("the password reset email send is bounded as well",()=>{
  const source=readFileSync(new URL("../lib/server/password-reset-email.ts",import.meta.url),"utf8");
  assert.ok(source.includes("abortSignal:AbortSignal.timeout(SES_SEND_TIMEOUT_MS)"),"a stalled SES call would hold the reset request open");
  assert.match(source,/SES_SEND_TIMEOUT_MS=1?[0-9]_000;/,"the SES deadline must stay inside a normal request budget");
});
