import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STALE_VIEWPORT_MIN_GAP, dockShift, isTextEntry, staleViewportShift } from "../lib/viewport-dock.ts";

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
  // REGRESSION: an aria-label of "Ask Hanger" hid the launcher's second visible line from its
  // accessible name, which axe 4.14 flags (label-content-name-mismatch, WCAG 2.5.3). The button is
  // named by its own text instead.
  const launcher = read("components/hanger-dock.tsx").match(/<button ref=\{launcher\}[^>]*>/)?.[0] ?? "";
  assert.ok(launcher.includes('className="hanger-launcher"'), launcher);
  assert.doesNotMatch(launcher, /aria-label/, "the launcher is named by what it shows");
  // On a phone the words are hidden visually, never with display:none, so they still name the button.
  assert.doesNotMatch(css, /\.hanger-launcher-copy\{display:none\}/);
  assert.ok(css.includes(".hanger-launcher-copy{position:absolute;width:1px;height:1px;"));
});

// REGRESSION: object-fit:contain alone was not enough. The intake tile's grid row was sized
// by its content, so the image's height:100% resolved to nothing and a tall photograph
// (measured 729px in a 300px tile) still showed only its middle band.
test("REGRESSION: the intake tile gives its image a definite track so contain can contain", () => {
  const css = read("app/globals.css");
  assert.ok(css.includes(".intake-cutout{grid-template:minmax(0,1fr)/minmax(0,1fr);overflow:hidden}"));
  assert.ok(css.indexOf(".intake-cutout{grid-template:") < css.indexOf(".intake-cutout.photo{background:var(--cream)"),
    "the track rule must precede the photo tile rule it supports");
});

test("a detection crop keeps a margin wide enough for a box that clips the garment", () => {
  const route = read("app/api/garments/detect/route.ts");
  assert.match(route, /const CROP_MARGIN=0\.08;/);
  assert.match(route, /bounds\.width\*imageWidth\*CROP_MARGIN/);
  assert.match(route, /bounds\.height\*imageHeight\*CROP_MARGIN/);
});

// REGRESSION (owner's phone recording, 2026-11-13): after a demo purchase in another tab and a return
// to Community, the tab bar and the judge guide sat a keyboard's height up the screen and moved with
// the page. iOS had kept a keyboard-shortened height for BOTH viewports, so dockShift saw two
// viewports that agreed and moved nothing.
test("REGRESSION: both viewports left keyboard-short with no keyboard up bring the dock back down", () => {
  assert.equal(dockShift(482, 0, 482), 0, "dockShift alone cannot see this state");
  assert.equal(staleViewportShift(482, 812, false), 330);
  assert.equal(staleViewportShift(482, 812, true), 0, "a real keyboard is meant to shorten the screen");
  assert.equal(staleViewportShift(812 - 90, 812, false), 0, "a toolbar showing is a small change, not a stranded viewport");
  assert.equal(staleViewportShift(812 - STALE_VIEWPORT_MIN_GAP, 812, false), STALE_VIEWPORT_MIN_GAP);
  assert.equal(staleViewportShift(812, 812, false), 0);
  assert.equal(staleViewportShift(482, 0, false), 0, "no baseline yet: nothing to compare with");
  assert.equal(staleViewportShift(Number.NaN, 812, false), 0);
  const hook = read("components/use-viewport-dock.ts");
  assert.match(hook, /if \(!coarsePointer\.matches\) return 0;/, "touch screens only");
  assert.match(hook, /\(window\.visualViewport\?\.scale \?\? 1\) > 1\.01\) return 0;/, "never while pinch-zoomed");
  assert.match(hook, /window\.sessionStorage\.setItem\(baselineKey\(baselineWidth\)/, "the full height survives a fresh page load");
  for (const event of ['"visibilitychange", onReturn', '"pageshow", onReturn', '"focus", onReturn']) assert.ok(hook.includes(event), event);
  assert.match(read("app/globals.css"), /\.judge-tour,\.judge-tour-pill\{translate:0 var\(--dock-shift,0px\)\}/, "the guide moves with the tab bar");
});

test("the viewport readout appears only on request and reads the screen, nothing else", () => {
  const debug = read("components/viewport-debug.tsx");
  assert.match(debug, /get\("viewport"\) !== "debug"\) return;/);
  assert.doesNotMatch(debug, /fetch\(|localStorage|sessionStorage|sendBeacon/);
  assert.match(read("components/app-shell.tsx"), /<ViewportDebug\/>/);
});
