import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { failureResponse, RequestRefused } from "@/lib/api-errors";
import { consumeRateLimit, RATE_LIMIT_RULES } from "@/lib/rate-limit";
import { onlyFields, readJsonObject } from "@/lib/request-input";
import { beginTwoStepSetup, getAccount, verifyAccountPassword } from "@/lib/server/production-store";
import { base32Encode, otpauthUri, twoStepOffered } from "@/lib/two-step";

/**
 * Starts setting up two-step sign-in on a brand account. It takes the current password, so someone
 * holding only a stolen session cookie cannot attach their own authenticator and lock the owner out.
 * The new secret goes back to this browser once, for the QR code; the server keeps it sealed.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "brand") return NextResponse.json({ error: "Two-step sign-in is available on brand accounts." }, { status: 403 });
  const limit = consumeRateLimit(`two-step-settings:${session.subject}`, RATE_LIMIT_RULES.twoStep);
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  try {
    const body = await readJsonObject(request);
    onlyFields(body, ["currentPassword"]);
    const password = typeof body.currentPassword === "string" ? body.currentPassword.slice(0, 1_024) : "";
    if (!password) throw new RequestRefused("Enter your current password.");
    const account = await getAccount(session.subject);
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (!twoStepOffered(account)) return NextResponse.json({ error: "Shared demo accounts can't turn on two-step sign-in, so no one can lock the others out." }, { status: 403 });
    if (!await verifyAccountPassword(account, password)) return NextResponse.json({ error: "Current password was incorrect." }, { status: 401 });
    const secret = await beginTwoStepSetup(account.id);
    return NextResponse.json({ secret: base32Encode(secret), uri: otpauthUri(secret, account.email) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failureResponse(error, "Two-step setup could not start", "Two-step setup could not start. Try again.", 503);
  }
}
