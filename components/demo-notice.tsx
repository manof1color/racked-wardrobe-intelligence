import { DEMO_BRAND_PRODUCT_LIMIT, type DemoKind } from "@/lib/demo-session";

/**
 * A slim strip above a demo session's workspace, so nobody mistakes made-up data for real
 * (lib/demo-session.ts). `own` is a brand demo of the visitor's own (New Brand), not the shared one.
 */
export function DemoNotice({ kind, own = false }: { kind: DemoKind; own?: boolean }) {
  return <div className="demo-notice" role="note">
    <strong>DEMO</strong>
    <span>{kind === "consumer"
      ? "A made-up wardrobe, just for you. Scan, log and change anything: it's gone after a day."
      : own
        ? `A made-up brand, just for you. Enrol up to ${DEMO_BRAND_PRODUCT_LIMIT} products: they stay out of every public list and are gone after a day.`
        : "A made-up brand, read-only so everyone sees the same one."}</span>
  </div>;
}
