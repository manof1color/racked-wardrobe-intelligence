/**
 * What Racked says about its pilot brands is derived from data/pilot-status.json, and no file says
 * more than that data supports: no "customers" without payment, no "accepted pricing" without a
 * written record that exists, and no brand name without permission.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brandFacts, displayName, pilotLine, pilotSentence, pricingAccepted, pricingNote, renderPilotBlock, type PilotBrand, type PilotStatus } from "../lib/pilot-status.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const status = JSON.parse(read("data/pilot-status.json")) as PilotStatus;
const exists = (path: string) => existsSync(join(root, path));

const brand = (patch: Partial<PilotBrand> = {}): PilotBrand => ({
  label: "Brand", publicName: "Brand", namePermission: true, relationship: null,
  agreedToPilot: { form: "phone", onOrBefore: "2026-10-29", reconfirmedOn: null },
  accountCreated: true, productsUploaded: true, productsEnrolled: null,
  pricing: { tier: null, price: null, acceptedOn: null, form: null, billingStarts: null },
  paid: false, evidence: [], ...patch,
});
const two = (patch: Partial<PilotBrand> = {}): PilotStatus => ({ asOf: "2026-10-29", brands: [brand({ publicName: "Alpha", ...patch }), brand({ publicName: "Beta", ...patch })] });
const never = () => false;
const always = () => true;

test("today's data says the brands agreed, created accounts and uploaded, and nothing about price or payment", () => {
  assert.equal(status.brands.length, 2);
  for (const entry of status.brands) assert.equal(entry.paid, false);
  const sentence = pilotSentence(status, exists)!;
  assert.match(sentence, /^Two apparel brands, \*\*_victimdesigns\*\* and \*\*vversatile\.usa\*\*, have agreed to join the Racked pilot, created brand accounts and uploaded their products\.$/);
  assert.doesNotMatch(sentence, /pricing|paid|customer|revenue|\$/i);
});

test("a phone agreement never renders as accepted pricing, and pricing needs a written form with evidence that exists", () => {
  assert.equal(pricingAccepted(brand({ pricing: { tier: "Brand Starter", price: "$29/mo", acceptedOn: "2026-10-29", form: "verbal", billingStarts: null } }), always), false, "verbal is a discussion");
  const written = brand({ pricing: { tier: "Brand Starter", price: "$29/mo", acceptedOn: "2026-11-01", form: "written-email", billingStarts: null }, evidence: ["docs/pilot-evidence/a.pdf"] });
  assert.equal(pricingAccepted(written, always), true);
  assert.equal(pricingAccepted(written, never), false, "a missing evidence file removes the claim");
  assert.equal(pricingAccepted({ ...written, evidence: [] }, always), false, "no evidence, no claim");
  assert.match(pilotSentence({ asOf: "x", brands: [written, { ...written }] }, always)!, /accepted pilot pricing/);
  assert.doesNotMatch(pilotSentence({ asOf: "x", brands: [written, { ...written }] }, never)!, /pricing/);
  assert.doesNotMatch(pilotSentence({ asOf: "x", brands: [written, { ...written, evidence: [] }] }, always)!, /pricing/, "every brand must have it, or it is not said");
});

test("the word customer appears only for a brand that has paid", () => {
  assert.doesNotMatch(brandFacts(brand(), always).join(" "), /customer/);
  assert.match(brandFacts(brand({ paid: true }), always).join(" "), /paying customer/);
});

test("a brand is named only with permission, and a claim a brand has not earned is dropped", () => {
  assert.equal(displayName(brand({ namePermission: false }), 1), "Brand B");
  assert.doesNotMatch(pilotSentence(two({ namePermission: false }), never)!, /Alpha|Beta/);
  assert.match(pilotSentence(two({ namePermission: false }), never)!, /^Two apparel brands, have agreed/);
  assert.doesNotMatch(pilotSentence(two({ productsUploaded: false }), never)!, /uploaded/);
  assert.doesNotMatch(pilotSentence({ asOf: "x", brands: [brand(), brand({ accountCreated: false })] }, never)!, /created/, "one brand without it removes it for both");
  assert.equal(pilotSentence(two({ agreedToPilot: null }), never), null, "no agreement, no sentence");
  assert.match(renderPilotBlock(two({ agreedToPilot: null }), never), /no brand has a recorded pilot agreement yet/);
  assert.match(pilotSentence({ asOf: "x", brands: [brand()] }, never)!, /^One apparel brand, \*\*Brand\*\*, has agreed/);
});

test("the pricing page note appears only for evidenced acceptance", () => {
  assert.equal(pricingNote(status, exists), null);
  const written = brand({ pricing: { tier: "Brand Starter", price: "$29/mo", acceptedOn: "2026-11-01", form: "signed-loi", billingStarts: "2026-12-01" }, evidence: ["docs/pilot-evidence/a.pdf"] });
  assert.equal(pricingNote({ asOf: "x", brands: [written] }, always), "Accepted by 1 pilot brand — billing starts 2026-12-01.");
  assert.equal(pricingNote({ asOf: "x", brands: [{ ...written, pricing: { ...written.pricing, billingStarts: null } }] }, always), "Accepted by 1 pilot brand — not yet billed.");
  assert.equal(pricingNote({ asOf: "x", brands: [written] }, never), null);
});

test("the README block and the landing line match the data file", () => {
  const readme = read("README.md").replace(/\r\n/g, "\n");
  const start = readme.indexOf("<!-- pilot:start");
  const end = readme.indexOf("<!-- pilot:end -->") + "<!-- pilot:end -->".length;
  assert.ok(start > 0 && end > start);
  assert.equal(readme.slice(start, end), renderPilotBlock(status, exists));
  assert.ok(start < readme.indexOf("## Judge Scorecard"), "it sits on the first screen, under the opening table");
  const page = read("app/page.tsx");
  assert.match(page, /const pilot=landingPilotLine\(\);/);
  assert.match(page, /\{pilot&&<p className="lp-pilot lp-rise">\{pilot\}<\/p>\}/);
  assert.equal(pilotLine(status, exists), pilotSentence(status, exists)!.replace(/\*\*/g, ""), "the landing line is the README sentence without Markdown");
  assert.match(read("app/pricing/page.tsx"), /\{accepted&&<p className="pricing-pilot">\{accepted\}<\/p>\}/);
  assert.match(read("lib/server/pilot-evidence.ts"), /\^docs\\\/pilot-evidence\\\/\[\\w\.-\]\+\$/, "only files in the evidence folder can back a claim");
});

test("every evidence path in the data exists", () => {
  for (const entry of status.brands) for (const path of entry.evidence) assert.ok(exists(path), path);
});

test("no file calls a brand a customer, partner or user-in-production", () => {
  const files = execFileSync("git", ["ls-files", "*.md", "app/**/*.tsx", "components/*.tsx"], { cwd: root, encoding: "utf8" }).split("\n").filter((file) => file && !file.startsWith("docs/work-orders/") && file !== "PROGRESS.md" && file !== "docs/tiktok-campaign.md");
  const claim = /\b(trusted by|in use by real|real brand customers|our brand customers|brand partners|partnered with)\b/i;
  const offenders = files.flatMap((file) => read(file).split(/\r?\n/).filter((line) => claim.test(line)).map((line) => `${file}: ${line.slice(0, 80)}`));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(read("AGENTS.md"), /real brand customers/);
  assert.match(read("SECURITY.md"), /Two pilot brands have created accounts and uploaded products on the live app/);
});
