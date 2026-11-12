import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");

// REGRESSION: 277 rules set text below 12px, down to 6.4px (.4rem) for score labels and 7px for
// the phone tab labels. Nothing in the stylesheet goes below 12px now, except the phone tab-bar
// labels at 10px, the size iOS itself uses for tab bars, which fits "Community" in a sixth of a
// 375px-wide phone.
test("REGRESSION: no text is set below 12px, apart from the 10px phone tab labels", () => {
  const sizes = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) =>
    [...body.matchAll(/font(?:-size)?:(?:\d{3} )?(\.\d+)rem/g)]
      .filter(([, size]) => Number(size) < 0.75)
      .map(([, size]) => `${selector.trim()} ${size}rem`));
  assert.deepEqual(sizes, [".mobile-tab-bar small .625rem"]);
  assert.doesNotMatch(read("app/pricing/page.tsx"), /fontSize: "\.[0-6]\d*rem"|fontSize: "\.7[0-4]\d*rem"/);
});

// The body face was named but never loaded, so body text was Segoe UI on Windows and San
// Francisco on Apple devices. Both faces are now served from this site, with their licences.
test("both typefaces are served from this site, with their licences", () => {
  assert.match(css, /@font-face\{font-family:Inter;src:url\("\/fonts\/inter-latin-wght\.woff2"\) format\("woff2"\);font-weight:100 900;font-style:normal;font-display:swap\}/);
  assert.match(css, /@font-face\{font-family:Anton;src:url\("\/fonts\/anton-latin-400\.woff2"\)/);
  const fonts = readdirSync(new URL("../public/fonts/", import.meta.url));
  for (const file of ["inter-latin-wght.woff2", "OFL-Inter.txt", "anton-latin-400.woff2", "OFL-Anton.txt"]) assert.ok(fonts.includes(file), file);
  assert.match(read("public/fonts/OFL-Inter.txt"), /SIL Open Font License, Version 1\.1/);
});

// REGRESSION: navigation used text symbols (⌂ ◇ ▦ ◫ ◎ ⌁ ▧) as icons, which every phone drew in a
// different font and weight, and the phone tab bar read them out to screen readers.
test("REGRESSION: navigation and photo pickers use the shared line icons, never text symbols", () => {
  for (const file of ["workspace-mobile-nav.tsx", "consumer-dashboard.tsx", "hanger-dock.tsx", "photo-source-picker.tsx", "wear-photo-log.tsx", "looks-builder.tsx"]) {
    assert.doesNotMatch(read(`components/${file}`), /[⌂◇▦◫◎⌁▧]/, file);
  }
  const icons = read("components/icons.tsx");
  assert.match(icons, /aria-hidden="true" focusable="false"/, "icons are decorative; the label beside each carries the meaning");
  const nav = read("components/workspace-mobile-nav.tsx");
  assert.doesNotMatch(nav, /<span>\{tab\.icon\}<\/span>/);
  assert.match(nav, /<Icon name=\{tab\.icon\}\/><small>\{tab\.label\}<\/small>/);
});
