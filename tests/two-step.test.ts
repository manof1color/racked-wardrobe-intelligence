/**
 * Two-step sign-in for brand accounts: a code from an authenticator app as well as the password.
 * The arithmetic is checked against the RFCs' own vectors; the rest checks that a code works once,
 * that the stored secret is useless without the server's key, that the in-between challenge can
 * never act as a session, and that guessing is counted before it is checked.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptedStep, base32Encode, createRecoveryCodes, createTwoStepChallenge, hotp, isRecoveryCodeShape, openSecret, otpauthUri, readTwoStepChallenge, recoveryCodeHash, recoveryCodesLeft, sealSecret, timeStep, totp, TWO_STEP_CHALLENGE_MS, twoStepEnabled, twoStepOffered } from "../lib/two-step.ts";
import { createSessionToken, verifySessionToken } from "../lib/session.ts";
import { DURABLE_LIMITS } from "../lib/abuse-limits.ts";
import { ACTIVITY_LABELS, WARNING_ACTIVITY } from "../lib/device-label.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const RFC_SECRET = Buffer.from("12345678901234567890");
const SESSION_SECRET = "harness-only-session-secret-0123456789abcdef";
const ACCOUNT = "7f1c2a9e-0000-4000-8000-000000000001";

test("base32 matches RFC 4648, without padding", () => {
  const vectors: Array<[string, string]> = [["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]];
  for (const [plain, encoded] of vectors) assert.equal(base32Encode(Buffer.from(plain)), encoded, plain);
});

test("codes match RFC 4226 and RFC 6238", () => {
  const hotpVectors = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  hotpVectors.forEach((expected, counter) => assert.equal(hotp(RFC_SECRET, counter), expected, `counter ${counter}`));
  const totpVectors: Array<[number, string]> = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
  for (const [seconds, expected] of totpVectors) assert.equal(totp(RFC_SECRET, seconds * 1000, 8), expected, `T=${seconds}`);
});

test("a code is accepted within one step of now, and only once", () => {
  const now = 1_793_000_000_000, step = timeStep(now);
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step), now), step);
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step - 1), now), step - 1, "a phone clock 30 seconds slow");
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step + 1), now), step + 1, "a phone clock 30 seconds fast");
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step - 2), now), null, "a code a minute old");
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step + 2), now), null);
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step), now, step), null, "REPLAY: the step already used");
  assert.equal(acceptedStep(RFC_SECRET, hotp(RFC_SECRET, step - 1), now, step), null, "nor an earlier one");
  const spaced = hotp(RFC_SECRET, step).replace(/^(\d{3})/, "$1 ");
  assert.equal(acceptedStep(RFC_SECRET, spaced, now), step, "a space typed in the middle is fine");
  for (const junk of ["", "12345", "1234567", "abcdef", 123456, null, undefined]) assert.equal(acceptedStep(RFC_SECRET, junk, now), null, String(junk));
});

test("the stored secret opens only for its own account, under the server's key", () => {
  const sealed = sealSecret(RFC_SECRET, SESSION_SECRET, ACCOUNT);
  assert.match(sealed, /^v1\.[\w-]{16}\.[\w-]+$/);
  assert.ok(!sealed.includes(base32Encode(RFC_SECRET)) && !sealed.includes(RFC_SECRET.toString("base64url")), "no form of the secret is readable");
  assert.notEqual(sealSecret(RFC_SECRET, SESSION_SECRET, ACCOUNT), sealed, "each seal uses a fresh IV");
  assert.deepEqual(openSecret(sealed, SESSION_SECRET, ACCOUNT), RFC_SECRET);
  assert.equal(openSecret(sealed, SESSION_SECRET, "7f1c2a9e-0000-4000-8000-000000000002"), null, "copied onto another account, it does not open");
  assert.equal(openSecret(sealed, `${SESSION_SECRET}x`, ACCOUNT), null, "a copy of the table without the key is useless");
  const [version, iv, body] = sealed.split(".");
  const flipped = Buffer.from(body, "base64url"); flipped[0] ^= 1;
  assert.equal(openSecret(`${version}.${iv}.${flipped.toString("base64url")}`, SESSION_SECRET, ACCOUNT), null, "an altered secret is refused, not misread");
  for (const junk of [undefined, 7, "", "v1", "v2.a.b", `v1.${iv}`, "v1.short.AAAA"]) assert.equal(openSecret(junk, SESSION_SECRET, ACCOUNT), null, String(junk));
});

test("recovery codes are random, single-format, and stored only as hashes per account", () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[a-z2-7]{4}-[a-z2-7]{4}-[a-z2-7]{4}-[a-z2-7]{4}$/, "16 base32 characters: 80 random bits");
  const [first] = codes;
  assert.ok(isRecoveryCodeShape(first.toUpperCase().replaceAll("-", " ")), "typed in capitals with spaces still counts");
  assert.equal(recoveryCodeHash(ACCOUNT, first), recoveryCodeHash(ACCOUNT, first.toUpperCase().replaceAll("-", "")));
  assert.notEqual(recoveryCodeHash(ACCOUNT, first), recoveryCodeHash("another-account", first), "the same code is a different hash on another account");
  assert.ok(!recoveryCodeHash(ACCOUNT, first).includes(first.replaceAll("-", "")));
  for (const junk of ["", "abcd-efgh", "abcd-efgh-ijkl-mno1", 42, "a".repeat(41)]) assert.equal(isRecoveryCodeShape(junk), false, String(junk));
  assert.equal(recoveryCodesLeft({ twoStepRecovery: new Set(["a", "b"]) }), 2);
  assert.equal(recoveryCodesLeft({}), 0);
});

test("the challenge between password and code is never a session, and a session is never a challenge", async () => {
  const now = Date.now();
  const challenge = createTwoStepChallenge({ subject: ACCOUNT, sessionVersion: 3, expiresAt: now + TWO_STEP_CHALLENGE_MS }, SESSION_SECRET);
  assert.deepEqual(readTwoStepChallenge(challenge, SESSION_SECRET, now), { subject: ACCOUNT, sessionVersion: 3, expiresAt: now + TWO_STEP_CHALLENGE_MS });
  assert.equal(await verifySessionToken(challenge, SESSION_SECRET, now), null, "a challenge cannot be used as a session cookie");
  const session = await createSessionToken({ subject: ACCOUNT, role: "brand", sessionVersion: 3, expiresAt: now + 60_000 }, SESSION_SECRET);
  assert.equal(readTwoStepChallenge(session, SESSION_SECRET, now), null, "nor a session as a challenge");
  assert.equal(readTwoStepChallenge(challenge, SESSION_SECRET, now + TWO_STEP_CHALLENGE_MS), null, "it expires after five minutes");
  const longLived = createTwoStepChallenge({ subject: ACCOUNT, sessionVersion: 3, expiresAt: now + 60 * 60_000 }, SESSION_SECRET);
  assert.equal(readTwoStepChallenge(longLived, SESSION_SECRET, now), null, "and cannot be minted to last longer");
  const [body, signature] = challenge.split(".");
  const other = Buffer.from(JSON.stringify({ subject: "someone-else", sessionVersion: 3, expiresAt: now + 60_000 })).toString("base64url");
  assert.equal(readTwoStepChallenge(`${other}.${signature}`, SESSION_SECRET, now), null, "the account in it cannot be swapped");
  assert.equal(readTwoStepChallenge(`${body}.${signature}`, `${SESSION_SECRET}x`, now), null);
  for (const junk of [undefined, "", "a.b.c", `${body}.`, "x".repeat(700)]) assert.equal(readTwoStepChallenge(junk, SESSION_SECRET, now), null, String(junk).slice(0, 20));
});

test("the setup link names Racked, the account, and the standard settings", () => {
  const uri = otpauthUri(RFC_SECRET, "brand+owner@example.test");
  assert.equal(uri, `otpauth://totp/Racked:brand%2Bowner%40example.test?secret=${base32Encode(RFC_SECRET)}&issuer=Racked&algorithm=SHA1&digits=6&period=30`);
});

test("the right password alone gives a brand with two-step on a challenge, not a session", () => {
  const login = read("app/api/auth/login/route.ts");
  const branch = login.indexOf("if(twoStepEnabled(account)){");
  assert.ok(branch > 0 && branch < login.indexOf("const token=await createSessionToken("), "the two-step branch returns before any session is made");
  const challenge = login.slice(branch, login.indexOf("return response;", branch));
  assert.doesNotMatch(challenge, /SESSION_COOKIE|knownDeviceCookie/, "no session and no known-device cookie until the code is right");
  assert.match(challenge, /httpOnly:true,sameSite:"strict",secure:production,path:TWO_STEP_CHALLENGE_PATH/);
  assert.equal(twoStepEnabled({ twoStepSecret: "v1.x.y" }), true);
  assert.equal(twoStepEnabled({}), false);
});

test("each code is counted before it is checked, across every server, and failing closed", () => {
  assert.deepEqual(DURABLE_LIMITS.twoStepAttemptsPerAccount, { limit: 5, windowMs: 15 * 60 * 1000 });
  const guard = read("lib/server/abuse-guard.ts");
  const claim = guard.slice(guard.indexOf("export async function claimTwoStepAttempt"), guard.indexOf("export function spendAiAllowance"));
  assert.match(claim, /incrementSecurityCounter\(`two-step-attempts:\$\{accountId\}`/, "counted first, so a burst of requests cannot all be checked");
  assert.match(claim, /return \{ allowed: false, retryAfterSeconds: 60 \};/, "an unreadable counter refuses, it does not wave codes through");
  const route = read("app/api/auth/two-step/route.ts");
  assert.ok(route.indexOf("claimTwoStepAttempt(challenge.subject)") < route.indexOf("spendSecondFactor("));
  assert.match(route, /recordAccountActivity\(account\.id, "two-step-failed", device\)/, "the owner sees that someone has their password");
  assert.match(route, /\(account\.sessionVersion \?\? 0\) !== challenge\.sessionVersion\) return expired\(\)/, "a password change or sign-out-everywhere ends a pending sign-in");
  for (const path of ["app/api/account/two-step/route.ts", "app/api/account/two-step/recovery-codes/route.ts"]) assert.ok(read(path).indexOf("claimTwoStepAttempt(session.subject)") < read(path).indexOf("spendSecondFactor("), path);
});

test("a code and a recovery code can each be spent once, even by requests sent together", () => {
  const store = read("lib/server/production-store.ts");
  const spend = store.slice(store.indexOf("export async function spendSecondFactor"), store.indexOf("export async function replaceRecoveryCodes"));
  assert.match(spend, /ConditionExpression:"twoStepSecret = :sealed AND \(attribute_not_exists\(twoStepLastStep\) OR twoStepLastStep < :step\)"/);
  assert.match(spend, /UpdateExpression:"DELETE twoStepRecovery :spent",ConditionExpression:"twoStepSecret = :sealed AND contains\(twoStepRecovery, :hash\)"/);
  const confirm = store.slice(store.indexOf("export async function confirmTwoStepSetup"), store.indexOf("export async function spendSecondFactor"));
  assert.match(confirm, /sessionVersion = if_not_exists\(sessionVersion, :zero\) \+ :one REMOVE twoStepPendingSecret/, "turning it on signs every other device out");
  assert.match(store, /ConditionExpression:"attribute_exists\(PK\) AND attribute_not_exists\(twoStepSecret\)"/, "setup can never replace an authenticator in use");
});

test("only the owner, with their password, can set it up or turn it off; brands only", () => {
  const setup = read("app/api/account/two-step/setup/route.ts");
  assert.match(setup, /if \(session\.role !== "brand"\) return/);
  assert.match(setup, /verifyAccountPassword\(account, password\)/, "a stolen session cookie cannot attach its own authenticator");
  assert.ok(setup.indexOf("if (!twoStepOffered(account)) return") < setup.indexOf("beginTwoStepSetup("), "the shared judge accounts are refused before a secret exists");
  assert.equal(twoStepOffered({ role: "brand" }), true);
  assert.equal(twoStepOffered({ role: "brand", dataClassification: "REGULAR" }), true);
  assert.equal(twoStepOffered({ role: "brand", dataClassification: "DEMO" }), false, "one judge turning it on would lock the others out");
  assert.equal(twoStepOffered({ role: "consumer" }), false);
  assert.match(read("app/api/account/two-step/confirm/route.ts"), /if \(session\.role !== "brand"\) return/);
  const off = read("app/api/account/two-step/route.ts");
  const remove = off.slice(off.indexOf("export async function DELETE"));
  assert.ok(remove.indexOf("verifyAccountPassword(") < remove.indexOf("turnOffTwoStep(") && remove.indexOf("spendSecondFactor(") < remove.indexOf("turnOffTwoStep("), "password and a code, both, before it is removed");
});

test("the secret and recovery hashes never leave the server after setup", () => {
  const status = read("app/api/account/two-step/route.ts");
  const get = status.slice(status.indexOf("export async function GET"), status.indexOf("export async function DELETE"));
  assert.match(get, /NextResponse\.json\(\{ available: twoStepOffered\(account\) \|\| enabled, enabled, enabledAt: [^}]+, recoveryCodesLeft: [^}]+\}\)/);
  assert.doesNotMatch(get, /twoStepSecret|twoStepRecovery[^C]|\.\.\.account/);
  const account = read("app/api/account/route.ts");
  assert.doesNotMatch(account, /twoStep|\.\.\.account/, "account details are listed field by field");
  assert.match(read("components/two-step-setting.tsx"), /import \{ encode \} from "uqr";/, "the QR code is drawn in the browser, not by a QR web service");
});

test("two-step events read plainly in the activity log, and a wrong code stands out", () => {
  for (const type of ["two-step-on", "two-step-off", "two-step-failed", "recovery-code-used", "recovery-codes-replaced"] as const) assert.ok(ACTIVITY_LABELS[type], type);
  assert.ok(WARNING_ACTIVITY.has("two-step-failed") && WARNING_ACTIVITY.has("sign-in-failed"));
});
