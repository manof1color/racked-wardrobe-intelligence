import test from "node:test";
import assert from "node:assert/strict";
import { dataLabel, hasShoppablePiece, matchLanguage, provenanceLabel, shoppableLanguage } from "../lib/look-language.ts";
import type { PublicOutfitGarment } from "../lib/platform-types.ts";
import type { RecreateMatchState } from "../lib/recreate-look.ts";

const allMatchStates: RecreateMatchState[] = ["EXACT_OWNED", "STRONG_SUBSTITUTE", "ACCEPTABLE_SUBSTITUTE", "WEAK_SUBSTITUTE", "MISSING"];

test("every backend match state maps to plain language without leaking the enum", () => {
  for (const state of allMatchStates) {
    const language = matchLanguage(state);
    assert.ok(language.label.length > 0, `${state} needs a label`);
    assert.doesNotMatch(language.label, /_|SUBSTITUTE|EXACT_OWNED|MISSING$/, `${state} label must not expose the raw enum`);
    assert.ok(language.meaning.length > 0, `${state} needs a plain-language meaning`);
  }
  assert.equal(matchLanguage("EXACT_OWNED").label, "Exact match");
  assert.equal(matchLanguage("STRONG_SUBSTITUTE").label, "Strong match");
  assert.equal(matchLanguage("ACCEPTABLE_SUBSTITUTE").label, "Similar option");
  assert.equal(matchLanguage("WEAK_SUBSTITUTE").label, "Loose match");
  assert.equal(matchLanguage("MISSING").label, "Missing");
});

test("only MISSING is grouped as missing; every substitute counts as something you own", () => {
  for (const state of allMatchStates) {
    assert.equal(matchLanguage(state).group, state === "MISSING" ? "missing" : "owned", state);
  }
});

function garment(overrides: Partial<PublicOutfitGarment>): Pick<PublicOutfitGarment, "resolutionState" | "verifiedProduct"> {
  return { resolutionState: "GENERIC_UNVERIFIED", ...overrides } as PublicOutfitGarment;
}

const verified = { registryProductId: "registry-1", sku: "SKU-1", name: "Field Jacket", brand: "Demo Brand", brandSlug: "demo-brand" };

test("an exact verified product with an available destination is the only shoppable state", () => {
  const shoppable = shoppableLanguage(garment({ resolutionState: "EXACT_VERIFIED_PRODUCT", verifiedProduct: { ...verified, commerceState: "EXACT_AVAILABLE", outboundUrl: "/api/products/registry-1/outbound" } }));
  assert.equal(shoppable.canShopExact, true);
  assert.equal(shoppable.tone, "exact");
  assert.equal(shoppable.action, "View product");
});

test("REGRESSION: a similar or estimated item is never described as the exact piece worn", () => {
  for (const state of ["SIMILAR_PRODUCT", "AI_ESTIMATED_PRODUCT", "GENERIC_UNVERIFIED", "VERIFIED_UNAVAILABLE"] as const) {
    const language = shoppableLanguage(garment({ resolutionState: state }));
    assert.equal(language.canShopExact, false, `${state} must never be shoppable as exact`);
    assert.doesNotMatch(language.label, /^Exact verified product$/, `${state} must not claim exact verification`);
  }
  const similar = shoppableLanguage(garment({ resolutionState: "SIMILAR_PRODUCT" }));
  assert.equal(similar.label, "Similar item");
  assert.match(similar.detail, /not the exact piece/i);
});

test("a verified product the brand marks unavailable is not shoppable and says why", () => {
  const language = shoppableLanguage(garment({ resolutionState: "EXACT_VERIFIED_PRODUCT", verifiedProduct: { ...verified, commerceState: "EXACT_UNAVAILABLE", outboundUrl: "/api/products/registry-1/outbound" } }));
  assert.equal(language.canShopExact, false);
  assert.equal(language.tone, "unavailable");
  assert.equal(language.action, null);
});

test("a verified product with no published destination stays verified but unshoppable", () => {
  const language = shoppableLanguage(garment({ resolutionState: "EXACT_VERIFIED_PRODUCT", verifiedProduct: { ...verified, commerceState: "NO_DESTINATION" } }));
  assert.equal(language.label, "Exact verified product");
  assert.equal(language.canShopExact, false);
  assert.equal(language.action, null);
});

test("hasShoppablePiece only fires when a genuinely openable exact product exists", () => {
  assert.equal(hasShoppablePiece([garment({ resolutionState: "SIMILAR_PRODUCT" }), garment({ resolutionState: "GENERIC_UNVERIFIED" })]), false);
  assert.equal(hasShoppablePiece([garment({ resolutionState: "EXACT_VERIFIED_PRODUCT", verifiedProduct: { ...verified, commerceState: "EXACT_AVAILABLE", outboundUrl: "/api/products/registry-1/outbound" } })]), true);
});

test("brand-authored and consumer-authored looks are labeled distinctly", () => {
  assert.equal(provenanceLabel("brand").label, "Brand Look");
  assert.equal(provenanceLabel("brand").kind, "brand");
  assert.equal(provenanceLabel("consumer").label, "Community Look");
  assert.match(provenanceLabel("consumer").description, /published by a person/i);
});

test("synthetic and pilot records are labeled; ordinary records carry no badge", () => {
  assert.equal(dataLabel({ dataClassification: "DEMO" })?.label, "Demo data");
  assert.match(dataLabel({ dataClassification: "DEMO" })!.detail, /fictional/i);
  assert.equal(dataLabel({ fictional: true })?.label, "Demo data");
  assert.equal(dataLabel({ dataClassification: "PILOT" })?.label, "Pilot data");
  assert.equal(dataLabel({ dataClassification: "REGULAR" }), null);
  assert.equal(dataLabel({}), null);
});
