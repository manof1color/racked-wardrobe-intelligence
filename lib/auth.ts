import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "./session";
import type { Role } from "./types";

export const SESSION_COOKIE = "racked_session";

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return null;
  return verifySessionToken(token, secret);
}

export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== role) redirect(session.role === "consumer" ? "/consumer" : "/brand");
  return session;
}
