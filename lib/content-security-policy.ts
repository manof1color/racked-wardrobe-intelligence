/**
 * The Content Security Policy, built per page request with a fresh nonce (middleware.ts).
 *
 * Scripts run only if they carry this request's nonce, or were loaded by one that does
 * ('strict-dynamic'), so an injected <script> or inline handler does not run. Next.js reads the
 * nonce from the request's Content-Security-Policy header and puts it on its own scripts; the
 * root layout passes it to the install-prompt capture. A nonce exists only on a rendered request,
 * which is why every page is now rendered on demand rather than prerendered.
 *
 * Styles keep 'unsafe-inline': React writes style attributes, and moving them is separate work
 * (SECURITY.md, "Still open").
 */

export type CspMode = "enforce" | "report";

/** Enforced unless RACKED_CSP_MODE is exactly "report": the rollback switch, never the default. */
export function cspMode(value: string | undefined): CspMode {
  return value === "report" ? "report" : "enforce";
}

/** The response header that carries the policy in each mode. */
export function cspHeaderName(mode: CspMode) {
  return mode === "report" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/** Any amazonaws.com host: the fallback when the bucket's own host cannot be worked out. */
export const ANY_S3_IMAGE_SOURCE = "https://*.amazonaws.com";

/**
 * Where private photos load from. Presigned links come from an S3Client built with only a region
 * (lib/server/production-store.ts), which signs virtual-hosted URLs:
 * https://<bucket>.s3.<region>.amazonaws.com/<key>. A bucket name with a dot, or any name that is
 * not a plain DNS label, is signed path-style instead, and the bucket is unknown in a build without
 * it, so both fall back to the wildcard rather than block the photos.
 */
export function uploadImageSource(bucket: string | undefined, region: string | undefined) {
  const name = (bucket ?? "").trim();
  const where = (region ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name) || !/^[a-z]{2}(-[a-z]+)+-\d$/.test(where)) return ANY_S3_IMAGE_SOURCE;
  return `https://${name}.s3.${where}.amazonaws.com`;
}

/** A fresh, unguessable nonce for one request. */
export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function contentSecurityPolicy({ nonce, development, imageSource }: { nonce: string; development: boolean; imageSource: string }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Private garment photographs are served through short-lived S3 links.
    `img-src 'self' data: blob: ${imageSource}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "report-uri /api/security/csp-report",
  ].join("; ");
}
