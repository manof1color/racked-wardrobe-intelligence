import assert from "node:assert/strict";
import test from "node:test";
import {OUTFIT_BOARD_HEIGHT,OUTFIT_BOARD_WIDTH,outfitBoardLayout} from "../lib/outfit-board.ts";

test("flat-lay places garment categories in explainable regions",()=>{const layout=outfitBoardLayout([{id:"coat",category:"outerwear"},{id:"tee",category:"top"},{id:"jeans",category:"bottom"},{id:"shoes",category:"shoe"},{id:"ring",category:"jewelry"}]);const byId=new Map(layout.map(item=>[item.id,item]));assert.ok(byId.get("tee")!.y<byId.get("jeans")!.y);assert.ok(byId.get("shoes")!.y>byId.get("jeans")!.y);assert.ok(byId.get("ring")!.x>OUTFIT_BOARD_WIDTH/2);for(const item of layout){assert.ok(item.x>=0&&item.y>=0);assert.ok(item.x+item.width<=OUTFIT_BOARD_WIDTH);assert.ok(item.y+item.height<=OUTFIT_BOARD_HEIGHT);}});
test("multiple pieces receive deterministic distinct slots",()=>{const items=[{id:"a",category:"top"},{id:"b",category:"top"},{id:"c",category:"top"}];assert.deepEqual(outfitBoardLayout(items),outfitBoardLayout(items));assert.equal(new Set(outfitBoardLayout(items).map(item=>`${item.x}:${item.y}`)).size,3);});
