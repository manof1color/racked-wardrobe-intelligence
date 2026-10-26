import { isTrustedOrigin, type OriginEnvironment } from "./site-origin.ts";

/**
 * The first check every API request meets, before any route code runs.
 *
 * Two attacks are stopped here rather than in each of the app's routes:
 *
 * - **Cross-site request forgery.** A page on another site can make a signed-in person's browser
 *   send a POST to Racked. Session cookies are already SameSite=Lax, which blocks most of these;
 *   this is the second lock. A state-changing request must carry an Origin on Racked's explicit
 *   allowlist (lib/site-origin.ts) — never one that merely matches the request's own Host or
 *   X-Forwarded-Host, which a client can influence. When a browser sends no Origin, it must not
 *   mark the request cross-site. A client that is not a browser cannot carry anyone's cookies, so
 *   it gains nothing here.
 * - **Oversized bodies.** A route that parses a request reads all of it into memory first, so an
 *   enormous body is a cheap way to exhaust a server. A declared length over the cap is refused
 *   here; a body with no declared length must not be streamed; and the route-level readers in
 *   lib/request-body.ts stop reading at the same cap whatever the headers claimed.
 *
 * Pure, with no Node APIs, so it runs in Next.js middleware and in plain unit tests alike.
 */

export const MAX_JSON_BODY_BYTES = 64 * 1024;
export const MAX_UPLOAD_BODY_BYTES = 16 * 1024 * 1024;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** Browsers may send violation reports without an Origin; they only ever add a log line. */
const ORIGIN_EXEMPT_PATHS = new Set(["/api/security/csp-report"]);

export interface GuardRequest {
  method: string;
  pathname: string;
  headers: { get(name: string): string | null };
  /** Where the trusted origins come from; never the request itself. */
  environment?: OriginEnvironment;
}

export type GuardDecision = { allowed: true } | { allowed: false; status: 403 | 411 | 413; error: string };

const FORGED = { allowed: false, status: 403, error: "This request must come from Racked itself." } as const;

export function guardRequest(request: GuardRequest): GuardDecision {
  const method = request.method.toUpperCase();
  if (!MUTATING.has(method)) return { allowed: true };
  const { headers } = request;

  if (!ORIGIN_EXEMPT_PATHS.has(request.pathname)) {
    const origin = headers.get("origin");
    if (origin) {
      if (origin === "null" || !isTrustedOrigin(origin, request.environment)) return FORGED;
    } else if ((headers.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
      return FORGED;
    }
  }

  const declared = headers.get("content-length");
  if (declared === null) {
    // A streamed body with no declared length could be any size; browsers always declare one.
    if (headers.get("transfer-encoding")) return { allowed: false, status: 411, error: "Send a Content-Length with this request." };
    return { allowed: true };
  }
  const length = Number(declared);
  const limit = maxBodyBytes(headers.get("content-type"));
  if (!Number.isFinite(length) || length < 0 || length > limit) {
    return { allowed: false, status: 413, error: limit === MAX_UPLOAD_BODY_BYTES ? "That upload is too large." : "That request is too large." };
  }
  return { allowed: true };
}

/** The body cap for a content type: photo uploads, or everything else. */
export function maxBodyBytes(contentType: string | null) {
  return (contentType ?? "").toLowerCase().startsWith("multipart/form-data") ? MAX_UPLOAD_BODY_BYTES : MAX_JSON_BODY_BYTES;
}
