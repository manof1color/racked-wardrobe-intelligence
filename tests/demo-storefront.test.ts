import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_STORE_DISCLAIMER, demoProductImagePath, demoStoreProductPath, demoStoreProductUrl, formatPrice, isDemoStorefrontBrand, isDemoStorefrontProduct, storefrontDescription, storefrontPrice } from "../lib/demo-storefront.ts";
import { MAX_SIMILAR_SUGGESTIONS, parseSimilarSuggestions } from "../lib/similar-products.ts";

test("storefront URLs are deterministic and safely encoded", () => {
  assert.equal(demoStoreProductPath("racked-test-atelier", "RTA-001"), "/demo-store/racked-test-atelier/RTA-001");
  assert.equal(demoStoreProductUrl("https://example.test", "synthetic-stride-lab", "SSL-001"), "https://example.test/demo-store/synthetic-stride-lab/SSL-001");
  assert.equal(demoStoreProductUrl("https://example.test/", "lumen-test-objects", "LTO-001"), "https://example.test/demo-store/lumen-test-objects/LTO-001", "a trailing slash must not double up");
  assert.equal(demoStoreProductPath("brand", "A/B 1"), "/demo-store/brand/A%2FB%201");
});

test("only known fictional SKUs receive curated demo photography",()=>{
  assert.equal(demoProductImagePath("RTA-003"),"/demo-products/RTA-003.webp");
  assert.equal(demoProductImagePath("RTA-004"),"/demo-products/RTA-001.webp");
  assert.equal(demoProductImagePath("SSL-010"),"/demo-products/SSL-001.webp");
  assert.equal(demoProductImagePath("LTO-009"),"/demo-products/LTO-003.webp");
  assert.equal(demoProductImagePath("REAL-001"),undefined);
  assert.equal(demoProductImagePath("RTA-010"),undefined,"the belt has no misleading apparel photo");
});

test("REGRESSION: only demonstration records get a fictional storefront", () => {
  assert.equal(isDemoStorefrontProduct({ dataClassification: "DEMO" }), true);
  assert.equal(isDemoStorefrontProduct({ testCohort: true }), true);
  assert.equal(isDemoStorefrontProduct({ dataClassification: "PILOT" }), false, "a real pilot brand must never get a fake shop");
  assert.equal(isDemoStorefrontProduct({ dataClassification: "REGULAR" }), false);
  assert.equal(isDemoStorefrontProduct({}), false, "unclassified records must not be treated as demo data");
});

test("a brand qualifies only when every one of its products is demonstration data", () => {
  assert.equal(isDemoStorefrontBrand([{ dataClassification: "DEMO" }, { testCohort: true }]), true);
  assert.equal(isDemoStorefrontBrand([{ dataClassification: "DEMO" }, { dataClassification: "REGULAR" }]), false);
  assert.equal(isDemoStorefrontBrand([]), false, "an unknown brand must 404 rather than render an empty shop");
});

test("fictional prices are deterministic, positive, and defer to an enrolled price", () => {
  const product = { sku: "RTA-003", category: "outerwear" };
  assert.equal(storefrontPrice(product), storefrontPrice(product), "the same SKU must always price the same");
  assert.ok(storefrontPrice(product) >= 120 && storefrontPrice(product) <= 260);
  assert.equal(storefrontPrice({ sku: "RTA-003", category: "outerwear", price: 189 }), 189, "an enrolled price wins over the synthetic one");
  assert.ok(storefrontPrice({ sku: "X", category: "unheard-of" }) > 0);
});

test("product copy always states the product is fictional and checkout never charges", () => {
  const copy = storefrontDescription({ name: "Transit Bomber", category: "outerwear" });
  assert.match(copy, /fictional/i);
  assert.match(copy, /never charges/i);
  assert.match(DEMO_STORE_DISCLAIMER, /not a real shop/i);
  assert.match(DEMO_STORE_DISCLAIMER, /no payment is ever collected/i);
});

test("prices format as currency without throwing on an odd code", () => {
  assert.match(formatPrice(89, "USD"), /89/);
  assert.ok(formatPrice(89, "NOT-A-CURRENCY").includes("89"));
});

const suggestion = { registryProductId: "p1", sku: "S1", name: "Court Low", brand: "Synthetic Stride Lab", brandSlug: "synthetic-stride-lab", category: "shoe", price: 110, currency: "USD", score: 82, reasons: ["Same category", "Similar color"], commerceState: "SIMILAR_AVAILABLE", outboundUrl: "/api/products/p1/outbound" };

test("REGRESSION: a suggestion can never claim to be the exact piece worn", () => {
  const [parsed] = parseSimilarSuggestions({ similar: [{ ...suggestion, commerceState: "EXACT_AVAILABLE" }] });
  assert.equal(parsed.commerceState, "SIMILAR_AVAILABLE", "an exact claim from the server must be downgraded");
  const [noDestination] = parseSimilarSuggestions({ similar: [{ ...suggestion, commerceState: "EXACT_AVAILABLE", outboundUrl: undefined }] });
  assert.equal(noDestination.commerceState, "NO_DESTINATION");
});

test("REGRESSION: a suggestion destination can never become an open redirect", () => {
  for (const hostile of ["https://evil.test/steal", "//evil.test", "javascript:alert(1)", "http://127.0.0.1/", ""]) {
    const [parsed] = parseSimilarSuggestions({ similar: [{ ...suggestion, outboundUrl: hostile }] });
    assert.equal(parsed.outboundUrl, undefined, `${hostile} must be rejected`);
    assert.equal(parsed.commerceState, "NO_DESTINATION");
  }
  assert.equal(parseSimilarSuggestions({ similar: [suggestion] })[0].outboundUrl, "/api/products/p1/outbound");
});

test("a missing, malformed, or oversized response degrades safely", () => {
  assert.deepEqual(parseSimilarSuggestions(null), []);
  assert.deepEqual(parseSimilarSuggestions({}), []);
  assert.deepEqual(parseSimilarSuggestions({ similar: "nope" }), []);
  assert.deepEqual(parseSimilarSuggestions({ similar: [null, 7, {}] }), [], "entries without an id and name are dropped");
  assert.equal(parseSimilarSuggestions({ similar: Array.from({ length: 30 }, () => suggestion) }).length, MAX_SIMILAR_SUGGESTIONS);
});

test("scores and reasons are bounded", () => {
  const [parsed] = parseSimilarSuggestions({ similar: [{ ...suggestion, score: 5000, reasons: ["a", "b", "c", "d", "e", "f", 9] }] });
  assert.equal(parsed.score, 100);
  assert.equal(parsed.reasons.length, 4);
  assert.equal(parseSimilarSuggestions({ similar: [{ ...suggestion, score: -12 }] })[0].score, 0);
});
