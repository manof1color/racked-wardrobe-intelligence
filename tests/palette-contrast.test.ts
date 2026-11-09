import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The brand palette (black ink, tan accent, brown text and emphasis, cream paper, sand, olive tints)
// is defined once, in the :root block of app/globals.css. The variable names --coral*, --acid and
// --lilac are legacy: they now hold tan, a pale tan tint and an olive tint. These checks keep the pairs people actually read inside
// WCAG AA, and keep the manifest, icon and offline page in step with the stylesheet.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const rootBlock = css.match(/:root\{([^}]*)\}/)?.[1] ?? "";
const colour = (name: string) => {
  const value = rootBlock.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`))?.[1];
  assert.ok(value, `--${name} must be a six-digit hex colour in :root`);
  return value.toLowerCase();
};

const channel = (value: number) => (value /= 255) <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(start => channel(parseInt(hex.slice(start, start + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test("text pairs on the accent and on every surface stay at WCAG AA (4.5:1)", () => {
  const pairs: [string, string, string][] = [
    ["ink", "coral", "--ink on --coral (buttons, send, logged days)"],
    ["ink", "coral-hover", "--ink on --coral-hover"],
    ["coral-dark", "paper", "--coral-dark text on --paper"],
    ["coral-dark", "white", "--coral-dark text on --white"],
    ["muted", "paper", "--muted on --paper"],
    ["muted", "white", "--muted on --white"],
    ["muted", "cream", "--muted on --cream (sand tiles)"],
    ["ink", "paper", "--ink on --paper"],
    ["ink", "cream", "--ink on --cream"],
    ["ink", "acid", "--ink on --acid"],
    ["ink", "lilac", "--ink on --lilac"],
  ];
  const resolve = (name: string) => colour(name);
  for (const [foreground, background, label] of pairs) {
    const ratio = contrast(resolve(foreground), resolve(background));
    assert.ok(ratio >= 4.5, `${label} is ${ratio.toFixed(2)}:1, below 4.5:1`);
  }
});

test("the web app manifest, app icon and offline page use the stylesheet's ink and paper", () => {
  const manifest = read("app/manifest.ts");
  assert.ok(manifest.includes(`theme_color:"${colour("ink")}"`));
  assert.ok(manifest.includes(`background_color:"${colour("paper")}"`));
  const icon = read("public/icon.svg").toLowerCase();
  assert.ok(icon.includes(`fill="${colour("ink")}"`) && icon.includes(`fill="${colour("coral")}"`), "icon.svg uses the ink tile and the tan letter");
  const offline = read("public/offline.html").toLowerCase();
  assert.ok(offline.includes(`name="theme-color" content="${colour("ink")}"`));
});

test("the retired coral, lime, lilac and navy-blue palette values are gone from the stylesheet, icon and offline page", () => {
  const retired = ["#ff6846", "#c23a1f", "#d5f66d", "#cfc5ff", "#171914", "#f5f2ea", "#ece6d8", "#6848d6", "#4b3aa8",
    "#08132b", "#0066ff", "#0052cc", "#0047b3", "#d6e4ff", "#f7f2eb", "#e4d6c5"];
  for (const path of ["app/globals.css", "app/manifest.ts", "public/icon.svg", "public/offline.html"]) {
    const text = read(path).toLowerCase();
    for (const value of retired) assert.ok(!text.includes(value), `${path} still contains retired colour ${value}`);
  }
});
