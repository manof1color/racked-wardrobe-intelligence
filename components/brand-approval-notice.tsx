import Link from "next/link";
import { BRAND_STATUS_MESSAGES, type BrandStatus } from "@/lib/brand-approval";

/**
 * What a brand account sees instead of its dashboard until the owner approves it, or after its
 * access is withdrawn. Settings stay open, so it can still change its details and turn on two-step
 * sign-in while it waits.
 */
export function BrandApprovalNotice({ status, brandName }: { status: Exclude<BrandStatus, "approved">; brandName: string | null }) {
  return <main className="auth-shell">
    <Link className="wordmark auth-logo" href="/">RACKED<span>.</span></Link>
    <section className="auth-card" aria-labelledby="brand-approval-title">
      <div className="eyebrow">{status === "pending" ? "BRAND ACCOUNT UNDER REVIEW" : "BRAND ACCESS WITHDRAWN"}</div>
      <h1 id="brand-approval-title">{status === "pending" ? "Almost there." : "Access withdrawn."}</h1>
      {brandName && <p><strong>{brandName}</strong></p>}
      <p>{BRAND_STATUS_MESSAGES[status]}</p>
      {status === "pending" && <p>Racked reviews new brand accounts so that only a brand&rsquo;s real team can add its products and see how they are worn. Consumers&rsquo; wardrobes stay private either way.</p>}
      <Link className="button button-accent button-full" href="/settings">Open account settings</Link>
    </section>
  </main>;
}
