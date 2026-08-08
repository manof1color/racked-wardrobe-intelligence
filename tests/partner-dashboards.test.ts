import test from "node:test";
import assert from "node:assert/strict";
import { partnerDashboards } from "../lib/community-data.ts";

test("all four requested partner entry pages expose no invented inventory",()=>{assert.deepEqual(Object.keys(partnerDashboards).sort(),["clothing","jewelry","shoes","vintage"]);for(const dashboard of Object.values(partnerDashboards)){assert.ok(dashboard.metrics.length>=4);assert.equal(dashboard.inventory.length,0);assert.ok(dashboard.agentBrief.length>30);}});
