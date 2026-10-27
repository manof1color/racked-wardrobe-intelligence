/**
 * Password storage: scrypt at OWASP's minimum cost with a unique random salt once switched on, old
 * hashes accepted and upgraded, a rollback that never locks anyone out, and the same derivation
 * work whatever the account — or no account.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { checkPassword, currentPasswordScheme, derivationLoad, derivePassword, hashPassword, LEGACY_PASSWORD_SCHEME, MAX_CONCURRENT_DERIVATIONS, PASSWORD_SCHEMES, schemeOf, STRONG_PASSWORD_SCHEME, type Derive } from "../lib/password-hash.ts";

const PASSWORD = "Synthetic-Pass-2026";

test("REGRESSION: switched on, new hashes use scrypt at N = 2^17, r = 8, p = 1 with a unique 18-byte salt", async () => {
  assert.deepEqual(PASSWORD_SCHEMES[STRONG_PASSWORD_SCHEME], { N: 131072, r: 8, p: 1 });
  assert.equal(currentPasswordScheme("scrypt-n17"), STRONG_PASSWORD_SCHEME);
  const [first, second] = await Promise.all([hashPassword(PASSWORD, derivePassword, STRONG_PASSWORD_SCHEME), hashPassword(PASSWORD, derivePassword, STRONG_PASSWORD_SCHEME)]);
  assert.equal(first.passwordScheme, "scrypt-n17");
  assert.equal(Buffer.from(first.passwordSalt, "base64url").length, 18);
  assert.notEqual(first.passwordSalt, second.passwordSalt, "every hash gets its own salt");
  assert.notEqual(first.passwordHash, second.passwordHash);
  const expected = scryptSync(PASSWORD, first.passwordSalt, 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString("base64url");
  assert.equal(first.passwordHash, expected, "the stored hash is exactly scrypt at the stated cost");
});

test("until it is switched on, new hashes stay readable by the release before this one", async () => {
  assert.equal(currentPasswordScheme(undefined), LEGACY_PASSWORD_SCHEME);
  assert.equal(currentPasswordScheme("anything-else"), LEGACY_PASSWORD_SCHEME);
  const hashed = await hashPassword(PASSWORD, derivePassword, currentPasswordScheme(undefined));
  // The previous release derived scrypt(password, salt, 64) at Node's defaults and ignored the scheme.
  assert.equal(hashed.passwordHash, scryptSync(PASSWORD, hashed.passwordSalt, 64).toString("base64url"), "a rollback can still check it");
  assert.equal(Buffer.from(hashed.passwordSalt, "base64url").length, 18);
});

test("an old-cost hash signs in, and is upgraded only once the strong scheme is on — never downgraded", async () => {
  const salt = "legacy-salt-0123456789";
  const legacy = { passwordHash: scryptSync(PASSWORD, salt, 64).toString("base64url"), passwordSalt: salt };
  assert.equal(schemeOf(legacy), LEGACY_PASSWORD_SCHEME, "no scheme means the old one");
  assert.deepEqual(await checkPassword(PASSWORD, legacy, derivePassword, STRONG_PASSWORD_SCHEME), { ok: true, upgrade: true });
  assert.deepEqual(await checkPassword(PASSWORD, legacy, derivePassword, LEGACY_PASSWORD_SCHEME), { ok: true, upgrade: false }, "switched off, nothing is rewritten");
  assert.deepEqual(await checkPassword("Wrong-Pass-2026", legacy, derivePassword, STRONG_PASSWORD_SCHEME), { ok: false, upgrade: false });
  const strong = await hashPassword(PASSWORD, derivePassword, STRONG_PASSWORD_SCHEME);
  assert.deepEqual(await checkPassword(PASSWORD, strong, derivePassword, STRONG_PASSWORD_SCHEME), { ok: true, upgrade: false });
  assert.deepEqual(await checkPassword(PASSWORD, strong, derivePassword, LEGACY_PASSWORD_SCHEME), { ok: true, upgrade: false }, "a strong hash still verifies, and is not downgraded, if the switch is turned off");
});

test("REGRESSION: every check does the same derivation work — unknown email, old hash, or new", async () => {
  const work = async (stored: Parameters<typeof checkPassword>[1]) => {
    const calls: string[] = [];
    const spy: Derive = async (_password, _salt, scheme) => { calls.push(scheme); return Buffer.alloc(64); };
    await checkPassword(PASSWORD, stored, spy, STRONG_PASSWORD_SCHEME);
    return calls.sort();
  };
  const both = Object.keys(PASSWORD_SCHEMES).sort();
  assert.deepEqual(await work(null), both, "an email with no account");
  assert.deepEqual(await work({ passwordHash: "x", passwordSalt: "s" }), both, "an old hash");
  assert.deepEqual(await work({ passwordHash: "x", passwordSalt: "s", passwordScheme: STRONG_PASSWORD_SCHEME }), both, "a strong hash");
  assert.deepEqual(await checkPassword(PASSWORD, null), { ok: false, upgrade: false });
});

test("at most two derivations run at once, so a burst of sign-ins cannot exhaust memory", async () => {
  assert.equal(MAX_CONCURRENT_DERIVATIONS, 2);
  const pending = Array.from({ length: 5 }, (_, index) => derivePassword(`${PASSWORD}-${index}`, "salt", LEGACY_PASSWORD_SCHEME));
  await Promise.resolve();
  assert.deepEqual(derivationLoad(), { running: 2, waiting: 3 });
  const keys = await Promise.all(pending);
  assert.equal(new Set(keys.map((key) => key.toString("hex"))).size, 5, "every queued derivation still completes");
  assert.deepEqual(derivationLoad(), { running: 0, waiting: 0 });
});
