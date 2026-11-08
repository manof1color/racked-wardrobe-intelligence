import type { Page, Request } from "@playwright/test";
import sharp from "sharp";
import { expect, test } from "./csp.ts";
import { expectNoSeriousViolations } from "./axe.ts";
import { answerPhotoScan, mockSignedInApi, photoScanDependencies } from "./fixtures.ts";

// "Log with a photo", driven end to end at a 375px phone width. The photo the browser prepares is
// answered by the real lib/wear-photo-scan.ts — decoding, limits, the closet matcher — with a
// fixture closet and a fake detector, and the wear request is captured rather than stored.
test.use({ viewport: { width: 375, height: 812 } });

const outfitPhoto = sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 120, g: 128, b: 140 } } }).jpeg().toBuffer();

function wearRequests(page: Page) {
  const seen: Request[] = [];
  page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/wears") seen.push(request); });
  return seen;
}

async function openPhotoLog(page: Page) {
  await page.goto("/a11y-harness?role=consumer&view=home");
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
  // The install tip shows half a second after a page opens in a browser tab. Dismiss it first, as a
  // person would, since the dialog's backdrop covers it once open.
  await page.getByRole("button", { name: "Dismiss installation tip" }).click({ timeout: 5_000 }).catch(() => undefined);
  await page.getByRole("button", { name: "Log with a photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Log today’s outfit from a photo." });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function takePhoto(dialog: ReturnType<Page["getByRole"]>) {
  await dialog.locator('input[type="file"][capture]').setInputFiles({ name: "outfit.jpg", mimeType: "image/jpeg", buffer: await outfitPhoto });
}

async function noSideways(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

test("log with a photo: suggestions from your own closet, swapped and confirmed, then one ordinary wear", async ({ page }, testInfo) => {
  await mockSignedInApi(page);
  const wears = wearRequests(page);
  const dialog = await openPhotoLog(page);
  await expect(dialog.getByText("does not save it")).toBeVisible();
  await takePhoto(dialog);

  const rows = dialog.locator(".wear-photo-row");
  await expect(rows).toHaveCount(4);
  // Two strong matches are preselected; the unsure jacket and the sneakers are not.
  await expect(rows.nth(0).getByRole("radio", { name: /Ribbed white tee/ })).toBeChecked();
  await expect(rows.nth(1).getByRole("radio", { name: /Indigo straight jean/ })).toBeChecked();
  await expect(rows.nth(2).getByText("Not sure which piece this is")).toBeVisible();
  await expect(rows.nth(2).getByRole("radio", { name: "Leave this out" })).toBeChecked();
  await expect(rows.nth(3).getByText("No match in your closet")).toBeVisible();
  await expect(rows.nth(3).getByRole("radio")).toHaveCount(1);
  expect(wears, "scanning records nothing").toHaveLength(0);
  await noSideways(page);
  await expectNoSeriousViolations(page, testInfo, "log with a photo, confirm screen");

  // Confirm the jacket, take the tee out, and add a shirt by hand.
  await rows.nth(2).getByRole("radio", { name: /Olive utility jacket/ }).check();
  await rows.nth(0).getByRole("radio", { name: "Leave this out" }).check();
  await dialog.getByText("Add another piece by hand").click();
  const manual = dialog.locator(".wear-photo-manual");
  await expect(manual.getByRole("checkbox", { name: /Indigo straight jean/ })).toBeDisabled();
  await manual.getByRole("checkbox", { name: /Navy poplin shirt/ }).check();
  expect(wears).toHaveLength(0);
  await noSideways(page);

  await dialog.getByRole("button", { name: "Record 3 pieces as worn today" }).click();
  await expect(dialog).toHaveCount(0);
  expect(wears).toHaveLength(1);
  const body = wears[0].postDataJSON() as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["itemIds", "localDate", "requestId"]);
  expect(body.itemIds).toEqual(["w2", "w6", "w5"]);
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("status").filter({ hasText: "Recorded 3 pieces as worn today." })).toBeVisible();
});

test("log with a photo: when the AI is paused, picking by hand is right there", async ({ page }, testInfo) => {
  await mockSignedInApi(page);
  await page.route("**/api/wears/photo", route => answerPhotoScan(route, photoScanDependencies({ spendSiteModelCall: async () => false })));
  const wears = wearRequests(page);
  const dialog = await openPhotoLog(page);
  await takePhoto(dialog);
  await expect(dialog.getByRole("status")).toContainText("paused for today");
  await expect(dialog.getByText("Choose the pieces you wore")).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "log with a photo, AI paused");
  await dialog.getByRole("checkbox", { name: /Ribbed white tee/ }).check();
  await dialog.getByRole("checkbox", { name: /Indigo straight jean/ }).check();
  await dialog.getByRole("button", { name: "Record 2 pieces as worn today" }).click();
  expect(wears).toHaveLength(1);
  expect((wears[0].postDataJSON() as { itemIds: string[] }).itemIds).toEqual(["w1", "w2"]);
});

test("log with a photo: nothing found, a failed upload, or a closed dialog never records a wear", async ({ page }) => {
  await mockSignedInApi(page);
  const wears = wearRequests(page);

  await page.route("**/api/wears/photo", route => answerPhotoScan(route, photoScanDependencies({ detect: async () => [] })));
  let dialog = await openPhotoLog(page);
  await takePhoto(dialog);
  await expect(dialog.getByRole("status")).toContainText("could not find clothing");
  await expect(dialog.getByText("Choose the pieces you wore")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.unroute("**/api/wears/photo");
  await page.route("**/api/wears/photo", route => route.abort("failed"));
  dialog = await openPhotoLog(page);
  await takePhoto(dialog);
  await expect(dialog.getByRole("status")).toContainText("by hand");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  expect(wears).toHaveLength(0);
  // Manual logging is still the same panel it was.
  await page.getByRole("button", { name: "Log today's outfit" }).click();
  await expect(page.getByText("Or choose the pieces (up to 10)")).toBeVisible();
});
