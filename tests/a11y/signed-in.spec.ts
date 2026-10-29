import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousViolations } from "./axe.ts";
import { mockSignedInApi, PIXEL_PNG } from "./fixtures.ts";

// Signed-in screens rendered by /a11y-harness with fixture data: no account, no session, and no
// request leaves the test browser for a data store.
test.beforeEach(async ({ page }) => { await mockSignedInApi(page); });

async function openConsumer(page: Page, view: string) {
  await page.goto(`/a11y-harness?role=consumer&view=${view}`);
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
}

async function openBrand(page: Page, view: string) {
  await page.goto(`/a11y-harness?role=brand&view=${view}`);
  await expect(page.getByText("Loading your catalog")).toHaveCount(0);
}

for (const view of ["home", "looks", "closet", "outfits"]) {
  test(`axe: consumer ${view}`, async ({ page }, testInfo) => {
    await openConsumer(page, view);
    await expectNoSeriousViolations(page, testInfo, `consumer ${view}`);
  });
}

test("axe: consumer closet with a piece open for editing", async ({ page }, testInfo) => {
  await openConsumer(page, "closet");
  await page.getByRole("button", { name: /^Edit piece:/ }).first().click();
  await expectNoSeriousViolations(page, testInfo, "consumer closet editor");
});

test("axe: scan review cards", async ({ page }, testInfo) => {
  await page.goto("/a11y-harness?role=consumer&view=home&add=1");
  await page.getByRole("dialog").locator('input[type="file"][multiple]').setInputFiles({ name: "look.png", mimeType: "image/png", buffer: PIXEL_PNG });
  await expect(page.locator(".intake-card")).toHaveCount(3);
  await expectNoSeriousViolations(page, testInfo, "scan review cards");
});

test("axe: consumer Hanger with a reply", async ({ page }, testInfo) => {
  await openConsumer(page, "home");
  await page.getByRole("button", { name: /Ask Hanger/ }).click();
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await hanger.getByRole("textbox").fill("What should I wear today?");
  await hanger.getByRole("textbox").press("Enter");
  await expect(hanger.getByText("Here is an outfit from pieces you already own")).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "consumer Hanger");
});

for (const view of ["overview", "catalog", "looks"]) {
  test(`axe: brand ${view}`, async ({ page }, testInfo) => {
    await openBrand(page, view);
    await expectNoSeriousViolations(page, testInfo, `brand ${view}`);
  });
}

test("axe: brand product metrics and Brand Hanger", async ({ page }, testInfo) => {
  await openBrand(page, "catalog");
  await page.getByRole("button", { name: /Fixture straight jean/ }).click();
  await expect(page.getByText("CONFIRMED WEARS", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "brand product metrics");
  await page.getByRole("button", { name: /Ask Hanger/ }).click();
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await hanger.getByRole("textbox").fill("How is repeat wear?");
  await hanger.getByRole("textbox").press("Enter");
  await expect(hanger.getByText("Repeat wear is strong")).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "Brand Hanger");
});

test("the harness falls back to the consumer landing view for a role or view it does not know", async ({ page }) => {
  const response = await page.goto("/a11y-harness?role=admin&view=anything");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your wardrobe");
});
