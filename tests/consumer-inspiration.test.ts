import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { consumerInspirationProfile, consumerInspirationRecord } from "../lib/consumer-inspiration.ts";
import { buildConsumerHangerPrompt } from "../lib/hanger-conversation.ts";
import { rankOutfit } from "../lib/outfit-ranking.ts";
import type { OutfitPost } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

function publicLook(id:string,title:string,style:string[],color:string):OutfitPost {
  return {id,handle:"@public_creator",outfitTitle:title,caption:"Public caption",image:"",createdAt:"2026-08-22T00:00:00Z",likes:4,sourceType:"consumer",products:[],garments:[{publicGarmentId:`garment-${id}`,name:"Public garment",category:"top",subtype:"t-shirt",color,style,image:"",resolutionState:"GENERIC_UNVERIFIED"}]};
}

function owned(id:string,name:string,style:string[]):WardrobeItem {
  return {id,name,category:"top",subtype:"t-shirt",color:"black",style,season:"all-season",wearCount:0,lastWornDays:30,source:"ai-confirmed",art:"photo"};
}

test("an inspired public Look becomes a bounded clothing-signal snapshot, not a creator profile",()=>{
  const record=consumerInspirationRecord(publicLook("look-1","Minimal layers",["minimal","structured"],"navy"),"2026-08-22T01:00:00Z");
  assert.deepEqual(Object.keys(record).sort(),["categories","colors","createdAt","outfitTitle","postId","styleHints","subtypes"]);
  assert.deepEqual(record.styleHints,["minimal","structured"]);
  assert.deepEqual(record.colors,["navy"]);
  assert.equal(JSON.stringify(record).includes("public_creator"),false);
  assert.equal(JSON.stringify(record).includes("Public caption"),false);
});

test("the private inspiration profile ranks repeated style signals deterministically",()=>{
  const records=[
    consumerInspirationRecord(publicLook("look-1","One",["minimal","classic"],"navy"),"2026-08-22T03:00:00Z"),
    consumerInspirationRecord(publicLook("look-2","Two",["minimal","relaxed"],"black"),"2026-08-22T02:00:00Z"),
  ];
  const profile=consumerInspirationProfile(records);
  assert.equal(profile.lookCount,2);
  assert.equal(profile.styleHints[0],"minimal");
  assert.deepEqual(profile.postIds,["look-1","look-2"]);
  assert.deepEqual(profile.recentLookTitles,["One","Two"]);
});

test("Hanger uses saved inspiration only as a fallback and never overrides the current request",()=>{
  const wardrobe=[owned("a-casual","Casual Tee",["casual"]),owned("z-minimal","Minimal Tee",["minimal"])];
  const inspired=rankOutfit(wardrobe,"Build me an outfit",{maxPieces:1,inspirationStyleHints:["minimal"]});
  assert.equal(inspired.pieces[0].item.id,"z-minimal");
  assert.equal(inspired.intent.styleSource,"inspiration");
  assert.match(inspired.pieces[0].components.find(component=>component.key==="style")!.evidence,/saved inspiration/);

  const explicit=rankOutfit(wardrobe,"Build me a casual outfit",{maxPieces:1,inspirationStyleHints:["minimal"]});
  assert.equal(explicit.pieces[0].item.id,"a-casual");
  assert.equal(explicit.intent.styleSource,"request");
});

test("the model prompt receives bounded inspiration context without post ids or creator identity",()=>{
  const wardrobe=[owned("owned-1","Minimal Tee",["minimal"])];
  const prompt=buildConsumerHangerPrompt({message:"Build me an outfit",wardrobe,outfits:[],suggested:wardrobe,inspiration:{lookCount:2,styleHints:["minimal"],colors:["navy"],categories:["top"],subtypes:["t-shirt"],recentLookTitles:["Minimal layers"]}});
  assert.match(prompt,/savedInspiration/);
  assert.match(prompt,/Minimal layers/);
  assert.doesNotMatch(prompt,/postIds|public_creator|image|handle/);
});

test("production wiring scopes inspiration to the session and passes only profile hints to Hanger",()=>{
  const communityRoute=fs.readFileSync(new URL("../app/api/community/route.ts",import.meta.url),"utf8");
  const hangerRoute=fs.readFileSync(new URL("../app/api/agents/consumer/route.ts",import.meta.url),"utf8");
  const store=fs.readFileSync(new URL("../lib/server/production-store.ts",import.meta.url),"utf8");
  assert.match(communityRoute,/saveConsumerInspiration\(session\.subject,body\.postId\)/);
  assert.match(store,/SK:`INSPIRATION#\$\{postId\}`/);
  assert.match(store,/ConditionExpression:"attribute_not_exists\(PK\) AND attribute_not_exists\(SK\)"/);
  assert.match(store,/DeleteCommand\(\{TableName:requireTable\(\),Key:inspirationKey\}\)/,"a failed counter update must roll back the private marker");
  assert.match(hangerRoute,/inspirationStyleHints:inspiration\.styleHints/);
  assert.doesNotMatch(hangerRoute,/inspiration\.postIds/,"post ids are not needed by the model or ranking engine");
});
