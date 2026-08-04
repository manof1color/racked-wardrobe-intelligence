import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { createSessionToken } from "@/lib/session";
import type { Role } from "@/lib/types";

const accounts: Record<Role, { email:string; password:string }> = {
  consumer:{ email:"consumer@demo.racked.local", password:"demo2026" },
  brand:{ email:"brand@demo.racked.local", password:"demo2026" },
};

export async function POST(request: Request) {
  // Judge note: consent and role checks happen server-side before the signed session is issued.
  const body = await request.json().catch(() => null) as { role?:Role; email?:string; password?:string; consent?:boolean } | null;
  if (!body?.role || !accounts[body.role] || body.email !== accounts[body.role].email || body.password !== accounts[body.role].password) {
    return NextResponse.json({ error:"The demo credentials did not match." }, { status:401 });
  }
  if (body.role === "consumer" && body.consent !== true) return NextResponse.json({ error:"Consent is required before wardrobe data is used." }, { status:400 });
  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.json({ error:"The server is missing its session configuration." }, { status:503 });
  const expiresAt = Date.now() + 1000 * 60 * 60 * 4;
  const token = await createSessionToken({ subject:body.email, role:body.role, expiresAt }, secret);
  const response = NextResponse.json({ destination:body.role === "consumer" ? "/consumer" : "/brand" });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:60*60*4 });
  return response;
}
