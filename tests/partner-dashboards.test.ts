import test from "node:test";
import assert from "node:assert/strict";
import { partnerDashboards } from "../lib/community-data.ts";

test("all four requested partner dashboards have metrics, inventory, and an agent brief",()=>{assert.deepEqual(Object.keys(partnerDashboards).sort(),["clothing","jewelry","shoes","vintage"]);for(const dashboard of Object.values(partnerDashboards)){assert.ok(dashboard.metrics.length>=4);assert.ok(dashboard.inventory.length>=2);assert.ok(dashboard.agentBrief.length>30);assert.ok(dashboard.inventory.every((item)=>item.actualWears>=0&&item.repeatWearRate<=100));}});
