import test from "node:test";
import assert from "node:assert/strict";
import { addPost, getWearCount, listPosts, recordWear, resetDemoStore } from "../lib/server/demo-store.ts";

test("backend store records wears and resets deterministically",()=>{resetDemoStore();const before=getWearCount("w1");assert.equal(recordWear("w1"),before+1);resetDemoStore();assert.equal(getWearCount("w1"),before);assert.throws(()=>recordWear("unknown"));});
test("public posts expose brand links but no private identity fields",()=>{resetDemoStore();const post=addPost({outfitTitle:"Test rotation",caption:"Fictional test post",image:"/test.png",products:[{sku:"NA-OW-1042",name:"Sienna Soft Overshirt",brand:"Northstar Atelier",brandSlug:"northstar-atelier",category:"outerwear"}]});assert.equal(listPosts()[0].id,post.id);assert.equal(post.products[0].brandSlug,"northstar-atelier");assert.equal("email" in post,false);assert.equal("wardrobeIds" in post,false);});
