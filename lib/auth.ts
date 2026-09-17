import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { redirectForRequiredRole, resolveAuthenticatedSession } from "./session";
import type { Role } from "./types";
import { getAccount } from "./server/production-store";

export const SESSION_COOKIE = "racked_session";

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET;
  return resolveAuthenticatedSession({token,secret,getAccount});
}

export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  const destination=redirectForRequiredRole(session.role,role);
  if(destination)redirect(destination);
  return session;
}
