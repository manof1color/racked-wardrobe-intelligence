import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { BRAND_STATUS_MESSAGES, brandStatusOf } from "@/lib/brand-approval";
import { sessionForAccount, verifySessionToken, type SessionPayload } from "@/lib/session";
import { getAccount, type AccountRecord } from "@/lib/server/production-store";

export type BrandAccess =
  | { ok: true; session: SessionPayload; account: AccountRecord }
  | { ok: false; response: NextResponse };

/**
 * The one check every brand route makes before anything else: a valid session, on a brand
 * account, that the owner has approved (lib/brand-approval.ts). It reads the account once — the
 * same strongly consistent read the session check needs — so it costs no more than `getSession`.
 */
export async function brandAccess(): Promise<BrandAccess> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value, secret = process.env.SESSION_SECRET;
  const payload = token && secret ? await verifySessionToken(token, secret) : null;
  const account = payload ? await getAccount(payload.subject) : null;
  const session = payload ? sessionForAccount(payload, account) : null;
  if (!session || !account) return { ok: false, response: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) };
  const status = brandStatusOf(account);
  if (!status) return { ok: false, response: NextResponse.json({ error: "Brand account required." }, { status: 403 }) };
  if (status !== "approved") return { ok: false, response: NextResponse.json({ error: BRAND_STATUS_MESSAGES[status], brandStatus: status }, { status: 403 }) };
  return { ok: true, session, account };
}
