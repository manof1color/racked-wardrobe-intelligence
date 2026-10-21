/**
 * The first check every API request meets, before any route code runs.
 *
 * Two attacks are stopped here rather than in each of the app's routes:
 *
 * - **Cross-site request forgery.** A page on another site can make a signed-in person's browser
 *   send a POST to Racked. Session cookies are already SameSite=Lax, which blocks most of these;
 *   this is the second lock. A state-changing request must come from Racked's own pages, judged by
 *   the Origin header browsers attach — and when a browser sends no Origin, by Sec-Fetch-Site.
 *   A client that is not a browser cannot carry anyone's cookies, so it gains nothing here.
 * - **Oversized bodies.** A route that parses a request reads all of it into memory first, so an
 *   enormous body is a cheap way to exhaust a server. Bodies are capped by what the app actually
 *   sends: three 5 MB product photos at most, and a few kilobytes of JSON otherwise.
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
  /** The site's public address, in case the hosting layer forwards requests under an internal host. */
  siteUrl?: string;
}

export type GuardDecision = { allowed: true } | { allowed: false; status: 403 | 411 | 413; error: string };

const firstHost = (value: string | null) => (value ? value.split(",")[0].trim().toLowerCase() : "");

function originHost(origin: string) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Hosts this request was addressed to, as the browser saw them. */
function requestHosts(request: GuardRequest) {
  const site = request.siteUrl ? originHost(request.siteUrl) : null;
  return new Set([firstHost(request.headers.get("host")), firstHost(request.headers.get("x-forwarded-host")), site ?? ""].filter(Boolean));
}

export function guardRequest(request: GuardRequest): GuardDecision {
  const method = request.method.toUpperCase();
  if (!MUTATING.has(method)) return { allowed: true };
  const { headers } = request;

  if (!ORIGIN_EXEMPT_PATHS.has(request.pathname)) {
    const origin = headers.get("origin");
    if (origin) {
      const host = origin === "null" ? null : originHost(origin);
      if (!host || !requestHosts(request).has(host)) {
        return { allowed: false, status: 403, error: "This request must come from Racked itself." };
      }
    } else if ((headers.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
      return { allowed: false, status: 403, error: "This request must come from Racked itself." };
    }
  }

  const declared = headers.get("content-length");
  if (declared === null) {
    // A streamed body with no declared length could be any size; browsers always declare one.
    if (headers.get("transfer-encoding")) return { allowed: false, status: 411, error: "Send a Content-Length with this request." };
    return { allowed: true };
  }
  const length = Number(declared);
  const upload = (headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data");
  const limit = upload ? MAX_UPLOAD_BODY_BYTES : MAX_JSON_BODY_BYTES;
  if (!Number.isFinite(length) || length < 0 || length > limit) {
    return { allowed: false, status: 413, error: upload ? "That upload is too large." : "That request is too large." };
  }
  return { allowed: true };
}
