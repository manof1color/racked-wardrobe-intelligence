import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { deviceLabel } from "@/lib/device-label";
import { knownDeviceCookie } from "@/lib/known-device";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readJsonObject } from "@/lib/request-input";
import { createSessionToken } from "@/lib/session";
import { claimTwoStepAttempt } from "@/lib/server/abuse-guard";
import { getAccount, recordAccountActivity, spendSecondFactor } from "@/lib/server/production-store";
import { readTwoStepChallenge, recoveryCodesLeft, TWO_STEP_CHALLENGE_COOKIE, TWO_STEP_CHALLENGE_PATH, twoStepEnabled } from "@/lib/two-step";

const clearChallenge = (response: NextResponse) => {
  response.cookies.set(TWO_STEP_CHALLENGE_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: TWO_STEP_CHALLENGE_PATH, maxAge: 0 });
  return response;
};
const expired = () => clearChallenge(NextResponse.json({ error: "Your sign-in timed out. Enter your password again.", restart: true }, { status: 401 }));

/**
 * The second step of signing in with two-step sign-in on. The challenge cookie set by
 * /api/auth/login names the account and expires in five minutes; the body brings a code from the
 * authenticator app, or one recovery code. Every attempt is counted against the account before the
 * code is checked — five per fifteen minutes across all servers — and a wrong code goes into the
 * owner's activity log, because it means someone has their password.
 */
export async function POST(request: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Session security is not configured." }, { status: 503 });
  const challenge = readTwoStepChallenge((await cookies()).get(TWO_STEP_CHALLENGE_COOKIE)?.value, secret);
  if (!challenge) return expired();
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["code", "recoveryCode"]);
    const code = typeof body.code === "string" ? body.code.slice(0, 20) : "";
    const recoveryCode = typeof body.recoveryCode === "string" ? body.recoveryCode.slice(0, 40) : "";
    if (!code && !recoveryCode) throw new RequestRefused("Enter the 6-digit code from your authenticator app.");
    const local = consumeRateLimit(`two-step:${challenge.subject}`, RATE_LIMIT_RULES.twoStep);
    const limit = local.allowed ? await claimTwoStepAttempt(challenge.subject) : local;
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
      return NextResponse.json({ error: `Too many codes tried. Wait ${minutes} minute${minutes === 1 ? "" : "s"}, then try again.` }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    }
    const account = await getAccount(challenge.subject);
    if (!account || !twoStepEnabled(account) || (account.sessionVersion ?? 0) !== challenge.sessionVersion) return expired();
    const device = deviceLabel(request.headers.get("user-agent"));
    const spent = await spendSecondFactor(account, recoveryCode ? { recoveryCode } : { code });
    if (!spent) {
      await recordAccountActivity(account.id, "two-step-failed", device).catch(() => undefined);
      return NextResponse.json({ error: recoveryCode ? "That recovery code didn't work. Each one works only once." : "That code didn't work. Enter the code your authenticator app shows now." }, { status: 401 });
    }
    const token = await createSessionToken({ subject: account.id, role: account.role, sessionVersion: account.sessionVersion ?? 0, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 }, secret);
    await recordAccountActivity(account.id, spent === "recovery" ? "recovery-code-used" : "sign-in", device).catch(() => undefined);
    const production = process.env.NODE_ENV === "production";
    const response = NextResponse.json({ destination: account.role === "consumer" ? "/consumer" : "/brand", ...(spent === "recovery" ? { recoveryCodesLeft: Math.max(0, recoveryCodesLeft(account) - 1) } : {}) });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: production, path: "/", maxAge: 60 * 60 * 24 * 7 });
    const known = knownDeviceCookie(account.email, secret, production);
    response.cookies.set(known.name, known.value, known.options);
    return clearChallenge(response);
  } catch (error) {
    return failureResponse(error, "Two-step sign-in failed", "Sign-in service is temporarily unavailable. Please try again.", 503);
  }
}
