/**
 * Reduces a browser's Content Security Policy violation report to what is needed to tune the
 * policy: which directive fired, which host was blocked, and which page path it happened on. Full
 * URLs carry query strings and private image-link signatures, so only hosts and paths are kept.
 * Accepts both the older `application/csp-report` body and the Reporting API's array form.
 */
export interface CspViolationSummary {
  directive: string;
  blockedHost: string;
  pagePath: string;
}

const MAX_REPORT_LENGTH = 16 * 1024;

const clip = (value: unknown, length: number) => (typeof value === "string" ? value.slice(0, length) : "");

function hostOf(value: string) {
  if (!value) return "";
  if (!value.includes(":")) return value.slice(0, 40); // keywords such as "inline" or "eval"
  try {
    return new URL(value).host.slice(0, 120) || value.split(":")[0].slice(0, 20);
  } catch {
    return value.split(":")[0].slice(0, 20);
  }
}

function pathOf(value: string) {
  try {
    return new URL(value).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

export function cspViolationSummary(body: string): CspViolationSummary | null {
  if (!body || body.length > MAX_REPORT_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const entry = Array.isArray(parsed) ? (parsed[0] as { body?: unknown })?.body : (parsed as { "csp-report"?: unknown })?.["csp-report"];
  if (!entry || typeof entry !== "object") return null;
  const report = entry as Record<string, unknown>;
  const directive = clip(report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"], 60);
  if (!directive) return null;
  return {
    directive,
    blockedHost: hostOf(clip(report["blocked-uri"] ?? report.blockedURL, 500)),
    pagePath: pathOf(clip(report["document-uri"] ?? report.documentURL, 500)),
  };
}
