import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("mobile header keeps the session-only account menu visible", () => {
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.app-header \.app-menu-popover\{display:block/);
});
