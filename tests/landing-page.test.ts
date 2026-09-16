import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/page.tsx");
const flywheel = read("components/flywheel.tsx");
const css = read("app/globals.css");

/** Declaration blocks whose selector names a landing class. */
function landingRules() {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }))
    .filter(({ selector }) => /\.lp(?![\w-])|\.lp-/.test(selector));
}

// REGRESSION: the previous hero card was absolutely positioned and, measured at 1280×820,
// covered the headline, the paragraph, and the "Create your wardrobe" button.
test("REGRESSION: nothing in the hero is positioned over its copy", () => {
  const hero = landingRules().filter(({ selector }) => /\.lp-(hero|visual|card)/.test(selector));
  assert.ok(hero.some(({ selector, body }) => selector === ".lp-hero" && /display:grid/.test(body)), "the hero is a grid");
  const positioned = hero.filter(({ body }) => /position:(absolute|fixed)/.test(body)).map(({ selector }) => selector);
  assert.deepEqual(positioned, []);
  assert.doesNotMatch(page, /hero-board/);
});

test("landing text stays readable: no rule sets text below 0.72rem", () => {
  const tiny = landingRules().flatMap(({ selector, body }) =>
    [...body.matchAll(/font-size:([\d.]+)rem/g)].filter(([, size]) => Number(size) < 0.72).map(([, size]) => `${selector} ${size}rem`));
  assert.deepEqual(tiny, []);
});

test("motion is progressive, never hides content, and respects reduced motion", () => {
  assert.match(css, /@supports \(animation-timeline: view\(\)\)\{\s*\.lp-reveal\{/, "scroll reveal only where supported");
  assert.match(css, /@keyframes lp-reveal\{from\{opacity:\.35;/, "sections start partly visible");
  assert.match(css, /@keyframes lp-rise\{from\{opacity:\.15;/);
  assert.doesNotMatch(css, /@keyframes lp-[a-z-]+\{from\{opacity:0[;}]/, "no landing animation starts invisible");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{\s*\.lp,\.lp \*\{animation:none!important;transition:none!important\}/);
});

test("illustrative figures are labelled as examples, and nothing claims results", () => {
  assert.equal(page.match(/className="lp-tag">Example</g)?.length, 2);
  assert.match(page, /role="img" aria-label="Example:/);
  assert.doesNotMatch(page + flywheel, /sales lift|conversion rate|purchase intent|increases? sales|guarantee/i);
});

test("the page still leads people where they need to go", () => {
  for (const href of ["/login", "/community", "/pricing", "/privacy", "/terms", "/partners/clothing", "#how-it-works"]) {
    assert.ok(page.includes(`href="${href}"`), `missing link to ${href}`);
  }
  assert.match(page, /id="how-it-works"/);
});

test("the retired landing styles are gone rather than overridden", () => {
  assert.doesNotMatch(css, /\.(hero-board|match-connector|proof-strip|step-grid|flywheel-consumer|landing-shell)(?![\w-])/);
});
