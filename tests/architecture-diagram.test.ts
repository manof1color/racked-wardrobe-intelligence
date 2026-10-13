/**
 * The architecture image is the first picture a judge sees in the README. It is drawn as SVG rather
 * than a generated bitmap so that every label is real text: a box naming the wrong model, a service
 * Racked does not use, or text too small to read on GitHub fails here instead of in front of a judge.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const path = new URL("../docs/architecture.svg", import.meta.url);
const svg = readFileSync(path, "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

/** What a viewer reads: every text element's content, entities decoded, whitespace collapsed. */
function visibleText(source: string) {
  return [...source.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map(([, inner]) => inner.replace(/<[^>]+>/g, " "))
    .join(" ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const viewBox = /<svg\b[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
const width = Number(viewBox?.[1]);
const height = Number(viewBox?.[2]);
const words = visibleText(svg);

test("the diagram is a self-contained, safe SVG of a size GitHub shows well", () => {
  assert.ok(viewBox, "the root <svg> declares viewBox=\"0 0 W H\"");
  assert.ok(width >= 1000 && width <= 1600, `width ${width} is between 1000 and 1600`);
  assert.ok(height >= 600 && height <= 1200, `height ${height} is between 600 and 1200`);
  assert.ok(statSync(path).size < 150_000, "under 150 KB");
  assert.match(svg, /<title>[^<]{10,}<\/title>/, "has a <title>");
  assert.match(svg, /<desc>[^<]{40,}<\/desc>/, "has a <desc> describing the flow");
  for (const forbidden of [/<script\b/i, /<foreignObject\b/i, /<image\b/i, /\bhref="https?:/i, /data:/i, /@import/i, /url\(\s*['"]?https?:/i]) {
    assert.doesNotMatch(svg, forbidden, `contains ${forbidden}`);
  }
});

test("it has its own background, so it reads on GitHub's light and dark themes", () => {
  const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)].map(([, attributes]) => attributes);
  const fullSize = (value: string | undefined, size: number) => value === "100%" || Number(value) >= size;
  const background = rects.find((attributes) => {
    const attribute = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
    const fill = attribute("fill");
    return fullSize(attribute("width"), width) && fullSize(attribute("height"), height) && fill && !/^(none|transparent)$/i.test(fill);
  });
  assert.ok(background, "a filled rectangle covers the whole canvas");
});

test("no text is too small to read at GitHub's README width", () => {
  const sizes = [...svg.matchAll(/font-size(?:="|:\s*)([^";}]+)/g)].map(([, value]) => value.trim());
  assert.ok(sizes.length > 0, "font sizes are declared");
  for (const size of sizes) {
    assert.match(size, /^[\d.]+(px)?$/, `font-size ${size} is in px or user units`);
    assert.ok(parseFloat(size) >= width / 60, `font-size ${size} is at least ${(width / 60).toFixed(1)}`);
  }
});

test("every component, the privacy boundary, and the delivery path are labelled exactly", () => {
  for (const label of [
    "Phone or desktop browser", "Installable PWA", "HTTPS · signed HTTP-only session",
    "AWS Amplify Hosting", "Next.js 15",
    "Session & role check", "Rate limits",
    "Photo intake", "One bounded crop per piece",
    "Hanger agents", "wardrobe search · outfit builder · weather · trends",
    "Outfit builder", "Stylist knowledge",
    "Privacy gate", "Consent → k ≥ 25 → enumeration budget",
    "Owner-scoped store", "Every read checks the account",
    "Amazon Bedrock", "Nova Pro: garment detection + Hanger", "Nova Lite fallback",
    "Open-Meteo", "Coordinates rounded to ~1 km",
    "DynamoDB", "Private S3", "1-hour links",
    "Brand dashboard", "Released aggregates only",
    "Never names, emails, photos, wardrobes, or owner IDs",
    "CodeQL", "/api/version",
  ]) {
    assert.ok(words.includes(label), `missing label: ${label}`);
  }
});

test("it names nothing Racked does not run and claims nothing it does not do", () => {
  for (const forbidden of [/\bLambda\b/, /\bCognito\b/, /API Gateway/, /SageMaker/, /Stable Image/, /\bSES\b/, /OpenAI/, /\bGPT\b/, /\bClaude\b/, /Stripe/, /try-on/i, /\bsales\b/i, /Nova Lite: garment/i]) {
    assert.doesNotMatch(words, forbidden, `names ${forbidden}`);
  }
});

test("the README shows the image first in its architecture section and keeps the text diagram", () => {
  const section = readme.slice(readme.indexOf("## Architecture Overview"), readme.indexOf("## Repository Map"));
  assert.match(section, /^!\[Racked architecture: [^\]]{120,}\]\(docs\/architecture\.svg\)$/m, "the image, with a descriptive alt text");
  assert.ok(section.indexOf("docs/architecture.svg") < section.indexOf("```mermaid"), "the image comes before the text diagram");
  assert.match(section, /<details>\s*<summary><strong>The same diagram as text — expand<\/strong><\/summary>\s*```mermaid/, "the Mermaid diagram stays, folded");
});
