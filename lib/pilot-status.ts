/**
 * What Racked may say about its pilot brands, derived from `data/pilot-status.json` and nothing
 * else. Every sentence here renders only when the data supports it: a null or false field removes
 * the claim rather than softening it, and the same words are used on the landing page, the README
 * and the pricing page, so no surface can say more than the evidence.
 *
 * - "agreed to join the pilot" needs a recorded agreement (phone, or in writing).
 * - "accepted pricing" needs a written form (signed letter or email) and evidence files that exist.
 *   A phone agreement never renders it.
 * - "customer" needs `paid: true`.
 * - A brand's name renders only with its permission.
 */
export type AgreementForm = "phone" | "written";
export type PricingForm = "signed-loi" | "written-email" | "verbal";

export interface PilotBrand {
  label: string;
  publicName: string | null;
  namePermission: boolean;
  relationship: string | null;
  agreedToPilot: { form: AgreementForm; onOrBefore: string; reconfirmedOn: string | null } | null;
  accountCreated: boolean;
  productsUploaded: boolean;
  productsEnrolled: number | null;
  pricing: { tier: string | null; price: string | null; acceptedOn: string | null; form: PricingForm | null; billingStarts: string | null };
  paid: boolean;
  evidence: string[];
}

export interface PilotStatus {
  asOf: string;
  brands: PilotBrand[];
}

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** The name shown for a brand: its name only with permission, otherwise a neutral label. */
export const displayName = (brand: PilotBrand, index: number) => (brand.namePermission && brand.publicName ? brand.publicName : `Brand ${String.fromCharCode(65 + index)}`);

/** Whether a brand's pricing acceptance is evidenced: written, with every evidence file present. */
export function pricingAccepted(brand: PilotBrand, exists: (path: string) => boolean) {
  const form = brand.pricing.form;
  return (form === "signed-loi" || form === "written-email") && brand.evidence.length > 0 && brand.evidence.every(exists);
}

/** What one brand has done, in the words the evidence allows. */
export function brandFacts(brand: PilotBrand, exists: (path: string) => boolean) {
  const facts: string[] = [];
  if (brand.agreedToPilot) facts.push(brand.agreedToPilot.form === "phone" ? "agreed to join the pilot by phone" : "agreed to join the pilot in writing");
  if (brand.accountCreated) facts.push("created a brand account");
  if (brand.productsUploaded) facts.push(brand.productsEnrolled && brand.productsEnrolled >= 5 ? `uploaded ${brand.productsEnrolled} products` : "uploaded products");
  if (pricingAccepted(brand, exists)) facts.push(`accepted pilot pricing${brand.pricing.tier ? ` (${brand.pricing.tier})` : ""}`);
  if (brand.paid) facts.push("is a paying customer");
  return facts;
}

/** The one line for the landing page and the README: only what every counted brand has done. */
export function pilotSentence(status: PilotStatus, exists: (path: string) => boolean) {
  const agreed = status.brands.filter((brand) => brand.agreedToPilot);
  if (!agreed.length) return null;
  const everyone = (check: (brand: PilotBrand) => boolean) => agreed.every(check);
  const names = agreed.map((brand) => displayName(brand, status.brands.indexOf(brand)));
  const did = [
    "have agreed to join the Racked pilot",
    ...(everyone((brand) => brand.accountCreated) ? [agreed.length === 1 ? "created a brand account" : "created brand accounts"] : []),
    ...(everyone((brand) => brand.productsUploaded) ? ["uploaded their products"] : []),
    ...(everyone((brand) => pricingAccepted(brand, exists)) ? ["accepted pilot pricing"] : []),
  ];
  const noun = agreed.length === 1 ? "apparel brand" : "apparel brands";
  const named = agreed.every((brand) => brand.namePermission && brand.publicName);
  const subject = `${countWord(agreed.length)} ${noun}${named ? `, ${list(names.map((name) => `**${name}**`))}` : ""},`;
  return `${subject} ${list(did)}.`.replace("have agreed", agreed.length === 1 ? "has agreed" : "have agreed");
}

/** The landing page line, without Markdown. */
export const pilotLine = (status: PilotStatus, exists: (path: string) => boolean) => pilotSentence(status, exists)?.replace(/\*\*/g, "") ?? null;

/** The README block: the sentence, a table of what each brand has done, and what is not claimed. */
export function renderPilotBlock(status: PilotStatus, exists: (path: string) => boolean) {
  const sentence = pilotSentence(status, exists);
  const lines = ["<!-- pilot:start (generated from data/pilot-status.json; tests/pilot-claims.test.ts) -->"];
  if (!sentence) {
    lines.push("**Pilot status:** no brand has a recorded pilot agreement yet.");
  } else {
    lines.push(`**Pilot status (${status.asOf}):** ${sentence}`, "", "| Brand | What it has done | Evidence |", "| --- | --- | --- |");
    status.brands.forEach((brand, index) => {
      const facts = brandFacts(brand, exists);
      const evidence = brand.evidence.length && brand.evidence.every(exists) ? brand.evidence.map((path) => `[${path.split("/").pop()}](${path})`).join(", ") : brand.agreedToPilot?.form === "phone" ? "Agreed by phone; no written record" : "None filed";
      lines.push(`| ${displayName(brand, index)} | ${facts.length ? facts.join("; ") : "Nothing recorded"} | ${evidence} |`);
    });
    const unclaimed = [
      ...(status.brands.some((brand) => pricingAccepted(brand, exists)) ? [] : ["pricing acceptance"]),
      ...(status.brands.some((brand) => brand.paid) ? [] : ["payment"]),
    ];
    if (unclaimed.length) lines.push("", `Not claimed: ${list(unclaimed)}. Nothing is billed.`);
    const disclosed = status.brands.filter((brand) => brand.relationship);
    if (disclosed.length) lines.push("", ...disclosed.map((brand) => `Disclosure: ${displayName(brand, status.brands.indexOf(brand))} — ${brand.relationship}.`));
  }
  lines.push("<!-- pilot:end -->");
  return lines.join("\n");
}

/** The pricing page note: what was accepted, or nothing at all. */
export function pricingNote(status: PilotStatus, exists: (path: string) => boolean) {
  const accepted = status.brands.filter((brand) => pricingAccepted(brand, exists));
  if (!accepted.length) return null;
  const dates = accepted.map((brand) => brand.pricing.billingStarts).filter((date): date is string => Boolean(date));
  return `Accepted by ${accepted.length} pilot ${accepted.length === 1 ? "brand" : "brands"} — ${dates.length === accepted.length ? `billing starts ${dates.sort()[0]}` : "not yet billed"}.`;
}
