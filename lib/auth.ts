import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "./session";
import type { Role } from "./types";
import { getAccount } from "./server/production-store";

export const SESSION_COOKIE = "racked_session";

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  const session=await verifySessionToken(token, secret);
  if(!session)return null;
  const account=await getAccount(session.subject);
  if(!account||account.role!==session.role||(session.sessionVersion??0)!==(account.sessionVersion??0))return null;
  return session;
}

export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(session.role === "consumer" ? "/consumer" : "/brand");
  return session;
}
