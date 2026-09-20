import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogAttention, MAX_ATTENTION_ITEMS } from "../lib/brand-catalog-health.ts";
import { brandViewPath } from "../lib/workspace-navigation.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboard = read("components/brand-dashboard.tsx");

function product(overrides: Partial<BrandProductRegistration> = {}): BrandProductRegistration {
  return {
    id: "product-1", ownerSubject: "brand-1", name: "Everyday Tee", brand: "Northstar Atelier", brandSlug: "northstar-atelier",
    aliases: ["Northstar Atelier"], sku: "NA-TEE-1", gtin: null, category: "top", subtype: "t-shirt", color: "navy",
    price: 89, currency: "USD", productUrl: "https://northstar.example/tee", labelText: "",
    views: { front: { view: "front", fileName: "f.jpg", contentType: "image/jpeg", size: 1, storageKey: "brand/1/f.jpg" } },
    enrolledAt: "2026-09-19T00:00:00.000Z", source: "brand-enrolled",
    ...overrides,
  } as BrandProductRegistration;
}

// ─── Navigation ────────────────────────────────────────────────────────────────

// The brand tabs were anchor links into one long page: tapping "Products" scrolled but never
// changed what was on screen, while the consumer tabs had switched views all along.
test("REGRESSION: brand tabs switch views instead of jumping down one page", () => {
  const nav = read("components/workspace-mobile-nav.tsx");
  assert.doesNotMatch(nav, /\/brand#products|\/brand#brand-looks/, "no anchor jumps");
  assert.match(nav, /onBrandView\?\.?\(?/, "the tab bar switches the view");
  assert.match(nav, /brandTabs\.map/);
  assert.equal(brandViewPath("overview"), "/brand");
  assert.equal(brandViewPath("catalog"), "/brand?view=catalog");
  assert.equal(brandViewPath("looks"), "/brand?view=looks");
  assert.match(read("app/brand/page.tsx"), /initialView/, "and a deep link opens that view");
});

test("the workspace is three places, with a product opened from the catalog", () => {
  for (const view of ["overview", "catalog", "looks", "product"]) {
    assert.ok(dashboard.includes(`view==="${view}"`), `missing the ${view} view`);
  }
  assert.match(dashboard, /function openProduct\(id:string\)/);
  assert.match(dashboard, /className="back-link" onClick=\{\(\)=>setView\("catalog"\)\}/, "a product view can be left");
  assert.match(dashboard, /<BrandProductEnrollment products=\{products\} onProducts=\{acceptProducts\}\/>/);
  const catalogView = dashboard.slice(dashboard.indexOf('{view==="catalog"'), dashboard.indexOf('{view==="looks"'));
  assert.match(catalogView, /BrandProductEnrollment/, "enrollment belongs with the catalog");
  assert.doesNotMatch(catalogView, /metrics\.actualWears|wearReadouts/, "and never carries wear data");
});

// ─── The privacy rule that shapes the layout ───────────────────────────────────

// Release status is derived from cohort size, so a catalog-wide view of it would be exactly the
// cross-product differencing the enumeration budget exists to prevent.
test("REGRESSION: no private aggregate appears outside an opened product", () => {
  const overview = dashboard.slice(dashboard.indexOf('{view==="overview"'), dashboard.indexOf('{view==="catalog"'));
  for (const leak of ["metrics.actualWears", "metrics.segmentSize", "metrics.suppressed", "wearReadouts", "communityReadouts"]) {
    assert.ok(!overview.includes(leak), `the overview must not show ${leak}`);
  }
  assert.match(overview, /Opens per product once 25 opted-in owners/, "it explains the threshold instead");
});

test("opening a product is what spends the enumeration budget, not landing on the workspace", () => {
  const effect = dashboard.slice(dashboard.indexOf("// Opening a product is what spends"), dashboard.indexOf("// Live public-activity refresh"));
  assert.match(effect, /if\(view!=="product"\|\|!productId\|\|justEnrolled\.includes\(productId\)\)return;/);
  assert.match(effect, /api\/brand\/metrics/);
  assert.match(effect, /\},\[view,productId,justEnrolled\]\);/, "the request follows the opened product");
});

// ─── Visual hierarchy ──────────────────────────────────────────────────────────

test("a catalog reads as products, with the state of each one visible", () => {
  assert.match(dashboard, /className="product-grid"/);
  assert.match(dashboard, /item\.imageUrls\?\.front\?<img src=\{item\.imageUrls\.front\}/, "the product photo is the card");
  assert.match(dashboard, /function productChips/);
  for (const chip of ["Retired", "Live", "No price", "No link", "Demo data"]) {
    assert.ok(dashboard.includes(`label:"${chip}"`), `missing the ${chip} chip`);
  }
  const css = read("app/globals.css");
  for (const rule of [".product-grid{", ".product-card{", ".chip{", ".wear-hero{", ".metric-skeleton{"]) {
    assert.ok(css.includes(rule), `missing style: ${rule}`);
  }
});

test("one number leads, the rest support it, and loading keeps the layout still", () => {
  assert.match(dashboard, /<section className="wear-hero">/);
  assert.match(dashboard, /metric-row-secondary/);
  assert.match(dashboard, /className="metric-skeleton" role="status"/, "a skeleton, not a spinner that shifts the page");
  assert.match(dashboard, /<figcaption>Confirmed wears per week, opted-in owners only\.<\/figcaption>/, "charts say what they count");
});

// The banner used to sit at the top of every visit, including for brands whose data had released.
test("the threshold is explained where it applies, not as a permanent banner", () => {
  assert.doesNotMatch(dashboard, /className="privacy-banner"/);
  const suppressed = dashboard.slice(dashboard.indexOf("metrics?.suppressed?"), dashboard.indexOf(":metrics&&<>"));
  assert.match(suppressed, /Fewer than \{metrics\.minimumCohortSize\} qualifying owners/);
  assert.doesNotMatch(suppressed, /metrics\.segmentSize/, "and still never the count");
});

// ─── What is unfinished in a brand's own catalog ───────────────────────────────

test("the overview lists what is unfinished, from the brand's own records only", () => {
  assert.deepEqual(catalogAttention([product()]), [], "a complete product needs nothing");
  const [missingPrice] = catalogAttention([product({ price: undefined })]);
  assert.equal(missingPrice.detail, "Missing a price.");
  const [missingTwo] = catalogAttention([product({ price: undefined, productUrl: undefined })]);
  assert.equal(missingTwo.detail, "Missing a price and a product link.");
  const [missingLook] = catalogAttention([product({ color: undefined, subtype: undefined })]);
  assert.match(missingLook.detail, /so a customer's scan can recognise it/);
  assert.deepEqual(catalogAttention([product({ archived: true, price: undefined })]), [], "a retired product is not unfinished work");
  assert.equal(catalogAttention(Array.from({ length: 12 }, (_, index) => product({ id: `p${index}`, price: undefined }))).length, MAX_ATTENTION_ITEMS);
  // Comments stripped: the prose explains why wear is absent, the code must simply never touch it.
  const health = read("lib/brand-catalog-health.ts").replace(/\/\*\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(health, /metrics|segmentSize|suppressed|wear/i, "built from listing facts, never from wear");
});

// REGRESSION: the catalog was fetched by the enrollment panel, which only the Catalog view mounts.
// A brand landing on Overview — the default view — was told it had no products until it happened to
// open Catalog, and the onboarding checklist agreed with that.
test("REGRESSION: the workspace loads its own catalog, so Overview is right on arrival", () => {
  assert.match(dashboard, /fetch\("\/api\/brand\/products"\)/, "the workspace fetches the catalog itself");
  assert.match(dashboard, /setCatalogLoaded\(true\)/);
  assert.match(dashboard, /\{catalogLoaded&&products\.length===0/, "an empty state waits until the catalog is known");

  const enrollment = read("components/brand-product-enrollment.tsx");
  assert.doesNotMatch(enrollment, /useEffect\(\(\)=>\{fetch\("\/api\/brand\/products"\)/, "the panel no longer owns the list");
  assert.match(enrollment, /\{products,onProducts\}:\{products:BrandProductRegistration\[\];onProducts:/, "it receives the catalog");
  assert.match(enrollment, /onProducts\(\[data\.product,\.\.\.products\]\)/, "and hands back the new one");
  assert.match(dashboard, /<BrandProductEnrollment products=\{products\} onProducts=\{acceptProducts\}\/>/);
});
