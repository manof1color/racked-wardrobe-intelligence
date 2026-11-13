import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * One way to say "there is nothing here yet": an icon, a short heading, one line on what to do
 * next, and at most one action. Empty views used to differ from screen to screen (a bare heading,
 * a page-sized poster, or a second accent button competing with the page's own main button).
 * Actions here are never accent buttons: the page heading keeps the one main action.
 */
export function EmptyState({ icon, title, children, action, headingLevel = 3 }: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className="empty-state">
    <span className="empty-state-icon" aria-hidden="true"><Icon name={icon} size={26}/></span>
    <Heading>{title}</Heading>
    {children && <p>{children}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>;
}

/**
 * Placeholders shaped like the content on its way, so the page keeps its layout while it loads
 * instead of showing a line of text and then jumping. The shapes are hidden from assistive
 * technology; the label is announced once as a status.
 */
export function LoadingPlaceholder({ label, shape, count = 6 }: { label: string; shape: "garments" | "cards" | "lines"; count?: number }) {
  return <div className={`skeleton skeleton-${shape}`} role="status">
    <span className="sr-only">{label}</span>
    {shape === "lines"
      ? <div className="skeleton-text" aria-hidden="true"><i/><i/><i/></div>
      : <div className="skeleton-grid" aria-hidden="true">{Array.from({ length: count }, (_, index) => <div key={index} className="skeleton-card"><i className="skeleton-block"/><i/><i/></div>)}</div>}
  </div>;
}
