import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { consumerViewPath, workspaceHome, workspaceMenuItems } from "../lib/workspace-navigation.ts";

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

test("authenticated menus stay inside role workspaces and never link to login", () => {
  const consumer=workspaceMenuItems("consumer");
  const brand=workspaceMenuItems("brand");
  assert.ok(consumer.some(item=>item.href==="/consumer?add=1"));
  assert.ok(consumer.some(item=>item.href==="/community"));
  assert.ok(brand.some(item=>item.href==="/brand#products"));
  assert.ok(brand.some(item=>item.href==="/community"));
  assert.ok([...consumer,...brand].every(item=>item.href!=="/"&&item.href!=="/login"));
});

test("mobile header navigation keeps the authenticated menu visible", () => {
  const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.app-header \.app-menu-popover\{display:block/);
});
