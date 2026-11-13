/**
 * The price tiers have one source (lib/pricing.ts). The /pricing page renders it, the README table is
 * generated from it, and the Basic plan promises nothing the product does not do.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING_BLOCK_END, PRICING_BLOCK_START, PRICING_TIERS, REFERRAL_COMMISSION_RATE, referralSplit, renderPricingBlock } from "../lib/pricing.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

test("prices are the ones the owner set", () => {
  assert.deepEqual(PRICING_TIERS.map((row) => [row.tier, row.price]), [
    ["Consumer Free", "$0"],
    ["Consumer Pro", "$6.99/mo or $59/yr"],
    // Owner decision 2026-11-04: two brand plans either side of the threshold, enrollment included.
    ["Brand Basic (below k≥25)", "$20/mo"],
    ["Brand Pro (post-threshold)", "$40/mo"],
    // Owner decision 2026-11-13: an 8% referral commission on top of the plans.
    ["Referral commission (brands)", "8% of referred sales"],
  ]);
});

test("the commission is charged only on a sale Racked referred, of an exact verified product", () => {
  const commission = PRICING_TIERS.find((row) => row.tier.startsWith("Referral commission"));
  assert.ok(commission);
  assert.match(commission.includes, /only when someone buys an exact, verified product after following a Racked link/);
  assert.match(commission.includes, /Nothing on other purchases, and the shopper pays no extra\./);
  // Shop the Look already tells shoppers Racked may earn from eligible purchases.
  assert.match(read("components/shop-the-look.tsx"), /Racked may earn a commission from eligible purchases\./);
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
  assert.match(page, /import \{ PRICING_TIERS(, [A-Za-z_, ]+)? \} from "@\/lib\/pricing";/);
  assert.match(page, /PRICING_TIERS\.map\(/);
  assert.doesNotMatch(page, /price: "\$/, "no tier is declared in the page");
});

test("Basic promises only what the product shows below the threshold", () => {
  const basic = PRICING_TIERS.find((row) => row.tier.startsWith("Brand Basic"));
  assert.ok(basic);
  assert.match(basic.includes, /No private wear data until a product reaches k ≥ 25\./);
  // The needles are built from parts so this file does not contain them.
  const needles = ["progress-to-" + "threshold", "category " + "benchmarks"];
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => /\.(ts|tsx|md|mjs|json|yaml|yml)$/.test(file));
  for (const file of files) {
    const text = read(file).toLowerCase();
    for (const needle of needles) assert.ok(!text.includes(needle), `${file} still says "${needle}"`);
  }
});

test("the test receipt illustrates the same commission the pricing table states, to the cent", () => {
  const row = PRICING_TIERS.find((entry) => entry.tier.startsWith("Referral commission"));
  assert.equal(row?.price, `${REFERRAL_COMMISSION_RATE * 100}% of referred sales`);
  assert.deepEqual(referralSplit(295), { commission: 23.6, brandReceives: 271.4 });
  assert.deepEqual(referralSplit(48), { commission: 3.84, brandReceives: 44.16 });
  assert.deepEqual(referralSplit(0.99), { commission: 0.08, brandReceives: 0.91 });
  const receipt = read("app/test-checkout/complete/page.tsx");
  assert.match(receipt, /referralSplit\(receipt\.amount\)\.commission/);
  assert.match(receipt, /In test mode nothing is split or moved\./, "the split is labelled an illustration");
});

test("the pricing page explains the referral commission from the shared rate, and offers no checkout of its own", () => {
  const page = read("app/pricing/page.tsx");
  assert.match(page, /import \{ PRICING_TIERS, REFERRAL_COMMISSION_RATE, referralSplit \} from "@\/lib\/pricing";/);
  assert.match(page, /Racked earns on referrals, not checkouts/);
  assert.match(page, /\{REFERRAL_COMMISSION_RATE \* 100\}% referral commission/);
  assert.match(page, /example\.commission/);
  assert.doesNotMatch(page, /Stripe/, "the pricing page no longer points judges at the switched-off test checkout");
  assert.deepEqual(referralSplit(100), { commission: 8, brandReceives: 92 });
});
