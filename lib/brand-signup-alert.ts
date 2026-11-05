/**
 * The email the owner gets when someone registers a brand account, so a pending brand is never left
 * waiting unseen (docs/brand-approval.md). It names the brand, the address it registered with and
 * the command that approves it. It is sent only to the owner's own addresses
 * (RACKED_BRAND_ALERT_TO), never to the person registering, and carries no password or link.
 */

/** At most this many owner addresses, so a mistyped setting cannot become a mailing list. */
export const MAX_ALERT_RECIPIENTS = 3;

/** The owner addresses an alert goes to, from a comma-separated setting. Empty means alerts are off. */
export function alertRecipients(configured: string | undefined) {
  return (configured ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(address))
    .slice(0, MAX_ALERT_RECIPIENTS);
}

/** Text typed by the person registering, made safe for one line of an email: no line breaks, bounded. */
function oneLine(value: string, max: number) {
  const flat = value.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function brandSignupAlert(input: { accountId: string; brandName: string; email: string; createdAt: string }) {
  const brand = oneLine(input.brandName, 80) || "(no brand name)";
  const email = oneLine(input.email, 254);
  return {
    subject: `Racked: new brand account waiting for approval — ${brand}`,
    body: [
      "A new brand account is waiting for your approval. Until you approve it, it can sign in but cannot enrol products, publish Looks or see any wear data.",
      "",
      `Brand name: ${brand}`,
      `Registered with: ${email}`,
      `Registered at: ${input.createdAt}`,
      `Account id: ${input.accountId}`,
      "",
      "Before approving, check that the address is on the brand's own domain and that the brand is real and not a near-copy of another (docs/brand-approval.md).",
      "",
      "To approve it, run on your computer after `aws login --profile racked-benchmark`:",
      `  pnpm brands:approve ${input.accountId}`,
      "To see everything waiting: pnpm brands:pending",
      "",
      "Nothing needs doing if this registration is not genuine: a pending account can see nothing about anyone. To refuse it outright: pnpm brands:revoke " + input.accountId,
    ].join("\n"),
  };
}
