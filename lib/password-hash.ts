import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * How account passwords are stored and checked.
 *
 * Every password is derived with scrypt and a unique 18-byte random salt. Until October 2026 the
 * derivation used Node's default cost — N = 2^14, r = 8, p = 1 (16 MiB) — which is an eighth of
 * the minimum OWASP's Password Storage Cheat Sheet gives for scrypt. New hashes use N = 2^17, r = 8,
 * p = 1 (128 MiB). Each stored hash names its scheme; a hash with no scheme is the old one. An old
 * hash keeps working, and is replaced at the new cost the next time its owner signs in, so no one is
 * locked out and no reset is needed.
 *
 * Two properties are kept deliberately:
 *
 * - **Timing reveals nothing.** Every check runs exactly one derivation at each scheme's cost — the
 *   account's own scheme with its salt, every other scheme with a fixed salt, and both for an email
 *   with no account — so response time says neither whether an email has an account nor which
 *   scheme its hash uses.
 * - **Memory is bounded.** A derivation at the new cost holds 128 MiB, so at most two run at once in
 *   a server instance; others wait their turn rather than exhaust memory under a burst of sign-ins.
 */
export const PASSWORD_SCHEMES = {
  /** Node's defaults: every hash stored before October 2026, and any stored without a scheme. */
  "scrypt-n14": { N: 2 ** 14, r: 8, p: 1 },
  /** OWASP's minimum for scrypt. */
  "scrypt-n17": { N: 2 ** 17, r: 8, p: 1 },
} as const;

export type PasswordScheme = keyof typeof PASSWORD_SCHEMES;
export const CURRENT_PASSWORD_SCHEME: PasswordScheme = "scrypt-n17";
export const LEGACY_PASSWORD_SCHEME: PasswordScheme = "scrypt-n14";
const SCHEMES = Object.keys(PASSWORD_SCHEMES) as PasswordScheme[];
const KEY_LENGTH = 64;
const SALT_BYTES = 18;
const MAX_MEMORY = 256 * 1024 * 1024;
/** The salt for derivations whose result is thrown away: they exist only to take the same time. */
const EQUALIZER_SALT = "racked-sign-in-timing-equalizer";

export const MAX_CONCURRENT_DERIVATIONS = 2;
let running = 0;
const queue: Array<() => void> = [];
async function inTurn<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_DERIVATIONS) await new Promise<void>((resolve) => queue.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

/** For tests: derivations running now, and waiting their turn. */
export const derivationLoad = () => ({ running, waiting: queue.length });

export type Derive = (password: string, salt: string, scheme: PasswordScheme) => Promise<Buffer>;

export const derivePassword: Derive = (password, salt, scheme) => {
  const { N, r, p } = PASSWORD_SCHEMES[scheme];
  return inTurn(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key)));
  }));
};

export interface StoredPassword {
  passwordHash: string;
  passwordSalt: string;
  passwordScheme?: string;
}

/** A new hash at the current cost, with a fresh salt. */
export async function hashPassword(password: string, derive: Derive = derivePassword): Promise<Required<StoredPassword>> {
  const passwordSalt = randomBytes(SALT_BYTES).toString("base64url");
  const passwordHash = (await derive(password, passwordSalt, CURRENT_PASSWORD_SCHEME)).toString("base64url");
  return { passwordHash, passwordSalt, passwordScheme: CURRENT_PASSWORD_SCHEME };
}

export function schemeOf(stored: Partial<StoredPassword>): PasswordScheme {
  const scheme = stored.passwordScheme;
  return typeof scheme === "string" && (SCHEMES as string[]).includes(scheme) ? (scheme as PasswordScheme) : LEGACY_PASSWORD_SCHEME;
}

/**
 * Checks a password against a stored hash — or against nothing, for an email with no account, in
 * the same time. `upgrade` is true when the password matched a hash at an older cost.
 */
export async function checkPassword(password: string, stored: StoredPassword | null, derive: Derive = derivePassword) {
  const own = stored ? schemeOf(stored) : null;
  const derived = await Promise.all(SCHEMES.map((scheme) => derive(password, scheme === own ? stored!.passwordSalt : EQUALIZER_SALT, scheme)));
  if (!stored || !own) return { ok: false, upgrade: false };
  const supplied = derived[SCHEMES.indexOf(own)];
  const expected = Buffer.from(stored.passwordHash, "base64url");
  const ok = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  return { ok, upgrade: ok && own !== CURRENT_PASSWORD_SCHEME };
}
