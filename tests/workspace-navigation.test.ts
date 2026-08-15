import assert from "node:assert/strict";
import test from "node:test";

import { consumerViewPath, workspaceHome } from "../lib/workspace-navigation.ts";

test("workspace home routes preserve the authenticated role boundary", () => {
  assert.equal(workspaceHome("consumer"), "/consumer");
  assert.equal(workspaceHome("brand"), "/brand");
});

test("consumer mobile navigation creates stable deep links", () => {
  assert.equal(consumerViewPath("home"), "/consumer");
  assert.equal(consumerViewPath("looks"), "/consumer?view=looks");
  assert.equal(consumerViewPath("closet"), "/consumer?view=closet");
  assert.equal(consumerViewPath("outfits"), "/consumer?view=outfits");
});
