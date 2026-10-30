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
 * Neither can reach a real person or a real brand. A demo wardrobe never joins a brand's owner
 * index, so its wears never reach any brand's numbers, and it cannot publish to Community. Neither
 * demo can change sign-in settings, so nobody can lock the shared demo brand.
 */

export type DemoKind = "consumer" | "brand";

/** Every demo wardrobe's account id starts with this; real ids are bare UUIDs, so it cannot collide. */
export const DEMO_ACCOUNT_PREFIX = "demo-session-";

/** The seeded accounts the demos start from. They match JUDGE_SEED_IDS in the seed. */
export const DEMO_SOURCE_ACCOUNTS = { consumer: "judge-consumer-account", brand: "judge-brand-account" } as const;

export const DEMO_SESSION_MS = 24 * 60 * 60 * 1000;
/** Longer than the session, so nothing disappears while a judge is still looking at it. */
export const DEMO_RECORD_LIFETIME_MS = 2 * DEMO_SESSION_MS;

/** What a demo wardrobe copies from the seeded one: its pieces, outfits and saved inspiration. */
export const DEMO_COPIED_RECORDS = ["GARMENT#", "OUTFIT#", "INSPIRATION#"] as const;

/** Lower than a real account's daily AI allowance (lib/abuse-limits.ts): enough for a thorough look. */
export const DEMO_AI_ALLOWANCE = { scan: 12, hanger: 30 } as const;

export const DEMO_READ_ONLY_MESSAGE = "The demo brand is read-only, so every judge sees the same one. Create a brand account to add products.";
export const DEMO_SETTINGS_MESSAGE = "Sign-in settings are switched off in the demo. Create an account to use them.";
export const DEMO_PUBLISH_MESSAGE = "Demo wardrobes can't publish to Community. Create an account to share a look.";

export function isDemoAccountId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(DEMO_ACCOUNT_PREFIX) && id.length > DEMO_ACCOUNT_PREFIX.length;
}

export function newDemoAccountId(uuid: string) {
  return `${DEMO_ACCOUNT_PREFIX}${uuid}`;
}

export function demoKindOf(value: unknown): DemoKind | null {
  return value === "consumer" || value === "brand" ? value : null;
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

/** Only the seeded, clearly synthetic demo brand can be opened by the brand demo. */
export function isDemoBrandAccount(account: { id?: unknown; role?: unknown; dataClassification?: unknown; testCohort?: unknown } | null): boolean {
  return Boolean(account && account.id === DEMO_SOURCE_ACCOUNTS.brand && account.role === "brand" && account.dataClassification === "DEMO" && account.testCohort === true);
}
