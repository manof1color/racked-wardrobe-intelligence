/**
 * The addresses Racked trusts as itself, from explicit configuration — never from a request.
 *
 * Two security decisions need "is this Racked?": whether a state-changing browser request came
 * from Racked's own pages (the request guard), and which address to put in a password-reset link.
 * Both used to fall back to the request's own Host or X-Forwarded-Host, which a client can
 * influence: a reset link built from a forged host sends the victim's valid token to an attacker's
 * site. The answer now comes only from this list.
 *
 * The production address is written here so that a missing environment variable can never block
 * every request: production had no `NEXT_PUBLIC_SITE_URL` set when this was written. Environment
 * variables add to the list (a custom domain, a staging URL); they cannot remove the default.
 */
export const PRODUCTION_ORIGIN = "https://main.d2iv0khybuuaeh.amplifyapp.com";

/** Local development and the LAN/tunnel hosts next.config.ts already allows in dev mode. */
const DEVELOPMENT_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|[a-z0-9-]+\.ngrok(-free)?\.(app|dev|io))(:\d+)?$/i;

export interface OriginEnvironment {
  NODE_ENV?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  RACKED_PUBLIC_ORIGIN?: string;
  /** Comma-separated extra origins, e.g. a custom domain. */
  RACKED_ALLOWED_ORIGINS?: string;
}

function normalizedOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function trustedOrigins(environment: OriginEnvironment = process.env as OriginEnvironment) {
  const configured = [environment.NEXT_PUBLIC_SITE_URL, environment.RACKED_PUBLIC_ORIGIN, ...(environment.RACKED_ALLOWED_ORIGINS ?? "").split(",")];
  return new Set([PRODUCTION_ORIGIN, ...configured.map(normalizedOrigin).filter((origin): origin is string => Boolean(origin))]);
}

/** Whether `origin` (a browser's Origin header) is Racked itself. */
export function isTrustedOrigin(origin: string, environment: OriginEnvironment = process.env as OriginEnvironment) {
  const normalized = normalizedOrigin(origin);
  if (!normalized) return false;
  if (trustedOrigins(environment).has(normalized)) return true;
  // Development servers run on whatever local address they were started on.
  return environment.NODE_ENV !== "production" && DEVELOPMENT_HOST.test(new URL(normalized).host);
}

/** The one address that links in emails point at. Never derived from a request. */
export function publicOrigin(environment: OriginEnvironment = process.env as OriginEnvironment) {
  return normalizedOrigin(environment.RACKED_PUBLIC_ORIGIN) ?? normalizedOrigin(environment.NEXT_PUBLIC_SITE_URL) ?? PRODUCTION_ORIGIN;
}
