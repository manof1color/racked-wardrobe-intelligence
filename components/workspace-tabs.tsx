import Link from "next/link";
import type { Role } from "@/lib/types";
import { BRAND_TABS, CONSUMER_TABS, brandViewPath, consumerViewPath } from "@/lib/workspace-navigation";
import { Icon } from "./icons";

/**
 * The workspace tab row, for pages outside the dashboard (Community). The dashboard switches views
 * in place; this row links back to each view, with Community marked as the current page.
 *
 * REGRESSION: on a computer, choosing Community left the tab row behind, so getting back to Today,
 * Looks, Closet or Outfits took the header link or the browser's Back button. Phones kept their
 * bottom tab bar, which is why it only showed on desktop.
 */
export function CommunityWorkspaceTabs({ role }: { role: Role }) {
  if (role === "brand") return <nav className="workspace-tabs brand-view-tabs community-workspace-tabs" aria-label="Brand workspace views">
    {BRAND_TABS.map(tab => <Link key={tab.id} href={brandViewPath(tab.id)}>{tab.label}</Link>)}
    <Link className="active" href="/community" aria-current="page">Community</Link>
  </nav>;
  return <nav className="consumer-view-tabs community-workspace-tabs" aria-label="Consumer app views">
    {CONSUMER_TABS.map(tab => <Link key={tab.id} href={consumerViewPath(tab.id)}><Icon name={tab.icon} size={16}/>{tab.label}</Link>)}
    <Link className="active" href="/community" aria-current="page"><Icon name="community" size={16}/>Community</Link>
  </nav>;
}
