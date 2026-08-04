import test from "node:test";
import assert from "node:assert/strict";
import { runBrandWearAgent, runConsumerStylistAgent } from "../lib/agents.ts";

test("consumer agent builds from owned pieces and exposes its tools",()=>{const reply=runConsumerStylistAgent({occasion:"class presentation",weather:"cool"});assert.equal(reply.agent,"consumer-stylist");assert.ok(reply.message.includes("class presentation"));assert.ok(reply.evidence.includes("No new purchase required"));assert.ok(reply.toolsUsed.includes("wardrobe.search"));assert.ok(reply.actions.some((action)=>action.type==="record-outfit"));});
test("brand agent reports aggregate actual wear without identity claims",()=>{const reply=runBrandWearAgent("p1");assert.equal(reply.agent,"brand-wear-intelligence");assert.match(reply.message,/actual-wear rate/);assert.ok(reply.toolsUsed.includes("segments.threshold"));assert.ok(!/email|customer name|will buy|sales lift/i.test(reply.message));});
