/**
 * Password storage: scrypt at OWASP's minimum cost with a unique random salt, old hashes accepted
 * and upgraded, and the same derivation work whatever the account — or no account.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { checkPassword, CURRENT_PASSWORD_SCHEME, derivationLoad, derivePassword, hashPassword, LEGACY_PASSWORD_SCHEME, MAX_CONCURRENT_DERIVATIONS, PASSWORD_SCHEMES, schemeOf, type Derive } from "../lib/password-hash.ts";

const PASSWORD = "Synthetic-Pass-2026";

test("REGRESSION: new hashes use scrypt at N = 2^17, r = 8, p = 1 with a unique 18-byte salt", async () => {
  assert.deepEqual(PASSWORD_SCHEMES[CURRENT_PASSWORD_SCHEME], { N: 131072, r: 8, p: 1 });
  const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
  assert.equal(first.passwordScheme, "scrypt-n17");
  assert.equal(Buffer.from(first.passwordSalt, "base64url").length, 18);
  assert.notEqual(first.passwordSalt, second.passwordSalt, "every hash gets its own salt");
  assert.notEqual(first.passwordHash, second.passwordHash);
  const expected = scryptSync(PASSWORD, first.passwordSalt, 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString("base64url");
  assert.equal(first.passwordHash, expected, "the stored hash is exactly scrypt at the stated cost");
});

test("a hash stored at the old cost still signs in, and is marked for upgrade", async () => {
  const salt = "legacy-salt-0123456789";
  const legacy = { passwordHash: scryptSync(PASSWORD, salt, 64).toString("base64url"), passwordSalt: salt };
  assert.equal(schemeOf(legacy), LEGACY_PASSWORD_SCHEME, "no scheme means the old one");
  assert.deepEqual(await checkPassword(PASSWORD, legacy), { ok: true, upgrade: true });
  assert.deepEqual(await checkPassword("Wrong-Pass-2026", legacy), { ok: false, upgrade: false });
  const current = await hashPassword(PASSWORD);
  assert.deepEqual(await checkPassword(PASSWORD, current), { ok: true, upgrade: false });
  assert.deepEqual(await checkPassword("Wrong-Pass-2026", current), { ok: false, upgrade: false });
});

test("REGRESSION: every check does the same derivation work — unknown email, old hash, or new", async () => {
  const work = async (stored: Parameters<typeof checkPassword>[1]) => {
    const calls: string[] = [];
    const spy: Derive = async (_password, _salt, scheme) => { calls.push(scheme); return Buffer.alloc(64); };
    await checkPassword(PASSWORD, stored, spy);
    return calls.sort();
  };
  const both = Object.keys(PASSWORD_SCHEMES).sort();
  assert.deepEqual(await work(null), both, "an email with no account");
  assert.deepEqual(await work({ passwordHash: "x", passwordSalt: "s" }), both, "an old hash");
  assert.deepEqual(await work({ passwordHash: "x", passwordSalt: "s", passwordScheme: CURRENT_PASSWORD_SCHEME }), both, "a current hash");
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
