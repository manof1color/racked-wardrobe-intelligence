import test from "node:test";
import assert from "node:assert/strict";
import { canExposeAggregate, MINIMUM_COHORT_SIZE, toBrandSafeSegment } from "../lib/privacy.ts";

test("segments below the privacy threshold are suppressed", () => {
  assert.equal(canExposeAggregate(MINIMUM_COHORT_SIZE - 1), false);
  assert.equal(toBrandSafeSegment({ id:"small",label:"Small",size:12,emails:["fictional@example.test"] }), null);
});

test("brand-safe segments exclude identities and raw wardrobe references", () => {
  const result = toBrandSafeSegment({ id:"s1",label:"Neutral-first",size:148,emails:["fictional@example.test"],wardrobeIds:["w1"] });
  assert.deepEqual(result, { id:"s1",label:"Neutral-first",size:148 });
});
