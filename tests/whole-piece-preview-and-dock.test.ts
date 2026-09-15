import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dockShift, isTextEntry } from "../lib/viewport-dock.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the dock does not move when the viewports agree", () => {
  assert.equal(dockShift(812, 0, 812), 0);
});

test("pinch-zoom and an open keyboard never push the dock down", () => {
  assert.equal(dockShift(812, 200, 400), 0, "zoomed in: the visible area sits inside the layout viewport");
  assert.equal(dockShift(812, 0, 520), 0, "keyboard up: the visible bottom is above the layout bottom");
});

// REGRESSION: on iPhone the tab bar and the Hanger button were drawn part-way up the
// Closet, with garments showing beneath them, after the on-screen keyboard had closed.
test("REGRESSION: a dock stranded above the visible bottom edge is moved down to it", () => {
  assert.equal(dockShift(812, 250, 812), 250, "visual viewport left scrolled below the layout viewport");
  assert.equal(dockShift(562, 0, 812), 250, "innerHeight kept its keyboard-shortened value");
});

test("implausible measurements are ignored rather than throwing the dock off screen", () => {
  assert.equal(dockShift(812, 900, 812), 0);
  assert.equal(dockShift(0, 0, 812), 0);
  assert.equal(dockShift(Number.NaN, 0, 812), 0);
});

test("only elements that raise a keyboard or picker count as typing", () => {
  assert.equal(isTextEntry({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "" }), true);
  assert.equal(isTextEntry({ tagName: "TEXTAREA" }), true);
  assert.equal(isTextEntry({ tagName: "SELECT" }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "checkbox" }), false);
  assert.equal(isTextEntry({ tagName: "BUTTON" }), false);
  assert.equal(isTextEntry(null), false);
});

test("every signed-in screen keeps its bottom controls on the visible edge", () => {
  const shell = read("components/app-shell.tsx");
  assert.match(shell, /import \{ useViewportDock \} from "\.\/use-viewport-dock";/);
  assert.match(shell, /useViewportDock\(\);/);
  const hook = read("components/use-viewport-dock.ts");
  assert.match(hook, /root\.style\.setProperty\("--dock-shift"/);
  assert.match(hook, /window\.visualViewport/);
  assert.match(hook, /removeEventListener\("focusout"/, "listeners must be removed when the shell unmounts");
  const css = read("app/globals.css");
  assert.ok(css.includes(".mobile-tab-bar,.hanger-launcher{translate:0 var(--dock-shift,0px);"));
  assert.ok(css.includes('html[data-keyboard="open"] .mobile-tab-bar,html[data-keyboard="open"] .hanger-launcher{opacity:0;visibility:hidden;pointer-events:none}'),
    "the tab bar must not ride up over a form while someone is typing");
});

test("a detection crop keeps a margin wide enough for a box that clips the garment", () => {
  const route = read("app/api/garments/detect/route.ts");
  assert.match(route, /const CROP_MARGIN=0\.08;/);
  assert.match(route, /bounds\.width\*imageWidth\*CROP_MARGIN/);
  assert.match(route, /bounds\.height\*imageHeight\*CROP_MARGIN/);
});
