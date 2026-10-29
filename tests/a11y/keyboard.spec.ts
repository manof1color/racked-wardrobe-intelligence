import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockSignedInApi, PIXEL_PNG } from "./fixtures.ts";

// Keyboard-only passes through both demo flows. Nothing is clicked: every step is Tab, Shift+Tab,
// Enter, Space, or Escape, and every stop must show a focus ring the person can see.
test.beforeEach(async ({ page }) => { await mockSignedInApi(page); });

const MAX_TABS = 80;

/** Presses Tab until the target has focus. With `within`, focus must never leave that dialog. */
async function tabTo(page: Page, target: Locator, within?: Locator) {
  for (let presses = 0; presses < MAX_TABS; presses++) {
    await page.keyboard.press("Tab");
    if (within) expect(await within.evaluate(dialog => dialog.contains(document.activeElement)), "focus left the open dialog").toBe(true);
    if (await target.evaluate(element => element === document.activeElement)) {
      await expectVisibleFocus(page);
      return;
    }
  }
  throw new Error(`${target} was not reached within ${MAX_TABS} presses of Tab`);
}

/** The focused control, or the visible control standing in for a transparent one, draws a ring. */
async function expectVisibleFocus(page: Page) {
  const problem = await page.evaluate(() => {
    let element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return "nothing has focus";
    if (getComputedStyle(element).opacity === "0") element = element.closest("label");
    if (element?.matches(".hanger-composer textarea")) element = element.closest(".hanger-composer");
    if (!element) return "a transparent control has no visible label";
    const style = getComputedStyle(element);
    const ring = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none";
    return ring ? "" : `no visible focus indicator on ${element.outerHTML.slice(0, 120)}`;
  });
  expect(problem).toBe("");
}

test("consumer: scan → confirm → Hanger, by keyboard alone", async ({ page }) => {
  await page.goto("/a11y-harness?role=consumer&view=home");
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);

  const addClothing = page.getByRole("button", { name: "+ Add clothing" });
  await tabTo(page, addClothing);
  await page.keyboard.press("Enter");
  const intake = page.getByRole("dialog", { name: "Add clothing to your wardrobe." });
  await expect(intake).toBeFocused();

  // The library picker is a real file input under a styled label; Space opens the chooser.
  await tabTo(page, intake.locator('input[type="file"][multiple]'), intake);
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Space");
  await (await chooser).setFiles({ name: "look.png", mimeType: "image/png", buffer: PIXEL_PNG });
  await expect(intake.locator(".intake-card")).toHaveCount(3);

  // The third piece needs a label; leave it out, confirm the other two, and save.
  await tabTo(page, intake.getByRole("checkbox", { name: "Include piece 3" }), intake);
  await page.keyboard.press("Space");
  await tabTo(page, intake.getByRole("checkbox", { name: /These are pieces in my wardrobe/ }), intake);
  await page.keyboard.press("Space");
  await tabTo(page, intake.getByRole("button", { name: "Add 2 pieces" }), intake);
  await page.keyboard.press("Enter");
  await expect(intake).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("2 separate wardrobe pieces were created");
  await expect(addClothing, "closing the dialog returns focus to what opened it").toBeFocused();

  const launcher = page.getByRole("button", { name: "Ask Hanger" });
  await tabTo(page, launcher);
  await page.keyboard.press("Enter");
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await expect(hanger).toBeFocused();
  await tabTo(page, hanger.getByRole("textbox"), hanger);
  await page.keyboard.type("What should I wear today?");
  await page.keyboard.press("Enter");
  await expect(hanger.getByText("Here is an outfit from pieces you already own")).toBeVisible();
  await tabTo(page, hanger.getByRole("button", { name: "Wear today" }), hanger);
  await page.keyboard.press("Enter");
  await expect(hanger.getByText("2 outfit pieces were recorded as worn.")).toBeVisible();

  // Tab keeps cycling inside the drawer, in both directions, until Escape closes it.
  for (let presses = 0; presses < 30; presses++) {
    await page.keyboard.press(presses % 3 === 2 ? "Shift+Tab" : "Tab");
    expect(await hanger.evaluate(dialog => dialog.contains(document.activeElement)), "focus left the Hanger drawer").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(hanger).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("brand: product → metrics → Brand Hanger, by keyboard alone", async ({ page }) => {
  await page.goto("/a11y-harness?role=brand&view=overview");
  await expect(page.getByText("Loading your catalog")).toHaveCount(0);

  await tabTo(page, page.getByRole("navigation", { name: "Brand workspace views" }).getByRole("button", { name: "Catalog" }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: /Fixture straight jean/ }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("CONFIRMED WEARS", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture straight jean" }), "opening a product moves focus to it").toBeFocused();

  await tabTo(page, page.getByRole("button", { name: /Download aggregate CSV/ }));
  const launcher = page.getByRole("button", { name: "Ask Hanger" });
  await tabTo(page, launcher);
  await page.keyboard.press("Enter");
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await expect(hanger).toBeFocused();
  await tabTo(page, hanger.getByRole("textbox"), hanger);
  await page.keyboard.type("How is repeat wear?");
  await page.keyboard.press("Enter");
  await expect(hanger.getByText("Repeat wear is strong")).toBeVisible();
  await tabTo(page, hanger.getByRole("button", { name: "Draft a strategy brief" }), hanger);
  await page.keyboard.press("Enter");
  await expect(hanger.getByText("A privacy-safe strategy brief was added to the conversation.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(hanger).toBeHidden();
  await expect(launcher).toBeFocused();
});
