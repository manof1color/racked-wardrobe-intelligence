import test from "node:test";
import assert from "node:assert/strict";
import { buildWearUsageAnalytics } from "../lib/metrics.ts";

test("wear analytics exposes only cohort-level usage datapoints",()=>{
  const counts=[0,1,2,2,3,3,4,5,6,8,0,1,2,2,3,3,4,5,6,8,0,1,2,2,3];
  const now=new Date("2026-08-09T12:00:00.000Z");
  const events=counts.flatMap((count,owner)=>Array.from({length:count},(_,wear)=>new Date(now.getTime()-(((owner%7)+(wear*7))*86_400_000)).toISOString()));
  const result=buildWearUsageAnalytics(counts,events,now);
  assert.equal(result.actualWears,76);
  assert.equal(result.activeOwners,22);
  assert.equal(result.engagementRate,88);
  assert.equal(result.repeatWearRate,76);
  assert.equal(result.averageWearsPerOwner,3);
  assert.equal(result.medianWearsPerOwner,3);
  assert.equal(result.zeroWearOwners,3);
  assert.equal(result.highFrequencyOwners,4);
  assert.equal(result.wearDistribution.reduce((sum,point)=>sum+point.owners,0),25);
  assert.equal(result.weeklyTrend.length,8);
  assert.ok(result.weeklyTrend.some(point=>point.wears>0));
  assert.ok(!("owner" in result)&&!("email" in result));
});

test("wear analytics remains well formed with no events",()=>{
  const result=buildWearUsageAnalytics([0,0,0],[],new Date("2026-08-09T12:00:00.000Z"));
  assert.equal(result.actualWears,0);
  assert.equal(result.lastWearAt,null);
  assert.equal(result.weeklyTrend.every(point=>point.wears===0),true);
});
