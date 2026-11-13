import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  completeJudgeTourStep,
  isJudgeTourStepId,
  JUDGE_TOUR_PRODUCTS,
  JUDGE_TOURS,
  judgeTourStorageKey,
  nextJudgeTourStep,
  readJudgeTourRequest,
  readJudgeTourState,
  stepForOpenedProduct,
} from "../lib/judge-tour.ts";
import { MINIMUM_COHORT_SIZE } from "../lib/privacy.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The brand steps name two seeded products and quote their owner counts, so both are checked
// against the judge seed itself, in dry-run mode: no AWS, no password.
process.env.RACKED_SEED_DRY_RUN = "yes";
const { buildJudgeSeed } = await import("../scripts/seed-judge-accounts.mjs");
const { written } = await buildJudgeSeed();
const seeded = written.items as Array<Record<string, unknown>>;
const seededProduct = (id: string) => seeded.find((item) => item.id === id && String(item.SK).startsWith("PRODUCT#"));
const linkedOwners = (id: string) => new Set(seeded.filter((item) => item.GSI1PK === `PRODUCT#${id}`).map((item) => item.PK)).size;

const consumer = JUDGE_TOURS.consumer;
const brand = JUDGE_TOURS.brand;

test("the guide follows the README's two flows, and nothing else", () => {
  assert.deepEqual(consumer.steps.map((step) => step.id), ["scan", "hanger-outfit"]);
  assert.deepEqual(brand.steps.map((step) => step.id), ["suppressed", "released", "brand-hanger"]);
  assert.equal(consumer.switchTo.kind, "judge-brand");
  assert.equal(brand.switchTo.kind, "judge-consumer");
});

test("the two brand products exist in the judge seed, below and above the threshold, as the steps say", () => {
  const suppressed = seededProduct(JUDGE_TOUR_PRODUCTS.suppressed.id);
  const released = seededProduct(JUDGE_TOUR_PRODUCTS.released.id);
  assert.equal(suppressed?.name, JUDGE_TOUR_PRODUCTS.suppressed.name);
  assert.equal(released?.name, JUDGE_TOUR_PRODUCTS.released.name);
  assert.equal(linkedOwners(JUDGE_TOUR_PRODUCTS.suppressed.id), 4);
  assert.equal(linkedOwners(JUDGE_TOUR_PRODUCTS.released.id), 50);
  assert.ok(4 < MINIMUM_COHORT_SIZE && 50 >= MINIMUM_COHORT_SIZE, "one suppressed, one released");
  const [suppressedStep, releasedStep] = brand.steps;
  assert.match(suppressedStep.detail, /^4 opted-in owners, below the threshold of 25/);
  assert.match(releasedStep.detail, /^50 opted-in owners/);
});

test("the brand steps open only those two products: one below the threshold and one above it", () => {
  const opened = new Set(brand.steps.flatMap((step) => step.request.action === "open-product" ? [step.request.productId] : []));
  assert.deepEqual([...opened].sort(), [JUDGE_TOUR_PRODUCTS.released.id, JUDGE_TOUR_PRODUCTS.suppressed.id].sort());
  const last = brand.steps.at(-1)!.request;
  assert.deepEqual(last, { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id, thenHanger: true }, "Brand Hanger opens on the released product, which is already open");
});

test("a request is read only when it is one of the guide's own", () => {
  assert.deepEqual(readJudgeTourRequest({ action: "open-scanner" }), { action: "open-scanner" });
  assert.deepEqual(readJudgeTourRequest({ action: "open-hanger", extra: 1 }), { action: "open-hanger" });
  assert.deepEqual(readJudgeTourRequest({ action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id, thenHanger: true }), { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id, thenHanger: true });
  assert.deepEqual(readJudgeTourRequest({ action: "open-product", productId: JUDGE_TOUR_PRODUCTS.suppressed.id, thenHanger: "yes" }), { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.suppressed.id });
  for (const detail of [null, undefined, "open-scanner", 42, {}, { action: "delete" }, { action: "open-product" }, { action: "open-product", productId: "some-real-product" }]) {
    assert.equal(readJudgeTourRequest(detail), null, JSON.stringify(detail));
  }
});

test("only the guide's two products count as steps when opened", () => {
  assert.equal(stepForOpenedProduct(JUDGE_TOUR_PRODUCTS.suppressed.id), "suppressed");
  assert.equal(stepForOpenedProduct(JUDGE_TOUR_PRODUCTS.released.id), "released");
  assert.equal(stepForOpenedProduct("judge-product-founder"), null);
  assert.equal(isJudgeTourStepId("scan"), true);
  for (const value of ["", "toString", "__proto__", null, 1]) assert.equal(isJudgeTourStepId(value), false);
});

test("progress keeps the tour's order, ignores the other tour's steps, and points at the next step", () => {
  let state = readJudgeTourState(null, brand);
  assert.equal(nextJudgeTourStep(state, brand)?.id, "suppressed");
  state = completeJudgeTourStep(state, brand, "brand-hanger");
  state = completeJudgeTourStep(state, brand, "suppressed");
  state = completeJudgeTourStep(state, brand, "scan");
  state = completeJudgeTourStep(state, brand, "suppressed");
  assert.deepEqual(state.done, ["suppressed", "brand-hanger"]);
  assert.equal(nextJudgeTourStep(state, brand)?.id, "released");
  state = completeJudgeTourStep(state, brand, "released");
  assert.equal(nextJudgeTourStep(state, brand), null);
});

test("stored progress is parsed defensively: junk, unknown steps and the other tour's steps are dropped", () => {
  assert.deepEqual(readJudgeTourState("not json", consumer), { done: [], collapsed: false });
  assert.deepEqual(readJudgeTourState(JSON.stringify({ done: ["hanger-outfit", "released", "nope", 3, "scan"], collapsed: true }), consumer), { done: ["scan", "hanger-outfit"], collapsed: true });
  assert.deepEqual(readJudgeTourState(JSON.stringify({ done: "scan", collapsed: "yes" }), consumer), { done: [], collapsed: false });
});

test("progress is kept per demo session, under a key holding only the session's expiry", () => {
  assert.equal(judgeTourStorageKey("consumer", 1_800_000_000_000), "racked.judgeTour.consumer.1800000000000");
  assert.notEqual(judgeTourStorageKey("consumer", 1), judgeTourStorageKey("consumer", 2));
  assert.notEqual(judgeTourStorageKey("consumer", 1), judgeTourStorageKey("brand", 1));
});

test("only demo sessions get the guide, and a New Brand demo, which lacks the seeded products, does not", () => {
  const consumerPage = read("app/consumer/page.tsx");
  const brandPage = read("app/brand/page.tsx");
  assert.match(consumerPage, /\{session\.demo&&<JudgeTour kind="consumer" sessionExpiresAt=\{session\.expiresAt\}\/>\}/);
  assert.match(brandPage, /\{session\.demo&&!isDemoAccountId\(session\.subject\)&&<JudgeTour kind="brand" sessionExpiresAt=\{session\.expiresAt\}\/>\}/);
  const component = read("components/judge-tour.tsx");
  assert.doesNotMatch(component, /\bsid\b|cookie/i, "the guide never sees a session id or cookie");
  assert.doesNotMatch(component, /fetch\("\/api\/(?!auth\/demo)/, "the guide reads no account data; its only request switches demos");
});

test("the dashboards answer the guide and report progress back", () => {
  const consumerDashboard = read("components/consumer-dashboard.tsx");
  assert.match(consumerDashboard, /readJudgeTourRequest\(\(event as CustomEvent\)\.detail\)\?\.action==='open-scanner'\)setShowAdd\(true\)/);
  assert.match(consumerDashboard, /setActiveView\("closet"\);signalJudgeTourProgress\("scan"\);/, "the scan step ticks only once every piece is saved");
  const brandDashboard = read("components/brand-dashboard.tsx");
  assert.match(brandDashboard, /request\?\.action!=="open-product"\)return;openProduct\(request\.productId\)/);
  assert.match(brandDashboard, /const step=stepForOpenedProduct\(productId\);if\(step\)signalJudgeTourProgress\(step\);/, "a product step ticks once its numbers, or its suppression, are on screen");
  assert.match(read("components/hanger-dock.tsx"), /\?\.action === "open-hanger"\) setOpen\(true\)/);
  const panels = read("components/agent-panels.tsx");
  assert.match(panels, /signalJudgeTourProgress\("hanger-outfit"\)/);
  assert.match(panels, /signalJudgeTourProgress\("brand-hanger"\)/);
});

test("the home page offers the demo in one click, and the sign-in screen's demo section is its target", () => {
  const home = read("app/page.tsx");
  assert.ok(home.includes('href="/login#try-the-demo"'));
  assert.match(read("components/login-panel.tsx"), /<section className="demo-entry" id="try-the-demo"/);
});

test("every step names a spotlight target that the page carries", async () => {
  const { judgeTourTargetSelector } = await import("../lib/judge-tour.ts");
  const targets = [...JUDGE_TOURS.consumer.steps, ...JUDGE_TOURS.brand.steps].map((step) => step.target);
  assert.deepEqual(targets, ["scan", "hanger", `product-${JUDGE_TOUR_PRODUCTS.suppressed.id}`, `product-${JUDGE_TOUR_PRODUCTS.released.id}`, "hanger"]);
  assert.equal(judgeTourTargetSelector("scan"), '[data-tour="scan"]');
  assert.match(read("components/consumer-dashboard.tsx"), /data-tour="scan" onClick=\{openAdd\}>\+ Add clothing/);
  assert.match(read("components/workspace-mobile-nav.tsx"), /<button type="button" data-tour="scan" onClick=\{onAdd\}>/);
  assert.match(read("components/hanger-dock.tsx"), /className="hanger-launcher" data-tour="hanger"/);
  assert.match(read("components/brand-dashboard.tsx"), /data-tour=\{`product-\$\{item\.id\}`\}/);
  // The ring is an attribute React never manages, and it is removed when the guide folds away or unmounts.
  const component = read("components/judge-tour.tsx");
  assert.match(component, /export const SPOTLIGHT_ATTRIBUTE = "data-tour-spotlight";/);
  assert.match(component, /return \(\) => \{ window\.clearTimeout\(first\); window\.clearInterval\(timer\); lit\?\.removeAttribute\(SPOTLIGHT_ATTRIBUTE\); setSpotlit\(false\); \};/);
  assert.match(component, /if \(!target \|\| state\.collapsed\) return;/);
});
