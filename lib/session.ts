import type { Role } from "./types";
import { timingSafeEqual } from "node:crypto";

export interface SessionPayload { subject: string; role: Role; expiresAt: number; sessionVersion?: number; }
const encoder = new TextEncoder();

function base64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  return Buffer.from(bytes).toString("base64url");
}

async function signature(data: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))));
}

export async function createSessionToken(payload: SessionPayload, secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  const body = base64url(JSON.stringify(payload));
  return `${body}.${await signature(body, secret)}`;
}

export async function verifySessionToken(token: string, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  try {
    const [body, supplied] = token.split(".");
    if (!body || !supplied) return null;
    const suppliedBytes=Buffer.from(supplied,"base64url");
    const expectedBytes=Buffer.from(await signature(body,secret),"base64url");
    if (suppliedBytes.length!==expectedBytes.length || !timingSafeEqual(suppliedBytes,expectedBytes)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.subject || !["consumer","brand"].includes(payload.role) || payload.expiresAt <= now || (payload.sessionVersion!==undefined&&(!Number.isInteger(payload.sessionVersion)||payload.sessionVersion<0))) return null;
    return payload;
  } catch { return null; }
}
