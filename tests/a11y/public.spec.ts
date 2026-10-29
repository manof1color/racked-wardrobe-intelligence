import { test } from "@playwright/test";
import { expectNoSeriousViolations } from "./axe.ts";

// Signed-out pages, served exactly as `next start` serves them. /community reads its posts from
// the local fixture store, never from a real table.
export const PUBLIC_ROUTES = ["/", "/pricing", "/privacy", "/terms", "/login", "/community"];

for (const route of PUBLIC_ROUTES) {
  test(`axe: ${route}`, async ({ page }, testInfo) => {
    await page.route("**/api/community/images/**", request => request.fulfill({ status: 404 }));
    await page.goto(route, { waitUntil: "networkidle" });
    await expectNoSeriousViolations(page, testInfo, route);
  });
}
