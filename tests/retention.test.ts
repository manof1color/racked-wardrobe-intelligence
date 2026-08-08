import test from "node:test";
import assert from "node:assert/strict";
import { computeRetentionSignal } from "../lib/retention.ts";
import { runBrandRetentionAgent } from "../lib/agents.ts";
import { catalog } from "../lib/demo-data.ts";
import { MINIMUM_COHORT_SIZE } from "../lib/privacy.ts";

test("retention signal is suppressed for the same below-threshold cohort as the wear-rate agent", () => {
  const smallCohortProduct = catalog.find((product) => product.id === "p7")!;
  const signal = computeRetentionSignal(smallCohortProduct);
  assert.equal(signal.status, "suppressed");
  assert.equal(signal.percentChange, null);
  assert.equal(signal.recentTotal, null);
  assert.equal(signal.priorTotal, null);
});

test("retention signal produces a real, non-degenerate spread across the seeded catalog", () => {
  const statuses = catalog.map((product) => computeRetentionSignal(product).status);
  // Emergent from the deterministic per-product bias, not hand-picked — same discipline as
  // the k-anonymity suppression case: this asserts the real computed spread exists, not a
  // constant. If the underlying formula or catalog changes, this is meant to fail and be re-tuned.
  assert.ok(statuses.some((status) => status === "at-risk" || status === "softening"), "expected at least one declining product");
  assert.ok(statuses.some((status) => status === "stable" || status === "rising"), "expected at least one non-declining, released product");
  assert.ok(statuses.includes("suppressed"), "expected the below-threshold product to be suppressed");
});

test("computeRetentionSignal never returns a percentChange for a suppressed cohort, and always returns one otherwise", () => {
  for (const product of catalog) {
    const signal = computeRetentionSignal(product);
    if (signal.cohortSize < MINIMUM_COHORT_SIZE) {
      assert.equal(signal.status, "suppressed");
      assert.equal(signal.percentChange, null);
    } else {
      assert.notEqual(signal.status, "suppressed");
      assert.equal(typeof signal.percentChange, "number");
    }
  }
});

test("brand retention agent suppresses the same way the wear-rate agent does, with no action offered", () => {
  const reply = runBrandRetentionAgent("p7");
  assert.equal(reply.agent, "brand-retention");
  assert.equal(reply.confidence, "low");
  assert.match(reply.message, /below the minimum/i);
  assert.equal(reply.actions.length, 0);
});

test("brand retention agent offers a re-engagement action for a declining product and a steady-state action otherwise", () => {
  const decliningProduct = catalog.find((product) => {
    const status = computeRetentionSignal(product).status;
    return status === "at-risk" || status === "softening";
  });
  const stableOrRisingProduct = catalog.find((product) => {
    const status = computeRetentionSignal(product).status;
    return status === "stable" || status === "rising";
  });
  assert.ok(decliningProduct, "fixture assumption: at least one seeded product must be declining");
  assert.ok(stableOrRisingProduct, "fixture assumption: at least one seeded product must not be declining");

  const decliningReply = runBrandRetentionAgent(decliningProduct!.id);
  assert.ok(decliningReply.actions.some((action) => action.payload.segment === "re-engagement"));

  const stableReply = runBrandRetentionAgent(stableOrRisingProduct!.id);
  assert.ok(stableReply.actions.some((action) => action.payload.segment === "steady-state"));
});

test("a consumer revoking brand-data consent can shift (never suppress-to-release) the retention cohort size", () => {
  const product = catalog.find((p) => p.id === "p1")!;
  const withConsent = computeRetentionSignal(product, { optedIn:true, wardrobe:[] });
  const withoutConsent = computeRetentionSignal(product, { optedIn:false, wardrobe:[] });
  assert.ok(withConsent.cohortSize >= withoutConsent.cohortSize);
});
