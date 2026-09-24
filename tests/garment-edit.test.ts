import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyGarmentEdit, GarmentEditRefused, isVerifiedPiece, readGarmentEdit } from "../lib/garment-edit.ts";
import type { BrandProductRegistration } from "../lib/platform-types.ts";
import type { WardrobeItem } from "../lib/types.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const piece = (overrides: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id: "g1", name: "Versatile Sweatshirt", category: "top", subtype: "sweatshirt", color: "black", pattern: "graphic",
  material: "cotton", style: ["streetwear"], season: "all-season", wearCount: 7, lastWornDays: 3, source: "ai-confirmed",
  art: "photo", imageKey: "wardrobe/owner/g1.png", identityStatus: "unverified", brand: null, sku: null,
  ...overrides,
} as WardrobeItem);

const registry = [
  { id: "p-flag", name: "\"Flag\" Tee shirt", brand: "Versatile", sku: "VR-FLAG", category: "top", price: 45, currency: "USD" },
  { id: "p-old", name: "Old Tee", brand: "Versatile", sku: "VR-OLD", category: "top", archived: true },
] as unknown as BrandProductRegistration[];

const NEVER_WRITTEN = ["wearCount", "lastWornDays", "lastWornAt", "imageKey", "evidenceImageKey", "registryProductId", "id", "createdAt", "source"];

// The point of the feature: a misread type no longer means deleting the piece and its wear history.
test("a misread piece is corrected in place, and its wear history is untouched", () => {
  const changes = applyGarmentEdit(piece(), readGarmentEdit({ name: "Versatile Flag Tee", category: "top", subtype: "t-shirt" }));
  assert.equal(changes.name, "Versatile Flag Tee");
  assert.equal(changes.subtype, "t-shirt");
  for (const field of NEVER_WRITTEN) assert.ok(!(field in changes), `${field} is never written by an edit`);
});

test("a body naming wear history, photos, or registry identity changes nothing", () => {
  assert.throws(() => readGarmentEdit({ wearCount: 999, registryProductId: "p-flag", imageKey: "wardrobe/other/x.png" }), GarmentEditRefused, "unknown keys are dropped, leaving nothing to change");
  const edit = readGarmentEdit({ name: "Tee", wearCount: 999, identityStatus: "verified" });
  assert.deepEqual(Object.keys(edit), ["name"], "only the known field survives");
});

// REGRESSION guard for the identity boundary: a form can never alter a care-label verification.
test("a verified piece keeps its brand details; everything else can still be edited", () => {
  const verified = piece({ identityStatus: "verified", brand: "Versatile", sku: "VR-FLAG", registryProductId: "p-flag" } as Partial<WardrobeItem>);
  for (const edit of [{ brand: "Something Else" }, { catalogProductId: "p-flag" }, { catalogProductId: null }]) {
    assert.throws(() => applyGarmentEdit(verified, readGarmentEdit(edit), registry), (error: unknown) => error instanceof GarmentEditRefused && error.status === 409);
  }
  const renamed = applyGarmentEdit(verified, readGarmentEdit({ name: "My favourite tee", color: "washed black" }), registry);
  assert.equal(renamed.name, "My favourite tee");
  assert.ok(!("identityStatus" in renamed) && !("brand" in renamed) && !("sku" in renamed), "the verified link is left exactly as it is");
});

test("choosing a catalog product links it as the person's own pick, never as verified", () => {
  const changes = applyGarmentEdit(piece(), readGarmentEdit({ catalogProductId: "p-flag" }), registry);
  assert.equal(changes.identityStatus, "owner-selected");
  assert.equal(changes.selectedProductId, "p-flag");
  assert.equal(changes.brand, "Versatile");
  assert.equal(changes.sku, "VR-FLAG");
  assert.equal(changes.listedPrice, 45);
  assert.ok(!("registryProductId" in changes), "a pick never joins the brand's owner index");
  assert.throws(() => applyGarmentEdit(piece(), readGarmentEdit({ catalogProductId: "p-old" }), registry), GarmentEditRefused, "a retired product cannot be chosen");
  assert.throws(() => applyGarmentEdit(piece(), readGarmentEdit({ catalogProductId: "nope" }), registry), GarmentEditRefused);
});

test("unlinking a pick, or typing a brand over it, clears the product and its price together", () => {
  const picked = piece({ identityStatus: "owner-selected", brand: "Versatile", sku: "VR-FLAG", selectedProductId: "p-flag", listedPrice: 45, listedCurrency: "USD" });
  const unlinked = applyGarmentEdit(picked, readGarmentEdit({ catalogProductId: null }));
  assert.equal(unlinked.selectedProductId, null);
  assert.equal(unlinked.listedPrice, null);
  assert.equal(unlinked.identityStatus, "unverified");
  const retyped = applyGarmentEdit(picked, readGarmentEdit({ brand: "Stussy" }));
  assert.equal(retyped.brand, "Stussy");
  assert.equal(retyped.selectedProductId, null, "one brand's price never sits beside another brand's name");
  assert.equal(retyped.identityStatus, "user-labeled");
});

test("types follow the same rules as a scan", () => {
  const custom = applyGarmentEdit(piece(), readGarmentEdit({ category: "top", subtype: "other-top", customType: "Rugby Jersey" }));
  assert.equal(custom.customType, "Rugby Jersey", "a typed type is kept beside a fallback subtype");
  const controlled = applyGarmentEdit(piece({ customType: "Rugby Jersey", subtype: "other-top" } as Partial<WardrobeItem>), readGarmentEdit({ subtype: "polo" }));
  assert.equal(controlled.customType, null, "and dropped once a controlled type fits");
  const shoeToTop = applyGarmentEdit(piece({ category: "shoe", subtype: "sneakers", wearableUnit: "pair" } as Partial<WardrobeItem>), readGarmentEdit({ category: "top", subtype: "t-shirt" }));
  assert.equal(shoeToTop.wearableUnit, "single", "only shoes come in pairs");
});

test("an edit is validated like a scan", () => {
  assert.throws(() => readGarmentEdit({ name: "   " }), GarmentEditRefused);
  assert.throws(() => readGarmentEdit({ season: "monsoon" }), GarmentEditRefused);
  assert.throws(() => readGarmentEdit({ color: "" }), GarmentEditRefused);
  assert.equal(readGarmentEdit({ style: Array.from({ length: 20 }, (_, index) => `style ${index}`) }).style?.length, 8);
  assert.equal(readGarmentEdit({ name: "Tee\u0000\u0007 with\nnewline" }).name, "Tee with newline", "control characters are stripped");
});

test("the route edits only the signed-in owner's piece, through a fixed allowlist", () => {
  const route = read("app/api/consumer/wardrobe/route.ts");
  assert.match(route, /export async function PATCH/);
  assert.match(route, /updateWardrobeItem\(session\.subject,itemId,readGarmentEdit\(body\?\.edit\)\)/, "the owner is the session, never the body");
  assert.match(route, /RATE_LIMIT_RULES\.garmentEdit/);
  const store = read("lib/server/production-store.ts");
  assert.match(store, /const EDITABLE_GARMENT_FIELDS = new Set\(\[/);
  assert.doesNotMatch(/const EDITABLE_GARMENT_FIELDS = new Set\(\[([^\]]*)\]\)/.exec(store)?.[1] ?? "", /wearCount|lastWorn|imageKey|registryProductId|GSI1/, "the store's own allowlist excludes history, photos, and registry identity");
  assert.match(store, /ConditionExpression:"attribute_exists\(PK\)",ExpressionAttributeNames:names/, "an edit can never create a record");
});

test("the Closet offers Edit beside Delete, and the form sends only what changed", () => {
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /aria-label=\{`Edit piece: \$\{item\.name\}`\}/);
  assert.match(dashboard, /<GarmentEditor item=\{item\}/);
  const editor = read("components/garment-editor.tsx");
  assert.match(editor, /function changes\(\): GarmentEdit/);
  assert.match(editor, /Brand details come from the care label and cannot be changed here/);
  assert.match(editor, /Wear history and the photo stay as they are/);
});

// REGRESSION (found in review): a piece verified before identityStatus existed has no status, but
// sits in its brand's owner index with a registry id. The edit rules read only the status, so its
// brand could be rewritten to another brand while the first brand kept counting it and its wears.
test("REGRESSION: an older verified piece with no status field still keeps its brand details", () => {
  const legacy = piece({ brand: "Northstar Atelier", sku: "NA-OW-1042", registryProductId: "registry-na-ow-1042", identityStatus: undefined } as Partial<WardrobeItem>);
  for (const edit of [{ brand: "Stussy" }, { catalogProductId: "p-flag" }, { catalogProductId: null }]) {
    assert.throws(() => applyGarmentEdit(legacy, readGarmentEdit(edit), registry), (error: unknown) => error instanceof GarmentEditRefused && error.status === 409);
  }
  const indexOnly = { ...piece({ identityStatus: undefined }), GSI1PK: "PRODUCT#registry-na-ow-1042" } as unknown as WardrobeItem;
  assert.throws(() => applyGarmentEdit(indexOnly, readGarmentEdit({ brand: "Stussy" })), GarmentEditRefused, "the owner-index key alone marks it verified");
  assert.equal(isVerifiedPiece(piece()), false, "an ordinary piece is not");
  assert.equal(isVerifiedPiece(piece({ identityStatus: "owner-selected", selectedProductId: "p-flag" })), false, "nor is an owner's pick");
  // The Closet card and the edit form use the same rule, so they cannot disagree about a piece.
  assert.match(read("components/consumer-dashboard.tsx"), /\{isVerifiedPiece\(item\)\?<span className="confirmed brand-verified">/);
  assert.match(read("components/garment-editor.tsx"), /const verified = isVerifiedPiece\(item\);/);
});
