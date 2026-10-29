import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const BLOCKING = new Set(["serious", "critical"]);

/**
 * Runs axe on the page as it stands. Every violation is attached to the report, so moderate and
 * minor findings stay visible, but only serious and critical ones fail the check.
 */
export async function expectNoSeriousViolations(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 5).map(node => node.target.join(" ")),
    nodes: violation.nodes.length,
  }));
  await testInfo.attach(`axe ${label}`, { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
  const blocking = summary.filter(violation => BLOCKING.has(violation.impact ?? ""));
  expect(blocking, `${label}: serious or critical accessibility violations`).toEqual([]);
}
