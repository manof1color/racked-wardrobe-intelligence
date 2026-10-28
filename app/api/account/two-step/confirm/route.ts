import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { deviceLabel } from "@/lib/device-label";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readJsonObject } from "@/lib/request-input";
import { createSessionToken } from "@/lib/session";
import { confirmTwoStepSetup, recordAccountActivity } from "@/lib/server/production-store";

/**
 * Finishes setup: the first code from the new authenticator turns two-step sign-in on. Every other
 * session ends, and this device gets a fresh one. The recovery codes are in this response and nowhere
 * else in plain form.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Two-step sign-in is available on brand accounts." }, { status: 403 });
  const limit = consumeRateLimit(`two-step-settings:${session.subject}`, RATE_LIMIT_RULES.twoStep);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: "Session security is not configured." }, { status: 503 });
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["code"]);
    if (typeof body.code !== "string" || !body.code.trim()) throw new RequestRefused("Enter the 6-digit code from your authenticator app.");
    const confirmed = await confirmTwoStepSetup(session.subject, body.code.slice(0, 20));
    if (!confirmed) return NextResponse.json({ error: "That code didn't match. Enter the code the app shows now, or start setup again if it has been more than ten minutes." }, { status: 400 });
    const { account, recoveryCodes } = confirmed;
    await recordAccountActivity(account.id, "two-step-on", deviceLabel(request.headers.get("user-agent"))).catch(() => undefined);
    const token = await createSessionToken({ subject: account.id, role: account.role, sessionVersion: account.sessionVersion ?? 0, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 }, secret);
    const response = NextResponse.json({ enabled: true, recoveryCodes }, { headers: { "cache-control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return response;
  } catch (error) {
    return failureResponse(error, "Two-step setup could not finish", "Two-step sign-in could not be turned on. Try again.", 503);
  }
}
