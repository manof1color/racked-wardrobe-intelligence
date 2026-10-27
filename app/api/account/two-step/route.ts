import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { deviceLabel } from "@/lib/device-label";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readJsonObject } from "@/lib/request-input";
import { claimTwoStepAttempt } from "@/lib/server/abuse-guard";
import { getAccount, recordAccountActivity, spendSecondFactor, turnOffTwoStep, verifyAccountPassword } from "@/lib/server/production-store";
import { recoveryCodesLeft, twoStepEnabled, twoStepOffered } from "@/lib/two-step";

/** Whether two-step sign-in is offered to this account and on, and how many recovery codes are left. Never the secret. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const account = await getAccount(session.subject);
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const enabled = twoStepEnabled(account);
  return NextResponse.json({ available: twoStepOffered(account) || enabled, enabled, enabledAt: enabled ? account.twoStepEnabledAt ?? null : null, recoveryCodesLeft: enabled ? recoveryCodesLeft(account) : 0 });
}

/**
 * Turns two-step sign-in off. It takes the current password and a current code (or a recovery code),
 * so someone holding only a stolen session cookie cannot remove it.
 */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limit = consumeRateLimit(`two-step-settings:${session.subject}`, RATE_LIMIT_RULES.twoStep);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["currentPassword", "code", "recoveryCode"]);
    const password = typeof body.currentPassword === "string" ? body.currentPassword.slice(0, 1_024) : "";
    const code = typeof body.code === "string" ? body.code.slice(0, 20) : "";
    const recoveryCode = typeof body.recoveryCode === "string" ? body.recoveryCode.slice(0, 40) : "";
    if (!password || (!code && !recoveryCode)) throw new RequestRefused("Enter your current password and a code from your authenticator app.");
    const attempt = await claimTwoStepAttempt(session.subject);
    if (!attempt.allowed) return NextResponse.json({ error: "Too many codes tried. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(attempt.retryAfterSeconds) } });
    const account = await getAccount(session.subject);
    if (!account || !twoStepEnabled(account)) throw new RequestRefused("Two-step sign-in is already off.", 409);
    if (!await verifyAccountPassword(account, password)) return NextResponse.json({ error: "Current password was incorrect." }, { status: 401 });
    if (!await spendSecondFactor(account, recoveryCode ? { recoveryCode } : { code })) return NextResponse.json({ error: "That code didn't work. Enter the code your authenticator app shows now." }, { status: 401 });
    await turnOffTwoStep(account);
    await recordAccountActivity(account.id, "two-step-off", deviceLabel(request.headers.get("user-agent"))).catch(() => undefined);
    return NextResponse.json({ enabled: false });
  } catch (error) {
    return failureResponse(error, "Two-step sign-in could not be turned off", "Two-step sign-in could not be turned off. Try again.", 503);
  }
}
