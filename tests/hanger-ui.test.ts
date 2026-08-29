import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dock = read("components/hanger-dock.tsx");
const panels = read("components/agent-panels.tsx");
const css = read("app/globals.css");

test("the Hanger drawer behaves like a dialog, not just markup that says dialog", () => {
  assert.match(dock, /aria-modal="true"/);
  assert.match(dock, /event\.key === "Escape"/, "Escape must dismiss the drawer");
  assert.match(dock, /document\.body\.style\.overflow = "hidden"/, "the page behind a modal must not scroll");
  assert.match(dock, /drawer\.current\?\.focus\(\)/, "opening must move focus into the drawer");
  assert.match(dock, /openedBy\?\.focus\(\)/, "closing must return focus to the launcher");
});

test("the launcher says what Hanger will do rather than only naming it", () => {
  assert.match(dock, /Outfits from your wardrobe/);
  assert.match(dock, /Wear patterns & strategy/);
});

// REGRESSION: the log carried a 48vh cap inside a full-height drawer, so the outfit
// Hanger had just built — the part of a reply people act on — was cut off mid-image.
test("REGRESSION: the conversation fills the drawer instead of a fixed fraction of the viewport", () => {
  assert.doesNotMatch(css, /\.hanger-chat-log\{[^}]*max-height:\d+vh/, "a viewport-fraction cap clips the outfit preview");
  assert.match(css, /\.hanger-drawer\{[^}]*display:flex[^}]*flex-direction:column/, "the drawer must be a flex column");
  assert.match(css, /\.hanger-chat-log\{[^}]*flex:1 1 auto/, "the log must take the remaining height");
  assert.match(css, /\.hanger-composer-shell\{[^}]*flex:0 0 auto/, "the composer must stay pinned below it");
});

test("suggested prompts are scaffolding for a blank conversation, not permanent furniture", () => {
  assert.match(panels, /showPrompts=\{!entries\.some\(\(entry\) => entry\.role === "user"\)\}/);
  assert.match(panels, /\{showPrompts && <div className="hanger-suggestions"/);
});

test("a reply in flight is visible in the conversation, not only on the send button", () => {
  assert.match(panels, /hanger-thinking/);
  assert.match(panels, /aria-label="Hanger is thinking"/);
  assert.match(css, /@keyframes hanger-blink/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.hanger-thinking i,\.hanger-send-busy\{animation:none\}\}/, "the indicator must respect reduced motion");
});

test("scoring detail folds away while the outfit and its actions stay open", () => {
  assert.match(panels, /<details className="hanger-reasoning">/);
  // The preview and the action buttons must sit outside the disclosure.
  const detailsAt = panels.indexOf('<details className="hanger-reasoning">');
  assert.ok(panels.indexOf('className="hanger-outfit-preview"') < detailsAt, "the chosen pieces must not be hidden behind a disclosure");
  assert.ok(panels.indexOf('className="agent-actions"') < detailsAt, "Save and Record must not be hidden behind a disclosure");
  assert.ok(panels.indexOf("reply.evidence.map") > detailsAt, "evidence belongs inside the disclosure");
});

test("the keyboard contract is stated rather than left to be discovered", () => {
  assert.match(panels, /Enter sends · Shift \+ Enter adds a line/);
  assert.match(panels, /event\.key === "Enter" && !event\.shiftKey/);
});

test("the composer keeps an accessible label without printing a redundant heading", () => {
  assert.match(panels, /className="sr-only" htmlFor=\{`hanger-\$\{label\}`\}/);
  assert.match(panels, /aria-label="Send message to Hanger"/);
  // The drawer header already identifies Hanger; a second in-panel heading repeated it
  // and pushed the conversation below the fold.
  assert.doesNotMatch(panels, /agent-heading/);
  assert.doesNotMatch(panels, /Talk through your wardrobe/);
});

test("body text stays at a readable size", () => {
  const tiny = [...css.matchAll(/\.hanger-[a-z-]+[^{]*\{[^}]*font-size:\.(\d)(\d?)rem/g)]
    .filter((match) => Number(`0.${match[1]}${match[2] ?? ""}`) < 0.6)
    .map((match) => match[0].slice(0, 60));
  assert.deepEqual(tiny, [], `Hanger rules still using sub-0.6rem text: ${tiny.join(" | ")}`);
});

test("the brand panel still states its own privacy boundary", () => {
  assert.match(panels, /cannot access names, emails, photos, or individual wardrobes/);
  assert.match(dock, /AGGREGATES ONLY/);
  assert.match(dock, /PRIVATE CONTEXT/);
});
