import type { DemoKind } from "@/lib/demo-session";

/** A slim strip above a demo session's workspace, so nobody mistakes made-up data for real (lib/demo-session.ts). */
export function DemoNotice({ kind }: { kind: DemoKind }) {
  return <div className="demo-notice" role="note">
    <strong>DEMO</strong>
    <span>{kind === "consumer"
      ? "A made-up wardrobe, just for you. Scan, log and change anything: it's gone after a day."
      : "A made-up brand, read-only so everyone sees the same one."}</span>
  </div>;
}
