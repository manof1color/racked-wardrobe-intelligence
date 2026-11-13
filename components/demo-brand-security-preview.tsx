import { DEMO_SETTINGS_MESSAGE } from "@/lib/demo-session";
import { MAX_DISTINCT_PRODUCTS_PER_WINDOW } from "@/lib/privacy";
import { ACTIVITY_LABELS, WARNING_ACTIVITY, type AccountActivity } from "@/lib/device-label";
import type { BrandStatus } from "@/lib/brand-approval";

export interface DemoBrandPreview {
  brandStatus: BrandStatus | null;
  /** Distinct products opened in the current window, or null when it could not be read. */
  activity: AccountActivity[];
  /** The server's clock, so the relative times below render the same on the server and in the browser. */
  now: number;
}

const STATUS_LABELS: Record<BrandStatus, string> = { approved: "Approved", pending: "Waiting for approval", revoked: "Revoked" };

function ago(at: string, now: number) {
  const hours = Math.max(0, (now - Date.parse(at)) / 3_600_000);
  if (hours < 1) return "within the hour";
  if (hours < 24) return `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * The demo brand's security settings, shown and not changeable. The demo brand is one shared account,
 * so nothing here may change what the next judge sees or the named account's own sign-in: the
 * two-step panel is a picture of its "on" state with no secret behind it, every control is disabled,
 * and the activity log is made up (lib/demo-session.ts). The approval status is the account's real
 * one; the product budget card explains a rule demo brands are exempt from.
 */
export function DemoBrandSecurityPreview({ preview }: { preview: DemoBrandPreview }) {
  const note = <p className="account-activity-intro" id="demo-settings-note">{DEMO_SETTINGS_MESSAGE}</p>;
  return <>
    <section className="settings-card" aria-labelledby="demo-two-step-title" data-demo-preview="two-step">
      <div className="eyebrow">SIGN-IN PROTECTION · DEMO PREVIEW</div>
      <h2 id="demo-two-step-title">Two-step sign-in.</h2>
      <p className="account-activity-intro">A brand can ask for a code from an authenticator app on its phone as well as the password, so a leaked password alone can&rsquo;t open the workspace. This is how it looks when it is on.</p>
      <div className="two-step-status">
        <span className="two-step-pill on">ON</span>
        <span>8 of 10 recovery codes left</span>
      </div>
      <div className="two-step-actions">
        <button type="button" className="button button-light button-small" disabled aria-describedby="demo-settings-note">Create new recovery codes</button>
        <button type="button" className="text-button" disabled aria-describedby="demo-settings-note">Turn off</button>
      </div>
      {note}
    </section>
    <section className="settings-card" aria-labelledby="demo-approval-title" data-demo-preview="approval">
      <div className="eyebrow">BRAND APPROVAL</div>
      <h2 id="demo-approval-title">{preview.brandStatus ? STATUS_LABELS[preview.brandStatus] : "Not a brand account"}.</h2>
      <p className="account-activity-intro">A new brand waits for Racked to approve it before it can enroll products, publish Looks, or read wear data. A revoked brand is refused all of them.</p>
    </section>
    <section className="settings-card" aria-labelledby="demo-budget-title" data-demo-preview="budget">
      <div className="eyebrow">PRODUCT BUDGET</div>
      <h2 id="demo-budget-title">Not limited in the demo.</h2>
      <p className="account-activity-intro">A real brand account can open at most {MAX_DISTINCT_PRODUCTS_PER_WINDOW} different products&rsquo; wear data in 24 hours, so released totals can&rsquo;t be lined up against each other to single anyone out. Opening the same product again costs nothing. Demo brands are exempt: every figure here is made up, and one shared account must never lock the next visitor out.</p>
    </section>
    <section className="settings-card" aria-labelledby="demo-activity-title" data-demo-preview="activity">
      <div className="eyebrow">SECURITY · DEMO PREVIEW</div>
      <h2 id="demo-activity-title">Recent account activity.</h2>
      <p className="account-activity-intro">A brand sees its sign-ins, failed attempts and changes over the last 90 days, with the device each came from and never an address. These entries are made up: the demo brand is shared, and one visitor is never shown another&rsquo;s.</p>
      <ul className="account-activity-list">{preview.activity.map((entry, index) => <li key={`${entry.at}-${index}`} className={WARNING_ACTIVITY.has(entry.type) ? "account-activity-warning" : undefined}>
        <strong>{ACTIVITY_LABELS[entry.type] ?? entry.type}</strong>
        <span>{entry.device}</span>
        <time dateTime={entry.at}>{ago(entry.at, preview.now)}</time>
      </li>)}</ul>
      <div className="account-activity-actions">
        <button type="button" className="button button-light button-small" disabled aria-describedby="demo-settings-note">Sign out of all other devices</button>
      </div>
    </section>
  </>;
}
