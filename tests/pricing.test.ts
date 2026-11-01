/**
 * The price tiers have one source (lib/pricing.ts). The /pricing page renders it, the README table is
 * generated from it, and the Starter tier promises nothing the product does not do.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING_BLOCK_END, PRICING_BLOCK_START, PRICING_TIERS, renderPricingBlock } from "../lib/pricing.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

test("prices are the ones the owner set", () => {
  assert.deepEqual(PRICING_TIERS.map((row) => [row.tier, row.price]), [
    ["Consumer Free", "$0"],
    ["Consumer Pro", "$6.99/mo or $59/yr"],
    ["Brand SKU Enrollment", "$25 one-time + $10/yr/SKU"],
    ["Brand Starter (below k≥25)", "$29/mo"],
    ["Brand Standard (post-threshold)", "$149/mo"],
    ["Brand Growth", "$299/mo"],
    ["A la carte strategy artifact", "$15/artifact"],
  ]);
});

test("the README table is generated from the tiers, between its markers", () => {
  const readme = read("README.md");
  const start = readme.indexOf(PRICING_BLOCK_START);
  const end = readme.indexOf(PRICING_BLOCK_END) + PRICING_BLOCK_END.length;
  assert.ok(start > 0 && end > start, "the markers are in the README");
  assert.equal(readme.slice(start, end), renderPricingBlock());
});

test("the pricing page renders the shared tiers and declares none of its own", () => {
  const page = read("app/pricing/page.tsx");
  assert.match(page, /import \{ PRICING_TIERS \} from "@\/lib\/pricing";/);
  assert.match(page, /PRICING_TIERS\.map\(/);
  assert.doesNotMatch(page, /price: "\$/, "no tier is declared in the page");
});

test("Starter promises only what the product shows below the threshold", () => {
  const starter = PRICING_TIERS.find((row) => row.tier.startsWith("Brand Starter"));
  assert.ok(starter);
  assert.match(starter.includes, /No private wear data until a product reaches k ≥ 25\./);
  // The needles are built from parts so this file does not contain them.
  const needles = ["progress-to-" + "threshold", "category " + "benchmarks"];
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => /\.(ts|tsx|md|mjs|json|yaml|yml)$/.test(file));
  for (const file of files) {
    const text = read(file).toLowerCase();
    for (const needle of needles) assert.ok(!text.includes(needle), `${file} still says "${needle}"`);
  }
});
