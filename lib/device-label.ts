/**
 * A plain description of the browser behind a request — "Safari on iPhone" — for the account
 * activity log. Enough for a person to recognise their own devices and spot one that isn't theirs;
 * deliberately not a fingerprint. No IP address or location is ever stored with it.
 */
export function deviceLabel(userAgent: string | null | undefined) {
  const agent = String(userAgent ?? "");
  if (!agent) return "Unknown device";
  const platform =
    /iPhone/.test(agent) ? "iPhone"
    : /iPad/.test(agent) ? "iPad"
    : /Android/.test(agent) ? "Android"
    : /Windows/.test(agent) ? "Windows"
    : /Mac OS X|Macintosh/.test(agent) ? "Mac"
    : /CrOS/.test(agent) ? "ChromeOS"
    : /Linux/.test(agent) ? "Linux"
    : "";
  const browser =
    /Edg\//.test(agent) ? "Edge"
    : /OPR\/|Opera/.test(agent) ? "Opera"
    : /SamsungBrowser/.test(agent) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(agent) ? "Firefox"
    : /Chrome\/|CriOS/.test(agent) ? "Chrome"
    : /Safari\//.test(agent) ? "Safari"
    : "";
  if (browser && platform) return `${browser} on ${platform}`;
  return browser || platform || "Unknown device";
}

export type AccountActivityType =
  | "sign-in"
  | "sign-in-failed"
  | "account-created"
  | "password-changed"
  | "password-reset"
  | "details-updated"
  | "signed-out-everywhere"
  | "brand-sharing-on"
  | "brand-sharing-off"
  | "two-step-on"
  | "two-step-off"
  | "two-step-failed"
  | "recovery-code-used"
  | "recovery-codes-replaced";

export interface AccountActivity {
  type: AccountActivityType;
  at: string;
  device: string;
}

/** How each event reads in Settings. */
export const ACTIVITY_LABELS: Record<AccountActivityType, string> = {
  "sign-in": "Signed in",
  "sign-in-failed": "Failed sign-in attempt",
  "account-created": "Account created",
  "password-changed": "Password changed",
  "password-reset": "Password reset by email link",
  "details-updated": "Name or email changed",
  "signed-out-everywhere": "Signed out of all other devices",
  "brand-sharing-on": "Anonymous brand insights turned on",
  "brand-sharing-off": "Anonymous brand insights turned off",
  "two-step-on": "Two-step sign-in turned on",
  "two-step-off": "Two-step sign-in turned off",
  "two-step-failed": "Correct password, wrong two-step code",
  "recovery-code-used": "Signed in with a recovery code",
  "recovery-codes-replaced": "New recovery codes created",
};

/** Events that suggest someone else is trying the account, shown as warnings. */
export const WARNING_ACTIVITY: ReadonlySet<AccountActivityType> = new Set(["sign-in-failed", "two-step-failed"]);

/** Activity is kept for 90 days, then expires. */
export const ACTIVITY_RETENTION_DAYS = 90;
