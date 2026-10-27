import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { BRAND_PRODUCT_LIMIT, BRAND_STATUS_MESSAGES, brandApproved, brandStatusOf, productLimitMessage } from "../lib/brand-approval.ts";

const brandRoutes = readdirSync(new URL("../app/api/brand/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = (name: string) => read(`app/api/brand/${name}/route.ts`);

/** Every route that acts for a brand, nested ones and Brand Hanger included. */
const BRAND_ROUTE_FILES = [
  "app/api/brand/community-metrics/route.ts",
  "app/api/brand/looks/route.ts",
  "app/api/brand/metrics/route.ts",
  "app/api/brand/products/route.ts",
  "app/api/brand/products/[productId]/route.ts",
  "app/api/brand/products/describe/route.ts",
  "app/api/agents/brand/route.ts",
];

test("every brand route exists and is covered by this guard", () => {
  assert.deepEqual([...brandRoutes].sort(), ["community-metrics", "looks", "metrics", "products"]);
  const nested = readdirSync(new URL("../app/api/brand/products/", import.meta.url), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(nested, ["[productId]", "describe"], "a new nested brand route must be added to BRAND_ROUTE_FILES");
});

test("every brand handler starts with the one shared brand check", () => {
  for (const file of BRAND_ROUTE_FILES) {
    const code = read(file);
    const handlers = [...code.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\(/g)];
    assert.ok(handlers.length > 0, file);
    for (const handler of handlers) {
      const body = code.slice(handler.index, handler.index! + 400);
      assert.match(body, /const access ?= ?await brandAccess\(\);\s*if ?\(!access\.ok\) ?return access\.response;\s*const \{ ?session ?\} ?= ?access;/, `${file} ${handler[1]} must check the brand first`);
    }
    assert.doesNotMatch(code, /getSession\(|session\.role ?!== ?"brand"/, `${file} must not keep a weaker check of its own`);
  }
});

// A signed-out visitor is unauthenticated, not forbidden. Two of these routes once collapsed
// both checks into one 403, which told a Consumer who had simply not signed in that they
// needed a Brand account — sending them to look for the wrong thing.
test("REGRESSION: an absent session is 401, a wrong role is 403, an unapproved brand is 403 with its status", () => {
  const guard = read("lib/server/brand-access.ts");
  assert.match(guard, /if \(!session \|\| !account\) return \{ ok: false, response: NextResponse\.json\(\{ error: "Sign in is required\." \}, \{ status: 401 \}\) \};/);
  assert.match(guard, /if \(!status\) return \{ ok: false, response: NextResponse\.json\(\{ error: "Brand account required\." \}, \{ status: 403 \}\) \};/);
  assert.match(guard, /if \(status !== "approved"\) return \{ ok: false, response: NextResponse\.json\(\{ error: BRAND_STATUS_MESSAGES\[status\], brandStatus: status \}, \{ status: 403 \}\) \};/);
  assert.match(guard, /const session = payload \? sessionForAccount\(payload, account\) : null;/, "the same role and session-version check as every other route");
});

test("every brand route scopes its work to the signed-in account", () => {
  for (const name of brandRoutes) {
    assert.match(source(name), /session\.subject/, `${name} must scope to the signed-in subject, not a client-supplied id`);
  }
});

test("new brands wait for approval; brands from before approval stay approved", () => {
  assert.equal(brandStatusOf({ role: "brand" }), "approved", "the live brands and judge accounts have no status, and keep working");
  assert.equal(brandStatusOf({ role: "brand", brandStatus: "approved" }), "approved");
  assert.equal(brandStatusOf({ role: "brand", brandStatus: "pending" }), "pending");
  assert.equal(brandStatusOf({ role: "brand", brandStatus: "revoked" }), "revoked");
  for (const odd of [null, "", "APPROVED", "yes", true, 1]) assert.equal(brandStatusOf({ role: "brand", brandStatus: odd }), "pending", `an unexpected status (${String(odd)}) is never approval`);
  assert.equal(brandStatusOf({ role: "consumer" }), null);
  assert.equal(brandStatusOf(null), null);
  assert.equal(brandApproved({ role: "consumer" }), false);
  assert.ok(BRAND_STATUS_MESSAGES.pending.includes("waiting for approval"));
  const store = read("lib/server/production-store.ts");
  const create = store.slice(store.indexOf("export async function createAccount"), store.indexOf("export async function otherBrandNames"));
  assert.match(create, /const account:AccountRecord=\{\.\.\.\(input\.role==="brand"\?\{brandStatus:"pending" as const\}:\{\}\),id,/, "every brand registered from now on starts pending");
  const register = read("app/api/auth/register/route.ts");
  assert.doesNotMatch(register, /brandStatus/, "nothing a caller sends can set the status");
});

test("a brand that is not approved sees why, and its products leave the public registry", () => {
  const page = read("app/brand/page.tsx");
  assert.match(page, /if\(status==="pending"\|\|status==="revoked"\)return <BrandApprovalNotice/);
  const store = read("lib/server/production-store.ts");
  const registry = store.slice(store.indexOf("export async function listRegistryProducts"), store.indexOf("export async function catalogImageUrl"));
  assert.match(registry, /const hidden=await unapprovedBrandOwners\(/);
  assert.match(registry, /if\(!brandApproved\(account\)\)hidden\.add\(String\(account\.id\)\)/);
});

test("a brand's catalog stops at 300 products, checked early and enforced in the write", () => {
  assert.equal(BRAND_PRODUCT_LIMIT, 300);
  assert.match(productLimitMessage(300), /limit of 300 products/);
  const route = read("app/api/brand/products/route.ts");
  assert.ok(route.indexOf("brandProductCount(access.account)>=BRAND_PRODUCT_LIMIT") < route.indexOf("readCappedFormData(request)"), "a full catalog is refused before any photo is read");
  const store = read("lib/server/production-store.ts");
  const save = store.slice(store.indexOf("export async function saveBrandProduct"), store.indexOf("/** Whether brand sharing is on"));
  assert.match(save, /new TransactWriteCommand\(\{TransactItems:\[/, "the product and the count are written together or not at all");
  assert.match(save, /UpdateExpression:"SET productCount = productCount \+ :one",ConditionExpression:"productCount < :limit"/, "so requests sent at once cannot pass the limit");
  assert.match(save, /reasons\[1\]\?\.Code==="ConditionalCheckFailed"\)throw new RequestRefused\(productLimitMessage\(limit\),409\)/);
  const count = store.slice(store.indexOf("export async function brandProductCount"), store.indexOf("export async function saveBrandProduct"));
  assert.match(count, /Select:"COUNT",ConsistentRead:true/, "a brand from before the limit is counted once from its real catalog");
  assert.match(count, /ConditionExpression:"attribute_exists\(PK\) AND attribute_not_exists\(productCount\)"/, "and the count is set only if none exists");
});

test("aggregate release stays behind the cohort threshold and the enumeration budget", () => {
  const privacy = read("lib/privacy.ts");
  assert.match(privacy, /export const MINIMUM_COHORT_SIZE = 25;/);
  assert.match(privacy, /export function exceedsEnumerationBudget/);
  const store = read("lib/server/production-store.ts");
  // Ownership is verified against the brand's own partition before any aggregate is built.
  assert.ok(store.includes("Key:{PK:`USER#${ownerId}`,SK:`PRODUCT#${productId}`}"),
    "an aggregate must be gated on a product read from the brand's own partition");
  assert.ok(store.includes('if(!owned.Item)throw new RequestRefused("Product not found for this brand account.", 404);'),
    "a product outside the account must be refused before any aggregate work");
  assert.ok(store.includes("await enforceAggregateEnumerationBudget(ownerId,productId);"),
    "the enumeration budget must run before the aggregate is built");
});
