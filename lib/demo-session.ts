/**
 * "Try the demo": one click on the sign-in screen, no typing, and every judge starts in the same
 * place (owner decision, 2026-10-30, from the finalists' instructions).
 *
 * - **The wardrobe demo** is a fresh private account per click, copied from the seeded judge
 *   wardrobe (scripts/seed-judge-accounts.mjs). Nobody sees anyone else's changes, and the copy
 *   expires on its own: the session after a day, the records after two.
 * - **The brand demo** signs into the seeded Judge Demo Atelier, read-only, so it stays the same
 *   for everyone.
 *
 * The sign-in screen offers the four judge accounts the README lists (owner decision, 2026-11-03):
 * Judge Consumer and New Consumer are private wardrobes, a copy and an empty one; Judge Brand is
 * the shared demo brand, read-only; New Brand is a private, empty, approved brand of the visitor's
 * own. Signing in to one of the seeded judge accounts with its password opens the same thing, so
 * the shared originals can never be changed, whichever way a judge arrives.
 *
 * None can reach a real person or a real brand. A demo wardrobe never joins a brand's owner index,
 * so its wears never reach any brand's numbers, and it cannot publish to Community. A private demo
 * brand's products never join the product registry, so they never answer a label, a search or a
 * public page, and it cannot publish Looks. No demo can change sign-in settings, so nobody can lock
 * the shared demo brand.
 */

import type { AccountActivity } from "./device-label.ts";

export type DemoKind = "consumer" | "brand";

/** Every demo wardrobe's account id starts with this; real ids are bare UUIDs, so it cannot collide. */
export const DEMO_ACCOUNT_PREFIX = "demo-session-";

/** The seeded accounts the demos start from. They match JUDGE_SEED_IDS in the seed. */
export const DEMO_SOURCE_ACCOUNTS = { consumer: "judge-consumer-account", brand: "judge-brand-account" } as const;

/** The four judge accounts in the README, in the order the sign-in screen offers them. */
export type DemoChoice = "judge-consumer" | "new-consumer" | "judge-brand" | "new-brand";

export const DEMO_CHOICES: ReadonlyArray<{ choice: DemoChoice; role: DemoKind; label: string; description: string }> = [
  { choice: "judge-consumer", role: "consumer", label: "Judge Consumer", description: "A lived-in wardrobe: pieces, saved outfits, a wear history and one verified brand piece." },
  { choice: "new-consumer", role: "consumer", label: "New Consumer", description: "Empty on purpose: scan a photo and see the first-run states." },
  { choice: "judge-brand", role: "brand", label: "Judge Brand", description: "One product with 50 opted-in owners beside one with 4, and Brand Hanger. Read-only." },
  { choice: "new-brand", role: "brand", label: "New Brand", description: "No products yet: enrol one from a single photo with Fill in from photo." },
];

/**
 * The seeded judge accounts, by id, and the demo each opens. A password sign-in to any of them
 * gets that demo instead of the shared account itself. The ids match JUDGE_SEED_IDS in the seed.
 */
export const SHARED_DEMO_ACCOUNTS: Readonly<Record<string, DemoChoice>> = {
  "judge-consumer-account": "judge-consumer",
  "judge-fresh-consumer-account": "new-consumer",
  "judge-brand-account": "judge-brand",
  "judge-fresh-brand-account": "new-brand",
};

export function isSharedDemoAccountId(id: unknown): boolean {
  return typeof id === "string" && Object.hasOwn(SHARED_DEMO_ACCOUNTS, id);
}

/** The demo a request asked for. The original two buttons sent "consumer" and "brand"; they still work. */
export function demoChoiceOf(value: unknown): DemoChoice | null {
  if (value === "consumer") return "judge-consumer";
  if (value === "brand") return "judge-brand";
  return DEMO_CHOICES.find((entry) => entry.choice === value)?.choice ?? null;
}

export function demoRoleOf(choice: DemoChoice): DemoKind {
  return choice === "judge-brand" || choice === "new-brand" ? "brand" : "consumer";
}

/** A private demo brand may enrol this many products: enough to try, not a free catalog. */
export const DEMO_BRAND_PRODUCT_LIMIT = 5;

export const DEMO_SESSION_MS = 24 * 60 * 60 * 1000;
/** Longer than the session, so nothing disappears while a judge is still looking at it. */
export const DEMO_RECORD_LIFETIME_MS = 2 * DEMO_SESSION_MS;

/** What a demo wardrobe copies from the seeded one: its pieces, outfits and saved inspiration. */
export const DEMO_COPIED_RECORDS = ["GARMENT#", "OUTFIT#", "INSPIRATION#"] as const;

/** Lower than a real account's daily AI allowance (lib/abuse-limits.ts): enough for a thorough look. */
export const DEMO_AI_ALLOWANCE = { scan: 12, hanger: 30 } as const;

/**
 * A demo's allowance for one AI action, or undefined for the account's normal one. The demo brand's
 * Fill in from photo is a scan of a product photo, so it gets the scan allowance, and Brand Hanger
 * gets Hanger's.
 */
export function demoAiAllowance(action: string): number | undefined {
  if (action === "scan" || action === "brand-describe") return DEMO_AI_ALLOWANCE.scan;
  if (action === "hanger" || action === "brand-hanger") return DEMO_AI_ALLOWANCE.hanger;
  return undefined;
}

/**
 * The key a demo session's own allowances and limits are counted under. The brand demo signs every
 * visitor into the same seeded account, so counting by account would let one judge spend the next
 * judge's photo readings. `sid` is minted per session; a token from before it existed falls back to
 * its signed expiry, which is just as particular to that session. Starts with DEMO_ACCOUNT_PREFIX,
 * so the demo allowance applies (lib/ai-budget.ts).
 */
export function demoSessionKey(session: { demo?: DemoKind; sid?: string; expiresAt: number }) {
  return `${DEMO_ACCOUNT_PREFIX}${session.demo ?? "visitor"}-${session.sid ?? session.expiresAt}`;
}

/**
 * The security log a demo session is shown. Made up and fixed: the demo brand is one shared account,
 * so its real log holds every judge's sign-ins and every failed attempt on its address, and one
 * visitor must never see another's. Device labels only, never an address; times count back from now.
 */
export function demoActivityLog(now = Date.now()): AccountActivity[] {
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  return [
    { type: "sign-in", at: ago(0.25), device: "Chrome on Mac" },
    { type: "sign-in", at: ago(27), device: "Safari on iPhone" },
    { type: "sign-in-failed", at: ago(52), device: "Firefox on Windows" },
    { type: "recovery-codes-replaced", at: ago(24 * 9), device: "Chrome on Mac" },
    { type: "two-step-on", at: ago(24 * 21), device: "Chrome on Mac" },
    { type: "password-changed", at: ago(24 * 40), device: "Chrome on Mac" },
    { type: "account-created", at: ago(24 * 85), device: "Chrome on Mac" },
  ];
}

export const DEMO_READ_ONLY_MESSAGE = "The demo brand is read-only, so every judge sees the same one. Create a brand account to add products.";
export const DEMO_SETTINGS_MESSAGE = "Sign-in settings are switched off in the demo. Create an account to use them.";
export const DEMO_PUBLISH_MESSAGE = "Demo wardrobes can't publish to Community. Create an account to share a look.";
export const DEMO_LOOK_PUBLISH_MESSAGE = "Demo brands can't publish Looks to Community. Save it as a draft, or create a brand account to publish.";
export const DEMO_BRAND_PRODUCT_LIMIT_MESSAGE = `A demo brand can enrol up to ${DEMO_BRAND_PRODUCT_LIMIT} products. Create a brand account for a full catalog.`;
export const SHARED_DEMO_ACCOUNT_MESSAGE = "This is a shared demo account, so it can't be changed.";

export function isDemoAccountId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ACCOUNT_PREFIX) && id.length > DEMO_ACCOUNT_PREFIX.length;
}

export function newDemoAccountId(uuid: string) {
  return `${DEMO_ACCOUNT_PREFIX}${uuid}`;
}

/** DynamoDB time-to-live is in seconds. */
export function demoExpiry(now: number) {
  return Math.ceil((now + DEMO_RECORD_LIFETIME_MS) / 1000);
}

type StoredRecord = Record<string, unknown> & { PK?: unknown; SK?: unknown };

/**
 * One seeded record, copied into a demo wardrobe. Index keys are dropped, so a copied piece never
 * joins a brand's owner index; a verified piece keeps its product id, so it still shows as verified.
 * Photos are shared with the seeded wardrobe, which is safe because deletion only ever removes
 * photos under the deleting account's own folder (lib/deletion-plan.ts). Anything that is not a
 * piece, an outfit or an inspiration is not copied.
 */
export function demoCopy(record: StoredRecord, ownerId: string, now: number): Record<string, unknown> | null {
  const sk = typeof record.SK === "string" ? record.SK : "";
  if (!isDemoAccountId(ownerId) || !DEMO_COPIED_RECORDS.some((prefix) => sk.startsWith(prefix))) return null;
  const rest = Object.fromEntries(Object.entries(record).filter(([key]) => !/^GSI[0-9]+(PK|SK)$/.test(key)));
  const linkedProduct = typeof record.GSI1PK === "string" && record.GSI1PK.startsWith("PRODUCT#") ? record.GSI1PK.slice("PRODUCT#".length) : null;
  return {
    ...rest,
    ...(sk.startsWith("GARMENT#") && !rest.registryProductId && linkedProduct ? { registryProductId: linkedProduct } : {}),
    PK: `USER#${ownerId}`,
    SK: sk,
    dataClassification: "DEMO",
    testCohort: true,
    demoSession: true,
    ttl: demoExpiry(now),
  };
}

/** The demo wardrobe's own account record. It has no email index and no password, so nobody can sign in to it except through its session. */
export function demoProfile(ownerId: string, now: number) {
  return {
    id: ownerId,
    email: "demo@racked.local",
    role: "consumer" as const,
    displayName: "Demo judge",
    brandName: null,
    brandSlug: null,
    passwordHash: "",
    passwordSalt: "",
    createdAt: new Date(now).toISOString(),
    brandDataSharing: true,
    sessionVersion: 0,
    dataClassification: "DEMO" as const,
    testCohort: true,
    demoSession: true,
    PK: `USER#${ownerId}`,
    SK: "PROFILE",
    ttl: demoExpiry(now),
  };
}

/**
 * A New Brand demo's account record: a private brand of the visitor's own, approved so it can enrol,
 * with no email index, no password and no brand-name claim, so it reserves nothing a real brand
 * could want and nobody can sign in to it except through its session. Its products are counted
 * against DEMO_BRAND_PRODUCT_LIMIT, and everything it writes expires.
 */
export function demoBrandProfile(ownerId: string, now: number) {
  const suffix = ownerId.slice(-8).toLowerCase();
  return {
    ...demoProfile(ownerId, now),
    role: "brand" as const,
    displayName: "Demo judge",
    brandName: "New Demo Brand",
    brandSlug: `new-demo-brand-${suffix}`,
    brandStatus: "approved" as const,
    brandDataSharing: false,
    productCount: 0,
  };
}

/** Only the seeded, clearly synthetic demo brand can be opened by the brand demo. */
export function isDemoBrandAccount(account: { id?: unknown; role?: unknown; dataClassification?: unknown; testCohort?: unknown } | null): boolean {
  return Boolean(account && account.id === DEMO_SOURCE_ACCOUNTS.brand && account.role === "brand" && account.dataClassification === "DEMO" && account.testCohort === true);
}
