import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { brandOnboardingComplete, brandOnboardingProgress, brandOnboardingSteps } from "../lib/brand-onboarding.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboard = read("components/brand-dashboard.tsx");

function product(overrides: Partial<BrandProductRegistration> = {}): BrandProductRegistration {
  return {
    id: "product-1", ownerSubject: "brand-1", name: "Everyday Tee", brand: "Northstar Atelier", brandSlug: "northstar-atelier",
    aliases: ["Northstar Atelier"], sku: "NA-TEE-1", gtin: null, category: "top", subtype: "t-shirt", color: "navy",
    price: 89, currency: "USD", productUrl: "https://northstar.example/tee", labelText: "",
    views: { front: { view: "front", fileName: "f.jpg", contentType: "image/jpeg", size: 1, storageKey: "brand/1/f.jpg" } },
    enrolledAt: "2026-09-20T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  } as BrandProductRegistration;
}
const steps = (input: Partial<Parameters<typeof brandOnboardingSteps>[0]> = {}) =>
  brandOnboardingSteps({ products: [], publishedLookCount: 0, sharedLink: false, ...input });

test("a new brand account gets four steps, none of them done", () => {
  const fresh = steps();
  assert.deepEqual(fresh.map((step) => step.id), ["enroll", "describe", "look", "share"]);
  assert.equal(fresh.every((step) => !step.done), true);
  assert.deepEqual(brandOnboardingProgress(fresh), { done: 0, total: 4 });
  assert.equal(brandOnboardingComplete(fresh), false);
});

test("each step is answered by the account's own records, so progress survives a new device", () => {
  const enrolled = steps({ products: [product({ price: undefined, productUrl: undefined })] });
  assert.equal(enrolled.find((step) => step.id === "enroll")!.done, true);
  assert.equal(enrolled.find((step) => step.id === "describe")!.done, false, "a bare product is not a described one");

  const described = steps({ products: [product()] });
  assert.equal(described.find((step) => step.id === "describe")!.done, true);
  assert.equal(steps({ products: [product({ color: undefined, subtype: undefined })] }).find((step) => step.id === "describe")!.done, false);

  const published = steps({ products: [product()], publishedLookCount: 1 });
  assert.equal(published.find((step) => step.id === "look")!.done, true);
  assert.equal(brandOnboardingComplete(steps({ products: [product()], publishedLookCount: 1, sharedLink: true })), true);
});

test("a retired product does not count as a catalog", () => {
  const retired = steps({ products: [product({ archived: true })] });
  assert.equal(retired.find((step) => step.id === "enroll")!.done, false);
});

test("the checklist is built from listings and never from wear", () => {
  const source = read("lib/brand-onboarding.ts").replace(/\/\*\*[\s\S]*?\*\//g, "");
  // Copy may say "cost per wear"; the module may not read a wear figure to decide anything.
  for (const identifier of ["BrandMetrics", "metrics", "segmentSize", "suppressed", "wearCount", "actualWears"]) {
    assert.ok(!source.includes(identifier), `the checklist must not depend on ${identifier}`);
  }
  assert.deepEqual([...source.matchAll(/^import .*$/gm)].map((match) => match[0]), ['import type { BrandProductRegistration } from "./platform-types.ts";']);
  assert.match(dashboard, /showChecklist=!checklistHidden&&!brandOnboardingComplete\(steps\)/, "it disappears when finished");
  assert.match(dashboard, /racked\.brand\.checklistHidden/, "and can be hidden for good on this device");
});

// Browser storage can be empty, or throw, in a private window. The checklist must still render.
test("stored flags are read defensively and only after hydration", () => {
  assert.match(dashboard, /const storedFlag=\(key:string\)=>\{try\{return window\.localStorage\.getItem\(key\)==="1";\}catch\{return false;\}\}/);
  assert.doesNotMatch(dashboard, /useState\(\(\)=>window\.localStorage/, "never read during render, which the server cannot do");
});

// ─── Two defects found reviewing the workspace rewrite ─────────────────────────

// REGRESSION: with products enrolled but none opened, brand Hanger said "Enroll a product first",
// which reads like a bug to a brand looking at its own full catalog.
test("REGRESSION: Hanger tells a brand with products to open one, not to enrol one", () => {
  const dock = read("components/hanger-dock.tsx");
  assert.match(dock, /brandHasProducts\s*=\s*false/, "the dock knows whether a catalog exists");
  assert.match(dock, /Open a product first\./);
  assert.match(dock, /Enrol|Enroll a product first\./);
  assert.ok(dock.indexOf("Open a product first.") < dock.indexOf("Enroll a product first."), "the catalog case is checked first");
  assert.match(dashboard, /brandHasProducts=\{products\.length>0\}/);
});

// REGRESSION: enrolling a product opened it and immediately queried its aggregates, spending one of
// six enumeration slots to be told what is certain — a product created seconds ago has no owners.
test("REGRESSION: a product enrolled moments ago costs no enumeration budget", () => {
  assert.match(dashboard, /if\(view!=="product"\|\|!productId\|\|justEnrolled\.includes\(productId\)\)return;/);
  assert.match(dashboard, /setJustEnrolled\(ids=>\[\.\.\.ids,\.\.\.arrivals\.map\(item=>item\.id\)\]\)/, "every product enrolled in this session, not just one");
  assert.match(dashboard, /Nothing has been linked to this yet\./);
  assert.match(dashboard, /will not spend one of your aggregate requests/);
});

test("the layout the workspace replaced left no styles behind", () => {
  const css = read("app/globals.css");
  for (const dead of ["brand-layout", "catalog-panel", "match-panel", "product-list", "metric-row-expanded", "analytics-loading", "tiny-product-photo", "tiny-swatch"]) {
    assert.ok(!css.includes(`.${dead}`), `dead style left behind: .${dead}`);
  }
  for (const live of [".product-grid{", ".onboarding-card{", ".wear-hero{", ".privacy-banner{"]) {
    assert.ok(css.includes(live), `live style removed by mistake: ${live}`);
  }
});
