import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { deviceLabel } from "@/lib/device-label";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readJsonObject } from "@/lib/request-input";
import { claimTwoStepAttempt } from "@/lib/server/abuse-guard";
import { getAccount, recordAccountActivity, replaceRecoveryCodes, spendSecondFactor } from "@/lib/server/production-store";
import { twoStepEnabled } from "@/lib/two-step";

/** Ten new recovery codes for a current code from the authenticator app; every unused old code stops working. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limit = consumeRateLimit(`two-step-settings:${session.subject}`, RATE_LIMIT_RULES.twoStep);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["code"]);
    if (typeof body.code !== "string" || !body.code.trim()) throw new RequestRefused("Enter the 6-digit code from your authenticator app.");
    const attempt = await claimTwoStepAttempt(session.subject);
    if (!attempt.allowed) return NextResponse.json({ error: "Too many codes tried. Try again in a few minutes." }, { status: 429, headers: { "retry-after": String(attempt.retryAfterSeconds) } });
    const account = await getAccount(session.subject);
    if (!account || !twoStepEnabled(account)) throw new RequestRefused("Two-step sign-in is off.", 409);
    if (!await spendSecondFactor(account, { code: body.code.slice(0, 20) })) return NextResponse.json({ error: "That code didn't work. Enter the code your authenticator app shows now." }, { status: 401 });
    const recoveryCodes = await replaceRecoveryCodes(account);
    await recordAccountActivity(account.id, "recovery-codes-replaced", deviceLabel(request.headers.get("user-agent"))).catch(() => undefined);
    return NextResponse.json({ recoveryCodes }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failureResponse(error, "Recovery codes could not be replaced", "New recovery codes could not be created. Try again.", 503);
  }
}
