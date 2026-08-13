import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("demo seed uses the canonical shoe category for the Recreate substitute",()=>{
  const seed=readFileSync(new URL("../scripts/seed-test-cohort.mjs",import.meta.url),"utf8");
  assert.match(seed,/categories:Array\(10\)\.fill\("shoe"\)/);
  assert.doesNotMatch(seed,/fill\("shoes"\)/);
  assert.match(seed,/product\.category==="shoe"\?"sneakers"/);
});