import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const brandRoutes = readdirSync(new URL("../app/api/brand/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const source = (name: string) => readFileSync(new URL(`../app/api/brand/${name}/route.ts`, import.meta.url), "utf8");

test("every brand route exists and is covered by this guard", () => {
  assert.deepEqual([...brandRoutes].sort(), ["community-metrics", "looks", "metrics", "products"]);
});

// A signed-out visitor is unauthenticated, not forbidden. Two of these routes collapsed
// both checks into one 403, which told a Consumer who had simply not signed in that they
// needed a Brand account — sending them to look for the wrong thing.
test("REGRESSION: an absent session is 401, a wrong role is 403", () => {
  for (const name of brandRoutes) {
    const code = source(name);
    assert.match(code, /if\(!session\)return NextResponse\.json\(\{error:"Sign in is required\."\},\{status:401\}\);/,
      `${name} must answer an absent session with 401`);
    assert.match(code, /if\(session\.role!=="brand"\)return NextResponse\.json\(\{error:"Brand account required\."\},\{status:403\}\);/,
      `${name} must answer a non-brand session with 403`);
    assert.doesNotMatch(code, /if\(!session\|\|session\.role!=="brand"\)/,
      `${name} must not collapse authentication and authorisation into one answer`);
  }
});

test("every brand route scopes its work to the signed-in account", () => {
  for (const name of brandRoutes) {
    assert.match(source(name), /session\.subject/, `${name} must scope to the signed-in subject, not a client-supplied id`);
  }
});

test("aggregate release stays behind the cohort threshold and the enumeration budget", () => {
  const privacy = readFileSync(new URL("../lib/privacy.ts", import.meta.url), "utf8");
  assert.match(privacy, /export const MINIMUM_COHORT_SIZE = 25;/);
  assert.match(privacy, /export function exceedsEnumerationBudget/);
  const store = readFileSync(new URL("../lib/server/production-store.ts", import.meta.url), "utf8");
  // Ownership is verified against the brand's own partition before any aggregate is built.
  assert.ok(store.includes("Key:{PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`}"),
    "an aggregate must be gated on a product read from the brand's own partition");
  assert.ok(store.includes('if(!owned.Item)throw new Error("Product not found for this brand account.");'),
    "a product outside the account must be refused before any aggregate work");
  assert.ok(store.includes("await enforceAggregateEnumerationBudget(ownerId,productId);"),
    "the enumeration budget must run before the aggregate is built");
});
