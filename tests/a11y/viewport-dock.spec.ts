import type { Page } from "@playwright/test";
import { expect, test } from "./csp.ts";
import { mockSignedInApi } from "./fixtures.ts";

// iOS can keep a keyboard-shortened height for both the layout and the visual viewport after the
// keyboard closes or the app is resumed, which stranded the tab bar and the guide part-way up the
// screen. A browser cannot be made to do that for real, so the stale numbers are imposed here.
async function strand(page: Page, height: number) {
  await page.evaluate((short) => {
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => short });
    const viewport = window.visualViewport;
    if (viewport) Object.defineProperty(viewport, "height", { configurable: true, get: () => short });
    window.dispatchEvent(new Event("resize"));
  }, height);
}
const shift = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dock-shift").trim());

test("REGRESSION: a viewport left at a keyboard-shortened height brings the tab bar back down", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the tab bar and this correction are for touch screens");
  await mockSignedInApi(page);
  await page.goto("/a11y-harness?role=consumer&view=closet");
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
  const full = await page.evaluate(() => window.innerHeight);
  await expect.poll(() => shift(page)).toBe("0px");
  await strand(page, full - 330);
  await expect.poll(() => shift(page)).toBe("330px");
  // A real keyboard is left alone: typing is when the visible area is meant to be short.
  await page.evaluate(() => { const input = document.createElement("input"); input.id = "probe"; document.body.append(input); input.focus(); window.dispatchEvent(new Event("resize")); });
  await expect.poll(() => shift(page)).toBe("0px");
  await page.evaluate(() => { document.getElementById("probe")?.remove(); window.dispatchEvent(new Event("resize")); });
  await expect.poll(() => shift(page)).toBe("330px");
  // A toolbar showing or hiding is a small change, not a stranded viewport.
  await strand(page, full - 90);
  await expect.poll(() => shift(page)).toBe("0px");
});

test("a narrower desktop window never moves the dock", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a fine pointer has no on-screen keyboard");
  await mockSignedInApi(page);
  await page.goto("/a11y-harness?role=consumer&view=closet");
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
  const full = await page.evaluate(() => window.innerHeight);
  await strand(page, full - 330);
  await page.waitForTimeout(300);
  expect(await shift(page)).toBe("0px");
});
