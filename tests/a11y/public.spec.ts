import { expect, test } from "./csp.ts";
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

test("axe: a member's Community profile, opened from their name, with a Back button", async ({ page }, testInfo) => {
  await page.route("**/api/community/images/**", request => request.fulfill({ status: 404 }));
  await page.goto("/community", { waitUntil: "networkidle" });
  await page.locator('.cpost-who a[href^="/community/people/"]').first().click();
  await page.waitForURL("**/community/people/**");
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("fixture_stylist");
  await expectNoSeriousViolations(page, testInfo, "community profile");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForURL("**/community");
});

// The policy is enforced, with a fresh nonce on every page response, and every script Next.js
// writes into the page carries it.
test("every page is served an enforced policy with a nonce of its own", async ({ page, request, cspViolations }) => {
  const nonces = new Set<string>();
  for (const route of PUBLIC_ROUTES) {
    const response = await request.get(route);
    const policy = response.headers()["content-security-policy"] ?? "";
    expect(response.headers()["content-security-policy-report-only"], route).toBeUndefined();
    const nonce = policy.match(/script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/)?.[1];
    expect(nonce, `${route}: ${policy}`).toBeTruthy();
    expect(policy).not.toMatch(/script-src[^;]*unsafe/);
    nonces.add(nonce!);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => match[0]);
    expect(scripts.length, route).toBeGreaterThan(0);
    for (const script of scripts) expect(script, route).toContain(`nonce="${nonce}"`);
  }
  expect(nonces.size, "a nonce is never reused").toBe(PUBLIC_ROUTES.length);
  // Markup injected into a served page, as stored cross-site scripting would be: an inline script
  // and an event handler without the nonce. Neither runs, and both are reported.
  await page.route("**/pricing", async route => {
    const original = await route.fetch();
    const html = (await original.text()).replace("</body>", '<script>window.__injected = "script"</script><img src="data:," onerror="window.__injected = \'handler\'"></body>');
    await route.fulfill({ response: original, body: html });
  });
  await page.goto("/pricing");
  await expect.poll(() => cspViolations.length).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { __injected?: string }).__injected ?? null), "injected code must not run").toBeNull();
  expect([...new Set(cspViolations.map(violation => violation.directive))].sort()).toEqual(["script-src-attr", "script-src-elem"]);
  // That one was the point of this check; the fixture's count of 0 still holds for everything else.
  cspViolations.length = 0;
});
