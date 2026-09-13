import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolveTypedGarmentType, garmentTypeSuggestions } from "../lib/garment-taxonomy.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a typed type that names a controlled subtype resolves to it", () => {
  assert.deepEqual(resolveTypedGarmentType("shoe", "Chelsea boot"), { category: "shoe", subtype: "chelsea-boots", customType: null });
  assert.deepEqual(resolveTypedGarmentType("bottom", "shorts"), { category: "bottom", subtype: "shorts", customType: null });
  assert.deepEqual(resolveTypedGarmentType("shoe", "High-Top Sneakers"), { category: "shoe", subtype: "high-top-sneakers", customType: null });
});

test("a longer description resolves to the most specific subtype it contains", () => {
  // "sneakers" is contained too; the longer "high top sneakers" must win.
  assert.equal(resolveTypedGarmentType("shoe", "white high top sneakers")?.subtype, "high-top-sneakers");
  assert.equal(resolveTypedGarmentType("bottom", "khaki cargo shorts")?.subtype, "shorts");
});

// REGRESSION: the server's normaliser maps unknown words to the category's "other" entry.
// Before this, whatever a person typed was silently discarded on the way to that fallback.
test("REGRESSION: words that fit no subtype are kept rather than discarded", () => {
  const typed = resolveTypedGarmentType("shoe", "jordan 3 retro");
  assert.equal(typed?.subtype, "other-shoes", "outfit logic still gets a controlled value");
  assert.equal(typed?.customType, "Jordan 3 Retro", "and the person's own words survive");
});

// REGRESSION: a patch once wrote the whitespace pattern without its backslash, so every letter
// "s" was deleted from typed words ("Chelsea" became "Chela"). The first test above could not
// catch it because "Jordan 3 Retro" contains no "s".
test("REGRESSION: typed words keep every letter and collapse only real whitespace", () => {
  assert.equal(resolveTypedGarmentType("shoe", "jordan 3s   retro")?.customType, "Jordan 3s Retro");
  const store = read("lib/server/production-store.ts");
  assert.match(store, /customType\.replace\(\/\[\\u0000-\\u001f\\u007f\]\/g,""\)\.replace\(\/\\s\+\/g," "\)/,
    "the server must strip control characters and collapse whitespace, not the letter s");
  assert.doesNotMatch(store, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/, "no raw control character may sit in source");
  const taxonomy = read("lib/garment-taxonomy.ts");
  assert.match(taxonomy, /replace\(\/\\s\+\/g, " "\)/);
  assert.match(taxonomy, /"\\\\\$&"/, "subtype phrases must be regex-escaped with the matched text");
});

test("an unknown category can be settled by what the person typed", () => {
  assert.deepEqual(resolveTypedGarmentType("unknown", "hoodie"), { category: "top", subtype: "hoodie", customType: null });
});

test("an empty field resolves to nothing, and typed words are bounded", () => {
  assert.equal(resolveTypedGarmentType("top", "   "), null);
  const long = resolveTypedGarmentType("accessory", "x".repeat(200));
  assert.ok((long?.customType ?? "").length <= 60);
});

test("suggestions cover every subtype in the category with display labels", () => {
  const shoes = garmentTypeSuggestions("shoe");
  assert.ok(shoes.some((option) => option.label === "Chelsea Boots"));
  assert.ok(garmentTypeSuggestions("shoe", "single").some((option) => option.label === "Chelsea Boot"));
});

test("the saved garment keeps a typed type only beside a fallback subtype", () => {
  const store = read("lib/server/production-store.ts");
  assert.match(store, /const customType=typedType&&classification\.subtype\.startsWith\("other-"\)\?typedType:null;/,
    "a custom label must never contradict a controlled subtype");
  assert.match(store, /\.replace\(\/\[\\u0000-\\u001f\\u007f\]\/g,""\)/, "control characters are stripped before storage");
  assert.match(store, /\.slice\(0,60\)/);
  assert.match(read("lib/types.ts"), /customType\?: string \| null;/);
});

test("intake offers a typeable Type field, not a fixed list", () => {
  const intake = read("components/garment-intake.tsx");
  assert.match(intake, /<label>Type<input value=\{piece\.typeText\}/);
  assert.match(intake, /list=\{`intake-types-\$\{piece\.id\}`\}/);
  assert.match(intake, /<datalist id=\{`intake-types-\$\{piece\.id\}`\}>/);
  assert.doesNotMatch(intake, /<label>Type<select/, "the fixed-list Type field must be gone");
  assert.match(intake, /customType: piece\.overrides\.customType \?\? null/, "typed words must reach the server");
});

// The reported complaint: a message should not block out the image. The hint must live
// in the fields block, after the photograph, and nothing in intake may be positioned over it.
test("REGRESSION: the not-sure message sits under the field, never over the photograph", () => {
  const intake = read("components/garment-intake.tsx");
  const photoAt = intake.indexOf('className={`intake-cutout');
  const fieldsAt = intake.indexOf('<div className="intake-fields">');
  const hintAt = intake.indexOf('className="intake-type-hint"');
  assert.ok(photoAt > 0 && fieldsAt > photoAt && hintAt > fieldsAt, "order must be photograph, then fields, then hint");
  assert.doesNotMatch(intake, /className="intake-manual"/, "the old message between photo and fields is replaced");
  assert.match(intake, /AI could not classify this photo/);

  const css = read("app/globals.css");
  const intakeRules = [...css.matchAll(/(\.intake[a-zA-Z0-9_ .>:-]*)\{([^}]*)\}/g)];
  const overlaid = intakeRules.filter(([, , body]) => /position:(absolute|fixed)/.test(body)).map(([, selector]) => selector);
  assert.deepEqual(overlaid, [], `intake rules must not position anything over the photograph: ${overlaid.join(", ")}`);
});

test("a piece with an unknown category cannot be saved into outfits unlabelled", () => {
  assert.match(read("components/garment-intake.tsx"), /Choose a category for every selected piece so it can be used in outfits\./);
});

test("the closet shows the person's own words for a garment's type", () => {
  assert.match(read("components/consumer-dashboard.tsx"), /\{item\.customType\?`\$\{item\.customType\} · `:""\}/);
});

test("the superseded look-scan uploader is gone, not merely unused", () => {
  assert.equal(existsSync(new URL("../components/look-scan-uploader.tsx", import.meta.url)), false);
  assert.doesNotMatch(read("app/globals.css"), /\.look-piece-card/);
});
