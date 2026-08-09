import test from "node:test";
import assert from "node:assert/strict";
import { parseModelJson } from "../lib/bedrock-json.ts";
import { buildBrandWearPrompt, parseBrandWearInsight } from "../lib/brand-wear-insight.ts";

test("Bedrock JSON parsing tolerates fenced and prefaced model output",()=>{
  assert.deepEqual(parseModelJson<{ok:boolean}>("Result:\n```json\n{\"ok\":true}\n```"),{ok:true});
});

test("brand wear prompt contains only supplied aggregate evidence",()=>{
  const prompt=buildBrandWearPrompt({productName:"Field Jacket",segmentSize:31,actualWears:84,activeOwners:27,repeatWearRate:61});
  assert.match(prompt,/31/);assert.match(prompt,/84/);assert.match(prompt,/61/);
  const aggregate=JSON.parse(prompt.slice(prompt.indexOf("{"))) as Record<string,unknown>;
  assert.deepEqual(Object.keys(aggregate).sort(),["activeOwners","actualWears","productName","repeatWearRate","segmentSize"]);
});

test("brand wear insight parser bounds structured recommendations",()=>{
  const insight=parseBrandWearInsight('{"summary":"Strong repeat wear.","recommendation":"Show verified outfit pairings.","campaignTheme":"Worn often"}');
  assert.equal(insight.campaignTheme,"Worn often");
  assert.match(insight.recommendation,/verified outfit pairings/i);
});
